import { freeze } from './types.js';
import type { CommandSnapshot, Position } from './types.js';

export interface Command { toSnapshot(): CommandSnapshot }
export class MoveCommand implements Command {
  constructor() { Object.freeze(this); }
  toSnapshot(): CommandSnapshot { return freeze({ type: 'MOVE' }); }
}
export class LeftCommand implements Command {
  constructor() { Object.freeze(this); }
  toSnapshot(): CommandSnapshot { return freeze({ type: 'LEFT' }); }
}
export class RightCommand implements Command {
  constructor() { Object.freeze(this); }
  toSnapshot(): CommandSnapshot { return freeze({ type: 'RIGHT' }); }
}
export class GotoCommand implements Command {
  readonly target: Position;
  constructor(target: Position, readonly consecutiveNoPathTicks = 0) {
    this.target = freeze({ ...target }); Object.freeze(this);
  }
  toSnapshot(): CommandSnapshot { return freeze({ type: 'GOTO', target: this.target, consecutiveNoPathTicks: this.consecutiveNoPathTicks }); }
}
export function restoreCommand(snapshot: CommandSnapshot): Command {
  switch (snapshot.type) {
    case 'MOVE': return new MoveCommand();
    case 'LEFT': return new LeftCommand();
    case 'RIGHT': return new RightCommand();
    case 'GOTO': return new GotoCommand(snapshot.target, snapshot.consecutiveNoPathTicks);
  }
}
