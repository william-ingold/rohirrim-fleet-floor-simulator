export { DomainError } from './types.js';
export type { Facing, Lifecycle, Position, CommandInput, CommandSnapshot, RobotSnapshot, WorldSnapshot, BlockedReason, Movement, CommandProgress, RobotTickOutcome } from './types.js';
export { MoveCommand, LeftCommand, RightCommand, GotoCommand } from './commands.js';
export type { Command, CommandContext, CommandPlan, CommandResolution } from './commands.js';
export { Robot } from './robot.js';
export { World } from './world.js';
export type { TickResult } from './world.js';
export { resolveMovement } from './movement.js';
export type { MovementIntent, MovementResolution } from './movement.js';
