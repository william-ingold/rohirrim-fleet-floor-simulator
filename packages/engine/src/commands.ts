import { FACINGS, forward, freeze, samePosition } from './types.js';
import { firstStep } from './pathfinding.js';
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
const gotoCompleted = (): CommandResolution => ({ remaining: null, progress: { status: 'COMPLETED', type: 'GOTO' } });
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
  propose({ robot, world }: CommandContext): CommandPlan {
    if (samePosition(robot.position, this.target)) return freeze({ facing: robot.facing, destination: null, resolution: gotoCompleted() });
    const facing = firstStep(world, robot, this.target);
    const failures = facing === null ? this.consecutiveNoPathTicks + 1 : 0;
    const resolution: CommandResolution = failures === 3
      ? { remaining: null, progress: { status: 'ABANDONED', type: 'GOTO', reason: 'UNREACHABLE' } }
      : { remaining: new GotoCommand(this.target, failures).toSnapshot(), progress: { status: 'CONTINUING', type: 'GOTO' } };
    return freeze({ facing: facing ?? robot.facing, destination: facing === null ? null : forward(robot.position, facing), resolution });
  }
  resolve(position: Position, plan: CommandPlan): CommandResolution {
    return samePosition(position, this.target)
      ? freeze(gotoCompleted())
      : plan.resolution;
  }
}
export function restoreCommand(snapshot: CommandSnapshot): Command {
  switch (snapshot.type) {
    case 'MOVE': return new MoveCommand();
    case 'LEFT': return new LeftCommand();
    case 'RIGHT': return new RightCommand();
    case 'GOTO': return new GotoCommand(snapshot.target, snapshot.consecutiveNoPathTicks);
  }
}
