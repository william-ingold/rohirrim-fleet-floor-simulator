export const FACINGS = ['NORTH', 'EAST', 'SOUTH', 'WEST'] as const;
export type Facing = typeof FACINGS[number];
export type Lifecycle = 'SETTING_UP' | 'PAUSED' | 'PLAYING' | 'ENDED';
export type Position = { readonly x: number; readonly y: number };
export type CommandInput = { readonly type: 'MOVE' | 'LEFT' | 'RIGHT' } | { readonly type: 'GOTO'; readonly target: Position };
export type CommandSnapshot = { readonly type: 'MOVE' | 'LEFT' | 'RIGHT' } | {
  readonly type: 'GOTO'; readonly target: Position; readonly consecutiveNoPathTicks: number;
};
export type RobotSnapshot = {
  readonly id: string; readonly position: Position; readonly facing: Facing;
  readonly battery: number; readonly queue: readonly CommandSnapshot[];
};
export type WorldSnapshot = {
  readonly width: number; readonly height: number; readonly tick: number;
  readonly lifecycle: Lifecycle; readonly obstacles: readonly Position[];
  readonly chargers: readonly Position[]; readonly robots: readonly RobotSnapshot[];
};
export type BlockedReason = 'NO_BATTERY' | 'OUT_OF_BOUNDS' | 'OBSTACLE' | 'CONTESTED' | 'HEAD_ON_SWAP' | 'OCCUPIED';
export type Movement = { readonly status: 'NOT_ATTEMPTED' | 'SUCCEEDED' } | {
  readonly status: 'BLOCKED'; readonly reason: BlockedReason; readonly blockerId?: string;
};
export type CommandProgress = { readonly status: 'NONE' } |
  { readonly status: 'COMPLETED'; readonly type: CommandSnapshot['type'] } |
  { readonly status: 'CONTINUING'; readonly type: 'GOTO' } |
  { readonly status: 'ABANDONED'; readonly type: 'GOTO'; readonly reason: 'UNREACHABLE' };
export type RobotTickOutcome = {
  readonly robotId: string; readonly position: Position; readonly facing: Facing;
  readonly battery: number; readonly movement: Movement; readonly command: CommandProgress;
};
export const forward = (position: Position, facing: Facing): Position => {
  const deltas = { NORTH: [0, 1], EAST: [1, 0], SOUTH: [0, -1], WEST: [-1, 0] } as const;
  const [dx, dy] = deltas[facing];
  return { x: position.x + dx, y: position.y + dy };
};
export class DomainError extends Error {
  constructor(message: string, readonly code: 'INVALID_REQUEST' | 'INVALID_PLACEMENT' | 'INVALID_LIFECYCLE' = 'INVALID_REQUEST') {
    super(message); this.name = 'DomainError';
  }
}
export function requireDomain(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError(message);
}
export const key = (p: Position): string => `${p.x},${p.y}`;
export const samePosition = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
export const numericId = (id: string): number => Number(id.slice(1));
export function canonicalId(id: string): string {
  requireDomain(typeof id === 'string' && /^r[0-9]+$/i.test(id), 'Invalid robot ID');
  const number = numericId(id);
  requireDomain(Number.isSafeInteger(number) && number > 0, 'Invalid robot ID number');
  return `R${number}`;
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function inBounds(p: Position, width: number, height: number): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < width && p.y >= 0 && p.y < height;
}
