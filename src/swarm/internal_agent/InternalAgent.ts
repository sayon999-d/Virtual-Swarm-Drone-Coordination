import { Vector2 } from '../utils/Vector2';
import { DroneState } from '../spatial_index/SpatialGrid';
import { SwarmConfig } from '../control/SwarmConfig';
import { Environment } from '../environment/Environment';

export class InternalAgent {
  private wanderAngle: number = Math.random() * Math.PI * 2;
  
  decide(
    currentState: DroneState,
    neighbors: DroneState[],
    environment: Environment,
    config: SwarmConfig,
    target: Vector2 | null
  ): Vector2 {
    const profile = currentState.behaviorProfile || 'Worker';
    
    // Adjust perception radius based on profile
    const pMult = currentState.perceptionMult || 1.0;
    
    let separation = this.computeSeparation(currentState, neighbors, config.separationRadius, config.maxSpeed);
    let alignment = this.computeAlignment(currentState, neighbors, config.alignmentRadius, config.maxSpeed);
    let cohesion = this.computeCohesion(currentState, neighbors, config.cohesionRadius, config.maxSpeed);
    let obstacleAvoidance = this.computeObstacleAvoidance(currentState, environment, config.maxSpeed, pMult);
    let formationTarget = this.computeFormationTarget(currentState, target, config.maxSpeed);
    let wander = this.computeWander(currentState);
    let communication = this.computeCommunication(currentState, neighbors, config.maxSpeed, profile);

    // Profile-based weight balancing
    let weights = {
      separation: config.separationWeight,
      alignment: config.alignmentWeight,
      cohesion: config.cohesionWeight,
      obstacle: config.obstacleWeight,
      target: config.targetWeight,
      wander: config.wanderWeight || 0.2,
      comm: 1.5
    };

    switch (profile) {
      case 'Scout':
        weights.wander *= 2.5; // Scouts explore more
        weights.comm *= 0.5;   // Scouts focus on exploration over helping
        weights.obstacle *= 1.5; // Scouts are more careful around obstacles
        break;
      case 'Defender':
        weights.separation *= 1.4; // Stronger local territory
        weights.cohesion *= 1.2;   // Stays closer to the group
        weights.target *= 0.8;      // Prioritizes protection over target
        break;
      case 'Worker':
        weights.target *= 1.4; // Workers are focused on formations
        weights.wander *= 0.2; // Very little random movement
        break;
      case 'Relay':
        weights.comm *= 3.0;     // Relays react heaving to communication
        weights.alignment *= 1.5; // Better group synchronization
        break;
    }
    
    // Apply local stability overrides
    weights.separation *= currentState.localSeparationMult || 1.0;
    weights.cohesion *= currentState.localCohesionMult || 1.0;
    weights.target *= currentState.localTargetMult || 1.0;

    separation = separation.mult(weights.separation);
    alignment = alignment.mult(weights.alignment);
    cohesion = cohesion.mult(weights.cohesion);
    obstacleAvoidance = obstacleAvoidance.mult(weights.obstacle);
    formationTarget = formationTarget.mult(weights.target);
    wander = wander.mult(weights.wander);
    communication = communication.mult(weights.comm);

    let acceleration = new Vector2(0, 0);
    
    const fMult = profile === 'Defender' ? 1.5 : profile === 'Scout' ? 1.2 : profile === 'Worker' ? 0.8 : 1.0;
    const currentMaxForce = config.maxForce * fMult;

    // Soft forces (limited by maxForce for smooth movement)
    let softForces = new Vector2(0, 0);
    softForces = softForces.add(alignment);
    softForces = softForces.add(cohesion);
    softForces = softForces.add(formationTarget);
    softForces = softForces.add(wander);
    softForces = softForces.add(communication);
    
    softForces = softForces.limit(currentMaxForce);

    // Hard forces
    acceleration = acceleration.add(softForces);
    acceleration = acceleration.add(separation);
    acceleration = acceleration.add(obstacleAvoidance);

    // Profile specific overrides
    if (profile === 'Worker' && target && currentState.targetOffset) {
      const targetPos = target.add(currentState.targetOffset);
      const distToTarget = currentState.position.distance(targetPos);
      if (distToTarget < 30) {
        // Workers have better precision braking for slots
        const braking = currentState.velocity.mult(-0.95);
        acceleration = acceleration.add(braking);
      }
    }

    // Final safety limit
    return acceleration.limit(currentMaxForce * 20);
  }

