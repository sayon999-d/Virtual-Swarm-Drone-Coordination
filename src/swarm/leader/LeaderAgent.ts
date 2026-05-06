import { Drone } from '../agents/Drone';
import { Environment } from '../environment/Environment';
import { Vector2 } from '../utils/Vector2';

export type LeaderComputeMode = 'local' | 'groq';
export type LeaderCommandType = 'REGROUP' | 'EXPAND_SEARCH' | 'AVOID_HAZARDS' | 'CONSERVE_ENERGY' | 'HOLD_FORMATION';

export interface DroneTelemetryReport {
  id: string;
  role: string;
  position: Vector2;
  velocity: Vector2;
  energy: number;
  health: number;
  hazardScore: number;
  formationError: number;
  messages: string[];
}

export interface LeaderDecision {
  tick: number;
  command: LeaderCommandType;
  confidence: number;
  mode: LeaderComputeMode;
  source: 'groq' | 'local_fallback' | 'local';
  model?: string;
  fallbackReason?: string;
  target: Vector2 | null;
  summary: string;
  reportsAnalyzed: number;
  avgEnergy: number;
  avgHealth: number;
  hazardPressure: number;
  formationError: number;
}

export interface LeaderPlanningSnapshot {
  tick: number;
  formation: string;
  behavior: string;
  centroid: { x: number; y: number };
  target: { x: number; y: number } | null;
  metrics: {
    avgEnergy: number;
    avgHealth: number;
    hazardPressure: number;
    formationError: number;
    distressCount: number;
    lowEnergyCount: number;
    hazardCount: number;
  };
  reports: Array<{
    id: string;
    role: string;
    x: number;
    y: number;
    speed: number;
    energy: number;
    health: number;
    hazard: number;
    slotError: number;
    messages: string[];
  }>;
}

export class LeaderAgent {
  computeMode: LeaderComputeMode = 'groq';
  planningInterval = 180;
  lastDecision: LeaderDecision | null = null;
  lastPlanningTick = -Infinity;

  shouldPlan(tick: number) {
    return tick - this.lastPlanningTick >= this.planningInterval;
  }

  collectTelemetry(drones: Drone[], environment: Environment, target: Vector2 | null): DroneTelemetryReport[] {
    return drones.map((drone) => {
      const hazardScore = this.computeHazardScore(drone, environment);
      const finalTarget = target && drone.targetOffset ? target.add(drone.targetOffset) : target;
      const formationError = finalTarget ? drone.position.distance(finalTarget) : 0;
      const state = drone.getState();

      return {
        id: drone.id,
        role: drone.behaviorProfile,
        position: drone.position.copy(),
        velocity: drone.velocity.copy(),
        energy: drone.energy,
        health: drone.health,
        hazardScore,
        formationError,
        messages: state.messages.map((message) => message.type),
      };
    });
  }

  buildSnapshot(
    tick: number,
    formation: string,
    behavior: string,
    drones: Drone[],
    environment: Environment,
    target: Vector2 | null,
    centroid: Vector2
  ): LeaderPlanningSnapshot {
    const reports = this.collectTelemetry(drones, environment, target);
    const count = Math.max(1, reports.length);
    const avgEnergy = reports.reduce((sum, report) => sum + report.energy, 0) / count;
    const avgHealth = reports.reduce((sum, report) => sum + report.health, 0) / count;
    const hazardPressure = reports.reduce((sum, report) => sum + report.hazardScore, 0) / count;
    const formationError = reports.reduce((sum, report) => sum + report.formationError, 0) / count;

    return {
      tick,
      formation,
      behavior,
      centroid: { x: Math.round(centroid.x), y: Math.round(centroid.y) },
      target: target ? { x: Math.round(target.x), y: Math.round(target.y) } : null,
      metrics: {
        avgEnergy: Math.round(avgEnergy),
        avgHealth: Math.round(avgHealth),
        hazardPressure: Number(hazardPressure.toFixed(2)),
        formationError: Math.round(formationError),
        distressCount: reports.filter((report) => report.messages.includes('DISTRESS')).length,
        lowEnergyCount: reports.filter((report) => report.messages.includes('LOW_ENERGY')).length,
        hazardCount: reports.filter((report) => report.messages.includes('HAZARD_DETECTED')).length,
      },
      reports: reports.map((report) => ({
        id: report.id,
        role: report.role,
        x: Math.round(report.position.x),
        y: Math.round(report.position.y),
        speed: Number(report.velocity.mag().toFixed(1)),
        energy: Math.round(report.energy),
        health: Math.round(report.health),
        hazard: Number(report.hazardScore.toFixed(2)),
        slotError: Math.round(report.formationError),
        messages: report.messages,
      })),
    };
  }

  async requestGroqDecision(snapshot: LeaderPlanningSnapshot): Promise<LeaderDecision> {
    const response = await fetch('/api/leader-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      const retryAfterSeconds = typeof error.retryAfterSeconds === 'number' ? error.retryAfterSeconds : undefined;
      const message = error.error || `Groq planner failed with HTTP ${response.status}`;
      const groqError = new Error(message) as Error & { retryAfterSeconds?: number };
      groqError.retryAfterSeconds = retryAfterSeconds;
      throw groqError;
    }

    const data = await response.json();
    return this.normalizeDecision(data, snapshot);
  }

