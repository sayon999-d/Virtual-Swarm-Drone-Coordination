import { Drone } from '../agents/Drone';
import { Environment } from '../environment/Environment';
import { SwarmConfig, defaultConfig } from '../control/SwarmConfig';
import { MessageBus } from '../communication/MessageBus';
import { Vector2 } from '../utils/Vector2';

export type Formation = 'Flock' | 'Grid' | 'V-Shape' | 'Circle' | 'Leader' | 'Scatter' | 'Hexagon' | 'Cross';
export type Behavior = 'STD' | 'CALM' | 'AGGRO' | 'EXPLORE' | 'SWARM';
export type TrailStyle = 'Solid' | 'Dashed' | 'Fading' | 'Neon';

export interface CollisionEvent {
  position: Vector2;
  time: number;
  seed: number;
  type?: 'DISTRESS' | 'LOW_ENERGY' | 'HAZARD_DETECTED' | 'STANDARD';
  targetType?: 'DRONE' | 'OBSTACLE';
  involvedIds?: string[];
  involvedProfiles?: string[];
  obstacleType?: string;
  relativeVelocity?: number;
  impactForce?: number;
}

export class Simulation {
  drones: Drone[];
  environment: Environment;
  config: SwarmConfig;
  bus: MessageBus;
  target: Vector2 | null;
  virtualCenter: Vector2 | null = null;
  tick: number = 0;
  formation: Formation = 'Scatter';
  behavior: Behavior = 'STD';
  collisions: number = 0;
  currentCollisions: number = 0;
  activeCollisions: Set<string> = new Set();
  collisionEvents: CollisionEvent[] = [];
  collisionLog: CollisionEvent[] = [];
  isRunning: boolean = true;
  timeScale: number = 1.0;
  showTrails: boolean = true;
  trailStyle: TrailStyle = 'Fading';
  showFormationPoints: boolean = false;
  formationSpacing: number = 40;
  currentDynamicSpacing: number = 40;
  autoPilotWaypoints: Vector2[] = [];
  autoPilotIndex: number = 0;

  constructor(width: number, height: number, numDrones: number) {
    this.environment = new Environment(width, height);
    this.config = { ...defaultConfig };
    this.bus = new MessageBus(50);
    this.drones = [];
    this.target = null;
    this.autoPilotWaypoints = [
      new Vector2(width * 0.2, height * 0.2),
      new Vector2(width * 0.8, height * 0.2),
      new Vector2(width * 0.8, height * 0.8),
      new Vector2(width * 0.2, height * 0.8),
    ];

    for (let i = 0; i < numDrones; i++) {
      const x = width / 2 + (Math.random() * 100 - 50);
      const y = height / 2 + (Math.random() * 100 - 50);
      this.drones.push(new Drone(`drone-${i}`, x, y));
    }
    this.setFormation(this.formation);
  }

  setTarget(x: number, y: number) {
    this.target = new Vector2(x, y);
  }

  clearTarget() {
    this.target = null;
  }

  recenter() {
    let centroid = new Vector2(0, 0);
    if (this.drones.length > 0) {
      for (const drone of this.drones) {
        centroid = centroid.add(drone.position);
      }
      centroid = centroid.div(this.drones.length);
    }
    
    this.virtualCenter = centroid;
    this.target = centroid;
    const originalTargetWeight = this.config.targetWeight;
    this.config.targetWeight = Math.max(8.0, originalTargetWeight * 2);
    if (this.formation === 'Scatter' || this.formation === 'Flock') {
      this.config.targetWeight = 4.0;
    }
  }

