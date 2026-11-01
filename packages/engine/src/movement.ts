import { freeze, inBounds, key, numericId, requireDomain, samePosition } from './types.js';
import type { BlockedReason, Movement, Position, WorldSnapshot } from './types.js';

export type MovementIntent = { readonly robotId: string; readonly destination: Position };
export type MovementResolution = { readonly robotId: string; readonly movement: Movement };

/** Resolve only permissions against starting occupancy; no positions are changed here. */
export function resolveMovement(snapshot: WorldSnapshot, intents: readonly MovementIntent[]): readonly MovementResolution[] {
  const robots = new Map(snapshot.robots.map(r => [r.id, r]));
  const occupancy = new Map(snapshot.robots.map(r => [key(r.position), r.id]));
  const obstacles = new Set(snapshot.obstacles.map(key));
  const results = new Map<string, Movement>();
  const candidates = new Map<string, MovementIntent>();
  const destinations = new Map<string, string>();
  const block = (id: string, reason: BlockedReason, blockerId?: string) => {
    results.set(id, blockerId === undefined ? { status: 'BLOCKED', reason } : { status: 'BLOCKED', reason, blockerId });
  };
  const seen = new Set<string>();
  for (const intent of [...intents].sort((a, b) => numericId(a.robotId) - numericId(b.robotId))) {
    const robot = robots.get(intent.robotId);
    requireDomain(robot && !seen.has(intent.robotId), 'Invalid/duplicate movement intent'); seen.add(intent.robotId);
    requireDomain(Math.abs(robot.position.x - intent.destination.x) + Math.abs(robot.position.y - intent.destination.y) === 1, 'Intent must move one cardinal cell');
    if (robot.battery === 0) { block(robot.id, 'NO_BATTERY'); continue; }
    if (!inBounds(intent.destination, snapshot.width, snapshot.height)) { block(robot.id, 'OUT_OF_BOUNDS'); continue; }
    if (obstacles.has(key(intent.destination))) { block(robot.id, 'OBSTACLE'); continue; }
    const winner = destinations.get(key(intent.destination));
    if (winner) { block(robot.id, 'CONTESTED', winner); continue; }
    destinations.set(key(intent.destination), robot.id); candidates.set(robot.id, intent);
  }
  // After contention is final, swaps block both participants before dependencies.
  for (const [id, intent] of candidates) {
    const occupant = occupancy.get(key(intent.destination));
    const other = occupant ? candidates.get(occupant) : undefined;
    if (other && samePosition(other.destination, robots.get(id)!.position)) block(id, 'HEAD_ON_SWAP', occupant);
  }
  // Each winner has at most one dependency. A back edge denotes a permitted
  // cycle (two-cycles were removed above); an empty cell terminates a free chain.
  const visiting = new Set<string>();
  function succeeds(id: string): boolean {
    const resolved = results.get(id);
    if (resolved) return resolved.status === 'SUCCEEDED';
    if (visiting.has(id)) return true;
    const intent = candidates.get(id);
    if (!intent) return false;
    visiting.add(id);
    const occupant = occupancy.get(key(intent.destination));
    const success = occupant === undefined || succeeds(occupant);
    visiting.delete(id);
    if (success) results.set(id, { status: 'SUCCEEDED' });
    else block(id, 'OCCUPIED', occupant);
    return success;
  }
  for (const id of candidates.keys()) succeeds(id);
  return freeze(snapshot.robots.map(r => ({ robotId: r.id, movement: results.get(r.id) ?? { status: 'NOT_ATTEMPTED' as const } })).sort((a, b) => numericId(a.robotId) - numericId(b.robotId)));
}
