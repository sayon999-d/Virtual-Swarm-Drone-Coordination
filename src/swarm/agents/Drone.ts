import { Vector2 } from '../utils/Vector2';
import { InternalAgent } from '../internal_agent/InternalAgent';
import { DroneState } from '../spatial_index/SpatialGrid';
import { SwarmConfig } from '../control/SwarmConfig';
import { Environment, ObstacleType } from '../environment/Environment';

export class Drone {
  id: string;
  position: Vector2;
  velocity: Vector2;
  acceleration: Vector2;
  radius: number;
  brain: InternalAgent;
  history: Vector2[];
  maxHistory: number = 50;
  targetOffset: Vector2;
  currentTargetOffset: Vector2;
  rotation: number = 0;
  pitch: number = 0;
  roll: number = 0;
  
  // New properties
  energy: number = 100;
  health: number = 100;
  behaviorProfile: 'Scout' | 'Defender' | 'Worker' | 'Relay' = 'Worker';
  isColliding: boolean = false;
  isNearCollision: boolean = false;
  lastCollisionObstacleType: ObstacleType | null = null;
  
  // Profile-specific stats
  maxSpeedMult: number = 1.0;
  maxForceMult: number = 1.0;
  energyRateMult: number = 1.0;
  perceptionMult: number = 1.0;
  
  // Local weight overrides for stability
  localSeparationMult: number = 1.0;
  localCohesionMult: number = 1.0;
  localTargetMult: number = 1.0;

  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.position = new Vector2(x, y);
    // Random initial velocity
    this.velocity = new Vector2(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    this.acceleration = new Vector2(0, 0);
    this.radius = 16; // Increased for better visibility
    this.brain = new InternalAgent();
    this.history = [];
    this.targetOffset = new Vector2(0, 0);
    this.currentTargetOffset = new Vector2(0, 0);
    this.rotation = Math.atan2(this.velocity.y, this.velocity.x);
    
    // Assign behavior profile and stats
    const profiles: ('Scout' | 'Defender' | 'Worker' | 'Relay')[] = ['Scout', 'Defender', 'Worker', 'Relay'];
    this.behaviorProfile = profiles[Math.floor(Math.random() * profiles.length)];
    
    this.setupProfileStats();
  }

  setProfile(profile: 'Scout' | 'Defender' | 'Worker' | 'Relay') {
    this.behaviorProfile = profile;
    this.setupProfileStats();
  }

  private setupProfileStats() {
    switch (this.behaviorProfile) {
      case 'Scout':
        this.maxSpeedMult = 1.4;
        this.maxForceMult = 1.2;
        this.energyRateMult = 1.3; // High speed costs more energy
        this.perceptionMult = 1.5; // Sees hazards from further away
        this.health = 80; // Fragile
        break;
      case 'Defender':
        this.maxSpeedMult = 0.8;
        this.maxForceMult = 1.5; // Stronger push-back
        this.energyRateMult = 1.1;
        this.perceptionMult = 1.0;
        this.health = 150; // Tanky
        break;
      case 'Worker':
        this.maxSpeedMult = 1.0;
        this.maxForceMult = 0.8;
        this.energyRateMult = 0.7; // Very efficient
        this.perceptionMult = 0.8;
        this.health = 100;
        break;
      case 'Relay':
        this.maxSpeedMult = 1.1;
        this.maxForceMult = 1.0;
        this.energyRateMult = 1.0;
        this.perceptionMult = 1.2;
        this.health = 90;
        break;
    }
  }

  getState(): DroneState {
    const messages: any[] = [];
    
    // Broadcast status messages based on current condition
    if (this.health < 50) {
      messages.push({ type: 'DISTRESS', value: this.health });
    }
    if (this.energy < 30) {
      messages.push({ type: 'LOW_ENERGY', value: this.energy });
    }
    if (this.isNearCollision) {
      messages.push({ type: 'HAZARD_DETECTED', position: this.position.copy() });
    }

    return {
      id: this.id,
      position: this.position.copy(),
      velocity: this.velocity.copy(),
      radius: this.radius,
      targetOffset: this.currentTargetOffset.copy(),
      energy: this.energy,
      health: this.health,
      behaviorProfile: this.behaviorProfile, // Export profile to brain
      perceptionMult: this.perceptionMult,
      localSeparationMult: this.localSeparationMult,
      localCohesionMult: this.localCohesionMult,
      localTargetMult: this.localTargetMult,
      messages,
      lastCollisionObstacleType: this.lastCollisionObstacleType
    };
  }

