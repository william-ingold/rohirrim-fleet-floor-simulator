import { FACINGS, forward, inBounds, key, samePosition } from './types.js';
import type { Facing, Position, RobotSnapshot, WorldSnapshot } from './types.js';

/** BFS visits each cell once. Ordered expansion preserves the first-step tie break. */
export function firstStep(world: WorldSnapshot, robot: RobotSnapshot, target: Position): Facing | null {
  const walls = new Set([...world.obstacles.map(key), ...world.robots.filter(r => r.id !== robot.id).map(r => key(r.position))]);
  const visited = new Set([key(robot.position)]);
  const queue: { position: Position; first: Facing | null }[] = [{ position: robot.position, first: null }];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    for (const facing of FACINGS) {
      const position = forward(current.position, facing), cell = key(position);
      if (!inBounds(position, world.width, world.height) || walls.has(cell) || visited.has(cell)) continue;
      const first = current.first ?? facing;
      if (samePosition(position, target)) return first;
      visited.add(cell); queue.push({ position, first });
    }
  }
  return null;
}