  analyze(
    tick: number,
    drones: Drone[],
    environment: Environment,
    target: Vector2 | null,
    centroid: Vector2
  ): LeaderDecision {
    const reports = this.collectTelemetry(drones, environment, target);
    const count = Math.max(1, reports.length);
    const avgEnergy = reports.reduce((sum, report) => sum + report.energy, 0) / count;
    const avgHealth = reports.reduce((sum, report) => sum + report.health, 0) / count;
    const hazardPressure = reports.reduce((sum, report) => sum + report.hazardScore, 0) / count;
    const formationError = reports.reduce((sum, report) => sum + report.formationError, 0) / count;
    const distressCount = reports.filter((report) => report.messages.includes('DISTRESS')).length;
    const lowEnergyCount = reports.filter((report) => report.messages.includes('LOW_ENERGY')).length;
    const hazardCount = reports.filter((report) => report.messages.includes('HAZARD_DETECTED')).length;

    let command: LeaderCommandType = 'HOLD_FORMATION';
    let confidence = 0.68;
    let summary = 'Formation is stable; maintaining current routing and slot assignments.';
    let nextTarget = target;

    if (avgEnergy < 38 || lowEnergyCount > count * 0.25) {
      command = 'CONSERVE_ENERGY';
      confidence = 0.88;
      summary = 'Energy reserves are low; reducing thrust and tightening movement budget.';
      nextTarget = centroid;
    } else if (distressCount > 0 || avgHealth < 72) {
      command = 'REGROUP';
      confidence = 0.84;
      summary = 'Structural risk detected; pulling units toward the leader for recovery.';
      nextTarget = centroid;
    } else if (hazardPressure > 0.32 || hazardCount > 0) {
      command = 'AVOID_HAZARDS';
      confidence = 0.82;
      summary = 'Hazard pressure is elevated; prioritizing avoidance and safer spacing.';
      nextTarget = this.findSaferTarget(centroid, environment);
    } else if (formationError < 45 && avgEnergy > 64) {
      command = 'EXPAND_SEARCH';
      confidence = 0.74;
      summary = 'Swarm is healthy and compact; widening scout coverage for new data.';
    }

    if (this.computeMode === 'groq') {
      confidence = Math.min(0.97, confidence + 0.05);
      summary = `${summary} Groq is primary; local planner is currently supplying the fallback command.`;
    }

    this.lastPlanningTick = tick;
    this.lastDecision = {
      tick,
      command,
      confidence,
      mode: this.computeMode,
      source: this.computeMode === 'groq' ? 'local_fallback' : 'local',
      fallbackReason: this.computeMode === 'groq' ? 'Waiting for Groq API decision or recovering from an API error.' : undefined,
      target: nextTarget ? nextTarget.copy() : null,
      summary,
      reportsAnalyzed: reports.length,
      avgEnergy,
      avgHealth,
      hazardPressure,
      formationError,
    };

    return this.lastDecision;
  }

  acceptExternalDecision(decision: LeaderDecision) {
    this.lastDecision = decision;
    this.lastPlanningTick = decision.tick;
  }

  private normalizeDecision(data: any, snapshot: LeaderPlanningSnapshot): LeaderDecision {
    const allowedCommands: LeaderCommandType[] = ['REGROUP', 'EXPAND_SEARCH', 'AVOID_HAZARDS', 'CONSERVE_ENERGY', 'HOLD_FORMATION'];
    const command = allowedCommands.includes(data.command) ? data.command : 'HOLD_FORMATION';
    const target = data.target && typeof data.target.x === 'number' && typeof data.target.y === 'number'
      ? new Vector2(data.target.x, data.target.y)
      : snapshot.target
        ? new Vector2(snapshot.target.x, snapshot.target.y)
        : null;

    return {
      tick: snapshot.tick,
      command,
      confidence: Math.max(0, Math.min(1, Number(data.confidence ?? 0.72))),
      mode: 'groq',
      source: 'groq',
      model: typeof data.model === 'string' ? data.model : undefined,
      target,
      summary: typeof data.summary === 'string' ? data.summary : 'Groq planner returned a mission command.',
      reportsAnalyzed: snapshot.reports.length,
      avgEnergy: snapshot.metrics.avgEnergy,
      avgHealth: snapshot.metrics.avgHealth,
      hazardPressure: snapshot.metrics.hazardPressure,
      formationError: snapshot.metrics.formationError,
    };
  }

  private computeHazardScore(drone: Drone, environment: Environment) {
    let pressure = 0;
    for (const obstacle of environment.obstacles) {
      const radius = obstacle.radius || Math.max(obstacle.width || 50, obstacle.height || 50);
      const distance = drone.position.distance(obstacle.position);
      const influence = radius + 160;

      if (distance < influence) {
        pressure += (1 - distance / influence) * (obstacle.intensity || 1);
      }
    }

    return Math.min(1, pressure);
  }

  private findSaferTarget(centroid: Vector2, environment: Environment) {
    let escape = new Vector2(0, 0);
    for (const obstacle of environment.obstacles) {
      const radius = obstacle.radius || Math.max(obstacle.width || 50, obstacle.height || 50);
      const distance = Math.max(1, centroid.distance(obstacle.position));
      if (distance < radius + 240) {
        escape = escape.add(centroid.sub(obstacle.position).normalize().mult((radius + 240) / distance));
      }
    }

    if (escape.magSq() === 0) {
      return centroid;
    }

    return centroid.add(escape.normalize().mult(120));
  }
}