  private computeCommunication(state: DroneState, neighbors: DroneState[], maxSpeed: number, profile: string): Vector2 {
    let steer = new Vector2(0, 0);
    let distressCount = 0;
    let distressCenter = new Vector2(0, 0);

    for (const neighbor of neighbors) {
      if (neighbor.messages && neighbor.messages.length > 0) {
        for (const msg of neighbor.messages) {
          if (msg.type === 'DISTRESS') {
            // Relays and Defenders react more strongly to distress
            let importance = 1.0;
            if (profile === 'Relay') importance = 2.5;
            if (profile === 'Defender') importance = 1.8;
            
            distressCenter = distressCenter.add(neighbor.position.mult(importance));
            distressCount += importance;
          } else if (msg.type === 'LOW_ENERGY') {
            // Adjust response to low energy teammates based on profile
            // Defenders and Workers are more supportive of the team's health
            let careFactor = 1.0;
            if (profile === 'Defender') careFactor = 1.8;
            if (profile === 'Worker') careFactor = 1.4;
            if (profile === 'Scout') careFactor = 0.2; // Scouts don't stop for slow units
            
            // Apply braking force proportional to how many neighbors are low on energy
            steer = steer.add(state.velocity.mult(-0.08 * careFactor));
          } else if (msg.type === 'HAZARD_DETECTED' && msg.position) {
            // Scouts react very strongly to hazards, being the eyes of the fleet
            // Defenders also try to move between the hazard and the rest if possible
            let reactRadius = profile === 'Scout' ? 180 : profile === 'Defender' ? 120 : 100;
            let fearMultiplier = profile === 'Scout' ? 2.5 : 1.0;
            
            const d = state.position.distance(msg.position);
            if (d > 0 && d < reactRadius) {
              let diff = state.position.sub(msg.position).normalize();
              // Exponential push-away from reported hazard positions
              const force = (reactRadius / d) * fearMultiplier;
              steer = steer.add(diff.mult(force));
            }
          }
        }
      }
    }

    if (distressCount > 0) {
      distressCenter = distressCenter.div(distressCount);
      // Seek the distress center
      let desired = distressCenter.sub(state.position);
      if (desired.magSq() > 0) {
        desired = desired.normalize().mult(maxSpeed);
        steer = steer.add(desired.sub(state.velocity));
      }
    }

    if (steer.magSq() > 0) {
      steer = steer.limit(maxSpeed);
    }
    return steer;
  }

  private computeWander(state: DroneState): Vector2 {
    const circleRadius = 2;
    const circleDistance = 5;
    const change = 0.5;
    
    this.wanderAngle += (Math.random() * 2 - 1) * change;
    
    let circleCenter = state.velocity.copy();
    if (circleCenter.magSq() === 0) {
      circleCenter = new Vector2(1, 0);
    }
    circleCenter = circleCenter.normalize().mult(circleDistance);
    
    const displacement = new Vector2(Math.cos(this.wanderAngle), Math.sin(this.wanderAngle)).mult(circleRadius);
    
    let steer = circleCenter.add(displacement);
    if (steer.magSq() > 0) {
      steer = steer.normalize();
    }
    return steer;
  }

