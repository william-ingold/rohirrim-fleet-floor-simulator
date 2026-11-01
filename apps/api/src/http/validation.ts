import { DomainError } from '@rohirrim/engine';
import type { CommandInput, Facing, Position } from '@rohirrim/engine';
import type { HistoryQuery, WorldAction } from '../floors/types.js';

function check(condition: unknown, message = 'Invalid request'): asserts condition {
  if (!condition) throw new DomainError(message);
}
function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: readonly string[]): void {
  check(Object.keys(value).every(key => allowed.includes(key)), 'Unexpected request field');
}
function integer(value: unknown): number {
  check(typeof value === 'number' && Number.isSafeInteger(value), 'Expected a safe integer');
  return value;
}
function size(value: unknown): number {
  const result = integer(value);
  check(result >= 1 && result <= 20, 'Dimensions must be from 1 through 20');
  return result;
}
function position(value: unknown): Position {
  const input = object(value); fields(input, ['x', 'y']);
  return { x: integer(input.x), y: integer(input.y) };
}
function robotId(value: unknown): string {
  check(typeof value === 'string' && /^R\d+$/i.test(value) && Number.isSafeInteger(Number(value.slice(1))) && Number(value.slice(1)) > 0, 'Invalid robot ID');
  return value;
}
function facing(value: unknown): Facing {
  check(value === 'NORTH' || value === 'EAST' || value === 'SOUTH' || value === 'WEST', 'Invalid facing');
  return value;
}
function command(value: unknown): CommandInput {
  const input = object(value);
  if (input.type === 'GOTO') {
    fields(input, ['type', 'target']);
    return { type: 'GOTO', target: position(input.target) };
  }
  fields(input, ['type']);
  check(input.type === 'MOVE' || input.type === 'LEFT' || input.type === 'RIGHT', 'Invalid command');
  return { type: input.type };
}
export function parseCreate(value: unknown): { width?: number; height?: number } {
  const input = object(value === undefined ? {} : value); fields(input, ['width', 'height']);
  return { ...('width' in input ? { width: size(input.width) } : {}), ...('height' in input ? { height: size(input.height) } : {}) };
}
export function parseAction(value: unknown): WorldAction {
  const input = object(value);
  switch (input.type) {
    case 'FINISH_SETUP': case 'PAUSE': case 'STEP': case 'END': case 'CANCEL':
      fields(input, ['type']); return { type: input.type };
    case 'RESIZE':
      fields(input, ['type', 'width', 'height']); return { type: input.type, width: size(input.width), height: size(input.height) };
    case 'PLACE_ROBOT':
      fields(input, ['type', 'position', 'robotId', 'facing']);
      return { type: input.type, position: position(input.position), ...('robotId' in input ? { robotId: robotId(input.robotId) } : {}), ...('facing' in input ? { facing: facing(input.facing) } : {}) };
    case 'SET_OBSTACLE': case 'SET_CHARGER':
      fields(input, ['type', 'position', 'enabled']); check(typeof input.enabled === 'boolean', 'Expected enabled boolean');
      return { type: input.type, position: position(input.position), enabled: input.enabled };
    case 'ENQUEUE_COMMANDS':
      fields(input, ['type', 'robotId', 'commands']); check(Array.isArray(input.commands) && input.commands.length > 0, 'Expected nonempty commands');
      return { type: input.type, robotId: robotId(input.robotId), commands: input.commands.map(command) };
    case 'CLEAR_QUEUE': case 'REMOVE_ROBOT':
      fields(input, ['type', 'robotId']); return { type: input.type, robotId: robotId(input.robotId) };
    case 'SET_ROBOT_FACING':
      fields(input, ['type', 'robotId', 'facing']); return { type: input.type, robotId: robotId(input.robotId), facing: facing(input.facing) };
    case 'PLAY': {
      fields(input, ['type', 'tickIntervalMs']); const interval = integer(input.tickIntervalMs);
      check(interval >= 100 && interval <= 5000, 'tickIntervalMs must be from 100 through 5000');
      return { type: input.type, tickIntervalMs: interval };
    }
    default: throw new DomainError('Unknown world action');
  }
}
export function parseHistory(value: unknown): HistoryQuery {
  const input = object(value); fields(input, ['afterRevision', 'throughRevision', 'limit']);
  const result: { afterRevision?: number; throughRevision?: number; limit?: number } = {};
  for (const name of ['afterRevision', 'throughRevision', 'limit'] as const) {
    if (!(name in input)) continue;
    const text = input[name];
    check(typeof text === 'string' && /^\d+$/.test(text), 'Expected decimal history cursor');
    result[name] = integer(Number(text));
  }
  return result;
}
export function parsePresence(value: unknown): string {
  const input = object(value); fields(input, ['subscriptionId']);
  check(typeof input.subscriptionId === 'string' && input.subscriptionId.length > 0, 'Expected subscriptionId');
  return input.subscriptionId;
}