  setFormation(f: Formation | 'Hexagon') {
    this.formation = f as Formation;
    const count = this.drones.length;
    let spacing = this.formationSpacing;
    
    if (count > 25) {
      const overflow = count - 25;
      spacing *= (1 + (overflow * 0.002));
    } else if (count < 15) {
      const underflow = 15 - count;
      spacing *= (1 - (underflow * 0.02));
    }
    spacing = Math.max(35, spacing);
    this.currentDynamicSpacing = spacing;
    
    this.target = null; // Always clear explicit target when changing formation so it uses centroid

    if (f === 'Scatter') {
      this.config.separationWeight = 5.0;
      this.config.cohesionWeight = 0.0;
      this.config.alignmentWeight = 0.0;
      this.config.targetWeight = 0.0; // Disable target seeking
      this.config.wanderWeight = 2.0; // Increased to make them move freely
      this.drones.forEach(d => d.targetOffset = new Vector2(0, 0));
    } else if (f === 'Flock') {
      this.config = { ...defaultConfig };
      this.config.targetWeight = 0.0; // Disable target seeking for pure flocking
      this.drones.forEach(d => d.targetOffset = new Vector2(0, 0));
    } else {
      this.config = { ...defaultConfig };
      this.config.targetWeight = 4.0; // Slightly stronger pull for formations
      this.config.separationWeight = 2.0; // Reduced to let them settle into slots
      this.config.alignmentWeight = 1.0; 
      this.config.cohesionWeight = 0.5; 
      this.config.maxForce = 0.8; // Snappier response
      this.config.maxSpeed = 4.5; 
      
      this.config.separationRadius = 38; // Slightly larger than drone diameter (32)
      const slots: Vector2[] = [];
      const count = this.drones.length;

      if (f === 'Grid') {
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        for (let i = 0; i < count; i++) {
          const r = Math.floor(i / cols);
          const c = i % cols;
          slots.push(new Vector2((c - (cols-1)/2) * spacing, (r - (rows-1)/2) * spacing));
        }
      } else if (f === 'Circle') {
        const radius = Math.max(spacing * 1.5, count * (spacing / (Math.PI * 2)));
        for (let i = 0; i < count; i++) {
          const angle = i * (Math.PI * 2 / count);
          slots.push(new Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
        }
      } else if (f === 'V-Shape') {
        slots.push(new Vector2(0, 0)); // Leader
        for (let i = 1; i < count; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const row = Math.ceil(i / 2);
          slots.push(new Vector2(side * row * spacing, row * spacing));
        }
      } else if (f === 'Leader') {
        for (let i = 0; i < count; i++) {
          slots.push(new Vector2(0, i * spacing));
        }
      } else if (f === 'Cross') {
        const armCount = Math.floor(count / 4);
        slots.push(new Vector2(0, 0)); // Center
        for (let i = 1; i < count; i++) {
          const arm = i % 4;
          const step = Math.ceil(i / 4);
          if (arm === 0) slots.push(new Vector2(step * spacing, step * spacing));
          if (arm === 1) slots.push(new Vector2(-step * spacing, step * spacing));
          if (arm === 2) slots.push(new Vector2(step * spacing, -step * spacing));
          if (arm === 3) slots.push(new Vector2(-step * spacing, -step * spacing));
        }
      } else if ((f as string) === 'Hexagon') {
        let i = 0;
        let layer = 0;
        while (i < count) {
          if (layer === 0) {
            slots.push(new Vector2(0, 0));
            i++;
          } else {
            for (let side = 0; side < 6; side++) {
              for (let step = 0; step < layer; step++) {
                if (i >= count) break;
                const angle = (side * 60 + step * (60 / layer)) * (Math.PI / 180);
                const r = layer * spacing;
                slots.push(new Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
                i++;
              }
            }
          }
          layer++;
        }
      }
      let slotCentroid = new Vector2(0, 0);
      slots.forEach(s => slotCentroid = slotCentroid.add(s));
      slotCentroid = slotCentroid.div(slots.length || 1);
      const centeredSlots = slots.map(s => s.sub(slotCentroid));
      const availableDrones = [...this.drones];
      const assignedSlots: { drone: Drone, slot: Vector2 }[] = [];
      const sortedSlots = [...centeredSlots].sort((a, b) => a.magSq() - b.magSq());
      let currentCentroid = new Vector2(0, 0);
      this.drones.forEach(d => currentCentroid = currentCentroid.add(d.position));
      currentCentroid = currentCentroid.div(this.drones.length || 1);

      for (const slot of sortedSlots) {
        if (availableDrones.length === 0) break;
        const worldSlotPos = currentCentroid.add(slot);
        
        let bestDroneIdx = 0;
        let minDistSq = Infinity;

        for (let i = 0; i < availableDrones.length; i++) {
          const d = availableDrones[i];
          const distSq = d.position.distanceSq(worldSlotPos);
          if (distSq < minDistSq) {
            minDistSq = distSq;
            bestDroneIdx = i;
          }
        }

        const [chosenDrone] = availableDrones.splice(bestDroneIdx, 1);
        chosenDrone.targetOffset = slot;
      }
    }
  }

  setBehavior(b: Behavior) {
    this.behavior = b;
    if (b === 'STD') {
      this.config = { ...defaultConfig };
    } else if (b === 'CALM') {
      this.config.maxSpeed = 1.5;
      this.config.maxForce = 0.05;
      this.config.separationWeight = 2.0;
      this.config.wanderWeight = 0.5;
    } else if (b === 'AGGRO') {
      this.config.maxSpeed = 5.0;
      this.config.maxForce = 0.3;
      this.config.separationWeight = 1.0;
      this.config.alignmentWeight = 2.0;
      this.config.wanderWeight = 0.1;
    } else if (b === 'EXPLORE') {
      this.config.maxSpeed = 2.5;
      this.config.maxForce = 0.15;
      this.config.separationWeight = 1.5;
      this.config.alignmentWeight = 0.5;
      this.config.cohesionWeight = 0.1;
      this.config.wanderWeight = 3.0; // High wander
    } else if (b === 'SWARM') {
      this.config.maxSpeed = 4.0;
      this.config.maxForce = 0.25;
      this.config.separationWeight = 1.5;
      this.config.alignmentWeight = 1.5;
      this.config.cohesionWeight = 3.0; // High cohesion
      this.config.wanderWeight = 0.2;
    }
  }

  exportState() {
    return {
      tick: this.tick,
      formation: this.formation,
      behavior: this.behavior,
      formationSpacing: this.formationSpacing,
      timeScale: this.timeScale,
      showTrails: this.showTrails,
      trailStyle: this.trailStyle,
      showFormationPoints: this.showFormationPoints,
      config: { ...this.config },
      autoPilotWaypoints: this.autoPilotWaypoints.map(wp => ({ x: wp.x, y: wp.y })),
      autoPilotIndex: this.autoPilotIndex,
      environment: {
        obstacles: this.environment.obstacles.map(o => ({
          ...o,
          position: { x: o.position.x, y: o.position.y }
        }))
      },
      drones: this.drones.map(d => ({
        id: d.id,
        position: { x: d.position.x, y: d.position.y },
        velocity: { x: d.velocity.x, y: d.velocity.y },
        energy: d.energy,
        health: d.health,
        behaviorProfile: d.behaviorProfile,
        targetOffset: { x: d.targetOffset.x, y: d.targetOffset.y }
      }))
    };
  }

  importState(data: any) {
    if (!data) return;
    
    this.tick = data.tick || 0;
    this.formation = data.formation || 'Scatter';
    this.behavior = data.behavior || 'STD';
    this.formationSpacing = data.formationSpacing || 40;
    this.timeScale = data.timeScale || 1.0;
    this.showTrails = data.showTrails !== undefined ? data.showTrails : true;
    this.trailStyle = data.trailStyle || 'Fading';
    this.showFormationPoints = !!data.showFormationPoints;
    
    if (data.config) {
      this.config = { ...data.config };
    }

    if (data.autoPilotWaypoints) {
      this.autoPilotWaypoints = data.autoPilotWaypoints.map((wp: any) => new Vector2(wp.x, wp.y));
    }
    this.autoPilotIndex = data.autoPilotIndex || 0;
    
    if (data.environment && data.environment.obstacles) {
      this.environment.clearObstacles();
      data.environment.obstacles.forEach((o: any) => {
        this.environment.addObstacle({
          ...o,
          position: new Vector2(o.position.x, o.position.y)
        });
      });
    }

    if (data.drones) {
      this.drones = data.drones.map((d: any) => {
        const drone = new Drone(d.id, d.position.x, d.position.y);
        drone.velocity = new Vector2(d.velocity.x, d.velocity.y);
        drone.energy = d.energy;
        drone.health = d.health;
        if (d.behaviorProfile) {
          drone.setProfile(d.behaviorProfile);
        }
        drone.targetOffset = new Vector2(d.targetOffset.x, d.targetOffset.y);
        return drone;
      });
    }
    this.activeCollisions.clear();
    this.collisionEvents = [];
    this.collisionLog = [];
  }

  private addToLog(event: CollisionEvent) {
    this.collisionLog.unshift(event);
    if (this.collisionLog.length > 50) {
      this.collisionLog.pop();
    }
  }

  step(dt: number = 1) {
    if (!this.isRunning) return;
    this.tick++;
    this.currentCollisions = 0;
    
    const scaledDt = dt * this.timeScale;
    this.bus.clear();
    for (const drone of this.drones) {
      drone.isColliding = false; // Reset collision state
      drone.isNearCollision = false; // Reset near collision alert
      drone.lastCollisionObstacleType = null;
      this.bus.publish(drone.getState());
    }

    const perceptionRadius = Math.max(this.config.separationRadius, this.config.alignmentRadius, this.config.cohesionRadius);
    const newActiveCollisions = new Set<string>();
    let currentCentroid = new Vector2(0, 0);
    let currentVelocity = new Vector2(0, 0);
    if (this.drones.length > 0) {
      for (const drone of this.drones) {
        currentCentroid = currentCentroid.add(drone.position);
        currentVelocity = currentVelocity.add(drone.velocity);
      }
      currentCentroid = currentCentroid.div(this.drones.length);
      currentVelocity = currentVelocity.div(this.drones.length);
      if (this.config.autoPilot && this.autoPilotWaypoints.length > 0) {
        const currentWaypoint = this.autoPilotWaypoints[this.autoPilotIndex];
        this.target = currentWaypoint;
        if (currentCentroid.distance(currentWaypoint) < 60) {
          this.autoPilotIndex = (this.autoPilotIndex + 1) % this.autoPilotWaypoints.length;
        }
      }
    }

    if (!this.virtualCenter) {
      this.virtualCenter = currentCentroid;
    } else {
      this.virtualCenter = this.virtualCenter.add(currentVelocity.mult(scaledDt));
      this.virtualCenter = this.virtualCenter.lerp(currentCentroid, 0.05);
    }

    const activeTarget = this.target || this.virtualCenter;
    const sortedDrones = [...this.drones].sort((a, b) => a.position.x - b.position.x);
    const dangerThresholdMul = 2.5; // Radius multiplier for "alert" zone
    
    for (let i = 0; i < sortedDrones.length; i++) {
      const d1 = sortedDrones[i];
      for (let j = i + 1; j < sortedDrones.length; j++) {
        const d2 = sortedDrones[j];
        const horizontalDangerDist = (d1.radius + d2.radius) * dangerThresholdMul;
        if (d2.position.x - d1.position.x > horizontalDangerDist) break;
        if (Math.abs(d2.position.y - d1.position.y) <= horizontalDangerDist) {
          const distSq = d1.position.distanceSq(d2.position);
          const contactDist = d1.radius + d2.radius;
          const dangerDist = contactDist * dangerThresholdMul;
          
          if (distSq < dangerDist * dangerDist) {
            d1.isNearCollision = true;
            d2.isNearCollision = true;
            if (distSq < contactDist * contactDist) {
              this.currentCollisions++;
              const id1 = d1.id < d2.id ? d1.id : d2.id;
              const id2 = d1.id < d2.id ? d2.id : d1.id;
              const pairId = `${id1}-${id2}`;
              newActiveCollisions.add(pairId);
              if (!this.activeCollisions.has(pairId)) {
                this.collisions++;
              }
            }
          }
        }
      }
    }
    for (const drone of this.drones) {
      const state = drone.getState();
      const neighbors = this.bus.getNeighbors(drone.id, perceptionRadius);

      const action = drone.brain.decide(state, neighbors, this.environment, this.config, activeTarget);
      drone.apply(action);
    }
    
    this.activeCollisions = newActiveCollisions;
    for (const drone of this.drones) {
      if (activeTarget && drone.targetOffset) {
        const desiredPos = activeTarget.add(drone.targetOffset);
        const deviation = drone.position.distance(desiredPos);
        if (deviation > this.currentDynamicSpacing * 1.5) {
          drone.localTargetMult = Math.min(3.0, drone.localTargetMult + 0.1 * scaledDt);
          drone.localCohesionMult = Math.min(2.5, drone.localCohesionMult + 0.05 * scaledDt);
        }
      }
      if (drone.isColliding || drone.isNearCollision) {
        drone.localSeparationMult = Math.min(4.0, drone.localSeparationMult + 0.2 * scaledDt);
      }

      drone.update(this.config, scaledDt);
    }
    const sortedDronesForResolution = [...this.drones].sort((a, b) => a.position.x - b.position.x);
    for (let i = 0; i < sortedDronesForResolution.length; i++) {
      const d1 = sortedDronesForResolution[i];
      for (let j = i + 1; j < sortedDronesForResolution.length; j++) {
        const d2 = sortedDronesForResolution[j];
        if (d2.position.x - d1.position.x > d1.radius + d2.radius) break;
        
        if (Math.abs(d2.position.y - d1.position.y) <= d1.radius + d2.radius) {
          const distSq = d1.position.distanceSq(d2.position);
          const minDist = d1.radius + d2.radius;
          
          if (distSq < minDist * minDist && distSq > 0) {
            d1.isColliding = true;
            d2.isColliding = true;
            
            const dist = Math.sqrt(distSq);
            const overlap = minDist - dist;
            const pushDir = d1.position.sub(d2.position).normalize();
            const pushVec = pushDir.mult(overlap * 0.5);
            
            d1.position = d1.position.add(pushVec);
            d2.position = d2.position.sub(pushVec);
            const relativeVelocity = d1.velocity.sub(d2.velocity);
            const velocityAlongNormal = relativeVelocity.dot(pushDir);
            if (velocityAlongNormal < 0) {
              const restitution = 0.2; // Slight bounce
              const impulseMag = -(1 + restitution) * velocityAlongNormal * 0.5;
              const impulse = pushDir.mult(impulseMag);
              
              d1.velocity = d1.velocity.add(impulse);
              d2.velocity = d2.velocity.sub(impulse);
              let type: CollisionEvent['type'] = 'STANDARD';
              if (d1.health < 50 || d2.health < 50) {
                type = 'DISTRESS';
              } else if (d1.energy < 30 || d2.energy < 30) {
                type = 'LOW_ENERGY';
              }
              const collisionPoint = d1.position.add(d2.position).mult(0.5);
              const event: CollisionEvent = { 
                position: collisionPoint, 
                time: Date.now(), 
                seed: Math.random(),
                type,
                targetType: 'DRONE',
                involvedIds: [d1.id, d2.id],
                involvedProfiles: [d1.behaviorProfile, d2.behaviorProfile],
                relativeVelocity: relativeVelocity.mag(),
                impactForce: impulseMag
              };
              this.collisionEvents.push(event);
              this.addToLog(event);
            }
          }
        }
      }
    }
    for (const d1 of this.drones) {
      for (const obs of this.environment.obstacles) {
        if (obs.type === 'circle' || obs.type === 'electrical_storm' || obs.type === 'magnetic_field') {
          const distSq = d1.position.distanceSq(obs.position);
          const contactDist = d1.radius + obs.radius;
          const dangerDist = contactDist * 1.8; // Danger zone radius
          
          if (distSq < dangerDist * dangerDist) {
            d1.isNearCollision = true;
            
            if (distSq < contactDist * contactDist && distSq > 0) {
              d1.isColliding = true;
              d1.lastCollisionObstacleType = obs.type;
              
              const dist = Math.sqrt(distSq);
              const intensity = obs.intensity || 1.0;
              const proximityFactor = Math.max(0, 1.0 - (dist / contactDist));
              
              const overlap = contactDist - dist;
              const pushDir = d1.position.sub(obs.position).normalize();
              d1.position = d1.position.add(pushDir.mult(overlap));
              
              if (obs.type === 'electrical_storm') {
                const baseDamage = 4.0;
                const tickDamage = baseDamage * proximityFactor * intensity;
                d1.health = Math.max(0, d1.health - tickDamage);
                d1.velocity = d1.velocity.add(new Vector2(
                  (Math.random() - 0.5) * 10 * proximityFactor * intensity, 
                  (Math.random() - 0.5) * 10 * proximityFactor * intensity
                ));
              } else if (obs.type === 'magnetic_field') {
                const baseDrain = 10.0;
                const tickDrain = baseDrain * proximityFactor * intensity;
                d1.energy = Math.max(0, d1.energy - tickDrain);
                const dragFactor = Math.max(0.1, 1.0 - (0.9 * proximityFactor * intensity));
                d1.velocity = d1.velocity.mult(dragFactor);
              } else {
                const dot = d1.velocity.dot(pushDir);
                if (dot < 0) {
                  d1.velocity = d1.velocity.sub(pushDir.mult(2 * dot)).mult(0.6);
                  const collisionPoint = d1.position.sub(pushDir.mult(d1.radius));
                  let type: CollisionEvent['type'] = 'STANDARD';
                  if (d1.health < 50) type = 'DISTRESS';
                  else if (d1.energy < 30) type = 'LOW_ENERGY';
                  
                  const event: CollisionEvent = { 
                    position: collisionPoint, 
                    time: Date.now(), 
                    seed: Math.random(),
                    type,
                    targetType: 'OBSTACLE',
                    involvedIds: [d1.id],
                    involvedProfiles: [d1.behaviorProfile],
                    obstacleType: obs.type,
                    relativeVelocity: d1.velocity.mag(),
                    impactForce: Math.abs(dot) * 2.0
                  };
                  this.collisionEvents.push(event);
                  this.addToLog(event);
                }
                d1.health = Math.max(0, d1.health - 0.5);
              }
            }
          }
        } else if (obs.type === 'rect') {
          const hw = (obs.width || 50) / 2;
          const hh = (obs.height || 50) / 2;
          const cx = Math.max(obs.position.x - hw, Math.min(d1.position.x, obs.position.x + hw));
          const cy = Math.max(obs.position.y - hh, Math.min(d1.position.y, obs.position.y + hh));
          const closest = new Vector2(cx, cy);
          const distSq = d1.position.distanceSq(closest);
          const dangerDist = d1.radius * 2.0;
          
          if (distSq < dangerDist * dangerDist) {
            d1.isNearCollision = true;
            
            if (distSq < d1.radius * d1.radius && distSq > 0) {
              d1.isColliding = true;
              d1.lastCollisionObstacleType = obs.type;
              const dist = Math.sqrt(distSq);
              const overlap = d1.radius - dist;
              const pushDir = d1.position.sub(closest).normalize();
              d1.position = d1.position.add(pushDir.mult(overlap));
              
              const dot = d1.velocity.dot(pushDir);
              if (dot < 0) {
                d1.velocity = d1.velocity.sub(pushDir.mult(2 * dot)).mult(0.6);
                const collisionPoint = d1.position.sub(pushDir.mult(d1.radius));
                let type: CollisionEvent['type'] = 'STANDARD';
                if (d1.health < 50) type = 'DISTRESS';
                else if (d1.energy < 30) type = 'LOW_ENERGY';
                
                const event: CollisionEvent = { 
                  position: collisionPoint, 
                  time: Date.now(), 
                  seed: Math.random(),
                  type,
                  targetType: 'OBSTACLE',
                  involvedIds: [d1.id],
                  involvedProfiles: [d1.behaviorProfile],
                  obstacleType: obs.type,
                  relativeVelocity: d1.velocity.mag(),
                  impactForce: Math.abs(dot) * 2.0
                };
                this.collisionEvents.push(event);
                this.addToLog(event);
              }
              d1.health = Math.max(0, d1.health - 0.5);
            }
          }
        }
      }
    }
    const now = Date.now();
    this.collisionEvents = this.collisionEvents.filter(e => now - e.time < 500);
  }
}
