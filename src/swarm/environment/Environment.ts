import { Vector2 } from '../utils/Vector2';

export type ObstacleType = 'circle' | 'rect' | 'electrical_storm' | 'magnetic_field';

export interface Obstacle {
  type: ObstacleType;
  position: Vector2;
  radius: number; // for circle
  width?: number; // for rect
  height?: number; // for rect
  intensity?: number; // scale for damage/force effects
}

export class Environment {
  width: number;
  height: number;
  obstacles: Obstacle[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.obstacles = [];
  }

  addObstacle(obstacle: Obstacle) {
    this.obstacles.push(obstacle);
  }

  clearObstacles() {
    this.obstacles = [];
  }
}
