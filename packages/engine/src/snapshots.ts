import { canonicalId, FACINGS, freeze, inBounds, key, numericId, requireDomain } from './types.js';
import type { CommandSnapshot, Position, WorldSnapshot } from './types.js';

function record(value: unknown): asserts value is Record<string, unknown> {
  requireDomain(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
}
function position(value: unknown, width: number, height: number): asserts value is Position {
  record(value);
  requireDomain(typeof value.x === 'number' && typeof value.y === 'number' && inBounds(value as Position, width, height), 'Invalid position');
}
export function validateCommand(value: unknown, width: number, height: number, index: number): asserts value is CommandSnapshot {
  record(value);
  requireDomain(['MOVE', 'LEFT', 'RIGHT', 'GOTO'].includes(value.type as string), 'Invalid command');
  if (value.type === 'GOTO') {
    position(value.target, width, height);
    requireDomain(Number.isInteger(value.consecutiveNoPathTicks) && Number(value.consecutiveNoPathTicks) >= 0 && Number(value.consecutiveNoPathTicks) <= 2, 'Invalid GOTO progress');
    requireDomain(index === 0 || value.consecutiveNoPathTicks === 0, 'Only head GOTO may have progress');
  }
}

/** Validates unknown JSON, copies nested values, and canonicalizes serialization order. */
export function validateSnapshot(value: unknown): WorldSnapshot {
  record(value);
  const { width, height, tick, lifecycle, obstacles, chargers, robots } = value;
  requireDomain(typeof width === 'number' && Number.isInteger(width) && width >= 1 && width <= 20, 'Invalid width');
  requireDomain(typeof height === 'number' && Number.isInteger(height) && height >= 1 && height <= 20, 'Invalid height');
  requireDomain(Number.isSafeInteger(tick) && Number(tick) >= 0, 'Invalid tick');
  requireDomain(['SETTING_UP', 'PAUSED', 'PLAYING', 'ENDED'].includes(lifecycle as string), 'Invalid lifecycle');
  requireDomain(lifecycle !== 'SETTING_UP' || tick === 0, 'Setup cannot have elapsed ticks');
  function cells(items: unknown): Position[] {
    requireDomain(Array.isArray(items), 'Expected cell array');
    const seen = new Set<string>();
    return items.map(item => {
      position(item, width as number, height as number);
      requireDomain(!seen.has(key(item)), 'Duplicate cell'); seen.add(key(item));
      return { x: item.x, y: item.y };
    }).sort((a, b) => a.y - b.y || a.x - b.x);
  }
  const obstacleCells = cells(obstacles), chargerCells = cells(chargers);
  const blocked = new Set(obstacleCells.map(key)), occupied = new Set<string>(), ids = new Set<string>();
  requireDomain(Array.isArray(robots), 'Expected robots');
  const robotStates = robots.map(robot => {
    record(robot);
    requireDomain(typeof robot.id === 'string' && canonicalId(robot.id) === robot.id && !ids.has(robot.id), 'Invalid/duplicate canonical identity');
    ids.add(robot.id);
    position(robot.position, width, height);
    requireDomain(!occupied.has(key(robot.position)) && !blocked.has(key(robot.position)), 'Invalid occupancy'); occupied.add(key(robot.position));
    requireDomain(FACINGS.includes(robot.facing as never), 'Invalid facing');
    requireDomain(Number.isInteger(robot.battery) && Number(robot.battery) >= 0 && Number(robot.battery) <= 100, 'Invalid battery');
    requireDomain(Array.isArray(robot.queue), 'Invalid queue');
    const queue = robot.queue.map((command: unknown, index: number): CommandSnapshot => {
      validateCommand(command, width, height, index);
      return command.type === 'GOTO' ? { type: 'GOTO', target: { ...command.target }, consecutiveNoPathTicks: command.consecutiveNoPathTicks } : { type: command.type };
    });
    return { id: robot.id, position: { ...robot.position }, facing: robot.facing as WorldSnapshot['robots'][number]['facing'], battery: Number(robot.battery), queue };
  }).sort((a, b) => numericId(a.id) - numericId(b.id));
  return freeze({ width, height, tick: Number(tick), lifecycle: lifecycle as WorldSnapshot['lifecycle'], obstacles: obstacleCells, chargers: chargerCells, robots: robotStates });
}