  apply(force: Vector2) {
    this.acceleration = this.acceleration.add(force);
  }

  update(config: SwarmConfig, dt: number = 1) {
    // Weight Decay: Naturally return local multipliers to baseline over time
    this.localSeparationMult = Math.max(1.0, this.localSeparationMult - 0.05 * dt);
    this.localTargetMult = Math.max(1.0, this.localTargetMult - 0.02 * dt);
    this.localCohesionMult = Math.max(1.0, this.localCohesionMult - 0.02 * dt);

    // Energy consumption
    const effort = this.acceleration.mag() * 0.5 + this.velocity.mag() * 0.1 + 0.05;
    this.energy = Math.max(0, this.energy - effort * dt * 0.1 * this.energyRateMult);

    // Energy recovery when moving slowly
    if (this.velocity.mag() < 0.5) {
      this.energy = Math.min(100, this.energy + 2 * dt);
    }

    // Smoothly interpolate formation offsets
    const offsetLerpFactor = 1 - Math.pow(0.95, dt);
    this.currentTargetOffset = this.currentTargetOffset.lerp(this.targetOffset, offsetLerpFactor);

    // Only record history if we've moved enough (makes trails smoother and longer)
    if (this.history.length === 0 || this.position.distanceSq(this.history[this.history.length - 1]) > 2) {
      this.history.push(this.position.copy());
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    // Natural physics integration using Lerp
    // 1. Calculate the desired velocity based on current acceleration
    let desiredVelocity = this.velocity.add(this.acceleration.mult(dt));
    
    // 2. Enforce speed limits on the desired velocity (reduce max speed if out of energy)
    const baseMaxSpeed = this.energy > 0 ? config.maxSpeed : config.maxSpeed * 0.3;
    const currentMaxSpeed = baseMaxSpeed * this.maxSpeedMult;
    desiredVelocity = desiredVelocity.limit(currentMaxSpeed);
    
    // 3. Apply damping (air resistance) to the desired velocity
    const dampingFactor = Math.pow(1 - config.damping, dt);
    desiredVelocity = desiredVelocity.mult(dampingFactor);

    // 4. Smoothly interpolate current velocity towards desired velocity
    // This creates a much more organic, less robotic movement by preventing instant velocity snaps
    const lerpFactor = 1 - Math.pow(0.90, dt); // Even smoother transition factor
    this.velocity = this.velocity.lerp(desiredVelocity, lerpFactor);
    
    // 5. Apply final velocity to position
    this.position = this.position.add(this.velocity.mult(dt));

    // 6. Smoothly interpolate rotation for organic visual turning
    if (this.velocity.magSq() > 0.1) {
      const targetRotation = Math.atan2(this.velocity.y, this.velocity.x);
      
      // Handle angle wrapping (so it doesn't spin the long way around)
      let deltaAngle = targetRotation - this.rotation;
      while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
      while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
      
      const rotationLerpFactor = 1 - Math.pow(0.80, dt);
      this.rotation += deltaAngle * rotationLerpFactor;
    }

    // 7. Calculate Pitch and Roll based on acceleration relative to heading
    // Forward acceleration = pitch down (negative pitch)
    // Sideways acceleration = roll
    const forwardVec = new Vector2(Math.cos(this.rotation), Math.sin(this.rotation));
    const rightVec = new Vector2(-Math.sin(this.rotation), Math.cos(this.rotation));
    
    const forwardAcc = this.acceleration.dot(forwardVec);
    const rightAcc = this.acceleration.dot(rightVec);

    // Defenders have less pitch/roll due to stability, Scouts have more
    const agilityMult = this.behaviorProfile === 'Scout' ? 1.5 : this.behaviorProfile === 'Defender' ? 0.6 : 1.0;
    const targetPitch = Math.max(-0.5, Math.min(0.5, -forwardAcc * 2.0 * agilityMult)); 
    const targetRoll = Math.max(-0.5, Math.min(0.5, rightAcc * 2.0 * agilityMult)); 

    const attitudeLerpFactor = 1 - Math.pow(0.85, dt);
    this.pitch += (targetPitch - this.pitch) * attitudeLerpFactor;
    this.roll += (targetRoll - this.roll) * attitudeLerpFactor;

    // Reset acceleration for next tick
    this.acceleration = new Vector2(0, 0);
  }
}
