import { FACINGS, forward, freeze } from './types.js';
import type { CommandProgress, CommandSnapshot, Facing, Position, RobotSnapshot, WorldSnapshot } from './types.js';

export type CommandResolution = { readonly remaining: CommandSnapshot | null; readonly progress: CommandProgress };
export type CommandPlan = { readonly facing: Facing; readonly destination: Position | null; readonly resolution: CommandResolution };
export type CommandContext = { readonly robot: RobotSnapshot; readonly world: WorldSnapshot };
export interface Command {
  toSnapshot(): CommandSnapshot;
  propose(context: CommandContext): CommandPlan;
  resolve(position: Position, plan: CommandPlan): CommandResolution;
}
const completed = (type: 'MOVE' | 'LEFT' | 'RIGHT'): CommandResolution => ({ remaining: null, progress: { status: 'COMPLETED', type } });
function turnPlan(robot: RobotSnapshot, type: 'LEFT' | 'RIGHT'): CommandPlan {
  return freeze({ facing: FACINGS[(FACINGS.indexOf(robot.facing) + (type === 'LEFT' ? 3 : 1)) % 4]!, destination: null, resolution: completed(type) });
}
export class MoveCommand implements Command {
  constructor() { Object.freeze(this); }
  toSnapshot(): CommandSnapshot { return freeze({ type: 'MOVE' }); }
  propose({ robot }: CommandContext): CommandPlan { return freeze({ facing: robot.facing, destination: forward(robot.position, robot.facing), resolution: completed('MOVE') }); }
  resolve(_position: Position, plan: CommandPlan): CommandResolution { return plan.resolution; }
}
export class LeftCommand implements Command {
  constructor() { Object.freeze(this); }
  toSnapshot(): CommandSnapshot { return freeze({ type: 'LEFT' }); }
  propose({ robot }: CommandContext): CommandPlan { return turnPlan(robot, 'LEFT'); }
  resolve(_position: Position, plan: CommandPlan): CommandResolution { return plan.resolution; }
}
export class RightCommand implements Command {
  constructor() { Object.freeze(this); }
  toSnapshot(): CommandSnapshot { return freeze({ type: 'RIGHT' }); }
  propose({ robot }: CommandContext): CommandPlan { return turnPlan(robot, 'RIGHT'); }
  resolve(_position: Position, plan: CommandPlan): CommandResolution { return plan.resolution; }
}
export class GotoCommand implements Command {
  readonly target: Position;
  constructor(target: Position, readonly consecutiveNoPathTicks = 0) {
    this.target = freeze({ ...target }); Object.freeze(this);
  }
  toSnapshot(): CommandSnapshot { return freeze({ type: 'GOTO', target: this.target, consecutiveNoPathTicks: this.consecutiveNoPathTicks }); }
  propose(_context: CommandContext): CommandPlan { throw new Error('GOTO planning not implemented'); }
  resolve(_position: Position, plan: CommandPlan): CommandResolution { return plan.resolution; }
}
export function restoreCommand(snapshot: CommandSnapshot): Command {
  switch (snapshot.type) {
    case 'MOVE': return new MoveCommand();
    case 'LEFT': return new LeftCommand();
    case 'RIGHT': return new RightCommand();
    case 'GOTO': return new GotoCommand(snapshot.target, snapshot.consecutiveNoPathTicks);
  }
}
