import { DroneState, SpatialGrid } from '../spatial_index/SpatialGrid';
import { Vector2 } from '../utils/Vector2';

export class MessageBus {
  private grid: SpatialGrid;
  private states: Map<string, DroneState>;

  constructor(cellSize: number = 50) {
    this.grid = new SpatialGrid(cellSize);
    this.states = new Map();
  }

  clear() {
    this.grid.clear();
    this.states.clear();
  }

  publish(state: DroneState) {
    this.states.set(state.id, state);
    this.grid.insert(state);
  }

  getNeighbors(droneId: string, radius: number): DroneState[] {
    const state = this.states.get(droneId);
    if (!state) return [];
    
    // Get all neighbors in radius, excluding self
    return this.grid.getNeighbors(state.position, radius).filter(d => d.id !== droneId);
  }
}
