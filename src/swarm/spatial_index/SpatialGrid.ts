import { Vector2 } from '../utils/Vector2';
import { ObstacleType } from '../environment/Environment';

export interface DroneMessage {
  type: 'DISTRESS' | 'LOW_ENERGY' | 'HAZARD_DETECTED' | 'LEADER_COMMAND';
  position?: Vector2;
  value?: number | string;
}

export interface DroneState {
  id: string;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  targetOffset?: Vector2;
  energy: number;
  health: number;
  behaviorProfile?: 'Scout' | 'Defender' | 'Worker' | 'Relay';
  isLeader?: boolean;
  leaderCommand?: string | null;
  perceptionMult?: number;
  localSeparationMult?: number;
  localCohesionMult?: number;
  localTargetMult?: number;
  messages: DroneMessage[];
  lastCollisionObstacleType?: ObstacleType | null;
}

export class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, DroneState[]>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  private getCellKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  insert(drone: DroneState) {
    const key = this.getCellKey(drone.position.x, drone.position.y);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key)!.push(drone);
  }

  getNeighbors(position: Vector2, radius: number): DroneState[] {
    const neighbors: DroneState[] = [];
    const cx = Math.floor(position.x / this.cellSize);
    const cy = Math.floor(position.y / this.cellSize);
    const searchRadius = Math.ceil(radius / this.cellSize);

    for (let i = -searchRadius; i <= searchRadius; i++) {
      for (let j = -searchRadius; j <= searchRadius; j++) {
        const key = `${cx + i},${cy + j}`;
        const cell = this.cells.get(key);
        if (cell) {
          for (const drone of cell) {
            if (position.distanceSq(drone.position) <= radius * radius) {
              neighbors.push(drone);
            }
          }
        }
      }
    }
    return neighbors;
  }
}
