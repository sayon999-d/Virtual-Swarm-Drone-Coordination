export interface SwarmConfig {
  separationWeight: number;
  separationRadius: number;
  
  alignmentWeight: number;
  alignmentRadius: number;
  
  cohesionWeight: number;
  cohesionRadius: number;
  
  obstacleWeight: number;
  targetWeight: number;
  wanderWeight: number;
  
  maxSpeed: number;
  maxForce: number;
  damping: number;
  autoPilot: boolean;
}

export const defaultConfig: SwarmConfig = {
  separationWeight: 2.5,
  separationRadius: 45, // Must be > 2x drone radius (16) to prevent collisions
  
  alignmentWeight: 1.2,
  alignmentRadius: 60,
  
  cohesionWeight: 1.0,
  cohesionRadius: 80,
  
  obstacleWeight: 4.0,
  targetWeight: 0.6,
  wanderWeight: 0.3,
  
  maxSpeed: 3.5,
  maxForce: 0.15,
  damping: 0.01,
  autoPilot: false,
};