  private computeSeparation(state: DroneState, neighbors: DroneState[], separationRadius: number, maxSpeed: number): Vector2 {
    let steer = new Vector2(0, 0);
    let count = 0;

    for (const neighbor of neighbors) {
      const d = state.position.distance(neighbor.position);
      if (d > 0 && d < separationRadius) {
        let diff = state.position.sub(neighbor.position);
        diff = diff.normalize();
        
        // Refined inverse square law for much stronger repulsion when very close
        // This prevents them from actually touching
        let force = 2000 / (d * d);
        if (d < 5) {
          // Drastic boost for extreme proximity to prevent pixel-perfect overlap
          force *= (15 / Math.max(0.1, d));
        }
        force = Math.min(500, force); // Increased cap for critical avoidance

        // Add slight random jitter to prevent drones from getting stuck in perfect alignment
        const jitter = new Vector2((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
        diff = diff.add(jitter).normalize().mult(force);
        
        steer = steer.add(diff);
        count++;

        // Enhanced predictive avoidance: analyze relative velocity and time-to-collision
        const relativeVel = neighbor.velocity.sub(state.velocity);
        
        // diff is the normalized vector pointing from neighbor to current drone
        // closingSpeed > 0 means the distance between them is decreasing
        const closingSpeed = relativeVel.dot(diff);
        
        if (closingSpeed > 0) {
          const timeToCollision = d / closingSpeed;
          
          // If a collision is imminent (e.g., within 2.5 seconds)
          if (timeToCollision < 2.5) {
            // Calculate an evasive force that gets exponentially stronger as TTC approaches 0
            const evasiveMultiplier = Math.min(50, 5 / Math.max(0.1, timeToCollision));
            steer = steer.add(diff.mult(closingSpeed * evasiveMultiplier));
          }
        }
      }
    }

    if (count > 0) {
      steer = steer.div(count);
    }
    
    // Do NOT normalize here, otherwise we lose the inverse square law magnitude!
    // We want the force to be stronger when they are closer.
    // Just limit it to a reasonable maximum so it doesn't break physics.
    if (steer.magSq() > 0) {
      steer = steer.limit(maxSpeed * 4); // Increased limit so it can overpower target attraction
    }
    return steer;
  }

  private computeAlignment(state: DroneState, neighbors: DroneState[], radius: number, maxSpeed: number): Vector2 {
    let sum = new Vector2(0, 0);
    let count = 0;

    for (const neighbor of neighbors) {
      const d = state.position.distanceSq(neighbor.position);
      if (d > 0 && d < radius * radius) {
        sum = sum.add(neighbor.velocity);
        count++;
      }
    }

    if (count > 0) {
      sum = sum.div(count);
      if (sum.magSq() > 0) {
          sum = sum.normalize().mult(maxSpeed);
      }
      let steer = sum.sub(state.velocity);
      return steer;
    }
    return new Vector2(0, 0);
  }

  private computeCohesion(state: DroneState, neighbors: DroneState[], radius: number, maxSpeed: number): Vector2 {
    let sum = new Vector2(0, 0);
    let count = 0;

    for (const neighbor of neighbors) {
      const d = state.position.distanceSq(neighbor.position);
      if (d > 0 && d < radius * radius) {
        sum = sum.add(neighbor.position);
        count++;
      }
    }

    if (count > 0) {
      sum = sum.div(count);
      return this.seek(state, sum, maxSpeed);
    }
    return new Vector2(0, 0);
  }

  private computeObstacleAvoidance(state: DroneState, environment: Environment, maxSpeed: number, pMult: number = 1.0): Vector2 {
    let steer = new Vector2(0, 0);
    
    // Avoid obstacles
    for (const obs of environment.obstacles) {
      let closestPoint = new Vector2(0, 0);
      let avoidRadius = 0;

      if (obs.type === 'circle' || obs.type === 'electrical_storm' || obs.type === 'magnetic_field') {
        closestPoint = obs.position;
        // Increase buffer significantly for hazards to avoid their effects
        const buffer = (obs.type === 'electrical_storm' || obs.type === 'magnetic_field') ? 80 : 40;
        avoidRadius = (obs.radius + state.radius + buffer) * pMult;
      } else if (obs.type === 'rect') {
        const hw = (obs.width || 50) / 2;
        const hh = (obs.height || 50) / 2;
        const cx = Math.max(obs.position.x - hw, Math.min(state.position.x, obs.position.x + hw));
        const cy = Math.max(obs.position.y - hh, Math.min(state.position.y, obs.position.y + hh));
        closestPoint = new Vector2(cx, cy);
        avoidRadius = (state.radius + 40) * pMult; // increased buffer
      }

      const d = state.position.distance(closestPoint);
      if (d > 0 && d < avoidRadius) {
        let diff = state.position.sub(closestPoint);
        diff = diff.normalize();
        // Stronger repulsion from obstacles
        const force = Math.min(100, 1000 / (d * d));
        diff = diff.mult(force);
        steer = steer.add(diff);
      }
    }

    // Removed wall avoidance to allow infinite space

    if (steer.magSq() > 0) {
      steer = steer.limit(maxSpeed * 2);
    }
    return steer;
  }

  private computeFormationTarget(state: DroneState, target: Vector2 | null, maxSpeed: number): Vector2 {
    if (!target) return new Vector2(0, 0);
    const finalTarget = state.targetOffset ? target.add(state.targetOffset) : target;
    return this.arrive(state, finalTarget, maxSpeed);
  }

  private seek(state: DroneState, target: Vector2, maxSpeed: number): Vector2 {
    let desired = target.sub(state.position);
    if (desired.magSq() > 0) {
        desired = desired.normalize().mult(maxSpeed);
    }
    let steer = desired.sub(state.velocity);
    return steer;
  }

  private arrive(state: DroneState, target: Vector2, maxSpeed: number): Vector2 {
    let desired = target.sub(state.position);
    let d = desired.mag();
    if (d > 0) {
        desired = desired.normalize();
        // Slow down within 100 pixels
        if (d < 100) {
            desired = desired.mult(maxSpeed * (d / 100));
        } else {
            desired = desired.mult(maxSpeed);
        }
        let steer = desired.sub(state.velocity);
        return steer;
    }
    return new Vector2(0, 0);
  }
}
