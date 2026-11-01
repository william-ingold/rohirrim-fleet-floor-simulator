import { restoreCommand } from './commands.js';
import type { Command } from './commands.js';
import { freeze } from './types.js';
import type { CommandSnapshot, Facing, Position, RobotSnapshot } from './types.js';

/** Immutable local state. World validates cross-robot invariants before construction. */
export class Robot {
  readonly #state: RobotSnapshot;
  readonly #queue: readonly Command[];
  constructor(snapshot: RobotSnapshot) {
    this.#queue = Object.freeze(snapshot.queue.map(restoreCommand));
    this.#state = freeze({ ...snapshot, position: { ...snapshot.position }, queue: this.#queue.map(c => c.toSnapshot()) });
    Object.freeze(this);
  }
  get snapshot(): RobotSnapshot { return this.#state; }
  append(commands: readonly CommandSnapshot[]): Robot {
    return new Robot({ ...this.#state, queue: [...this.#state.queue, ...commands] });
  }
  clearQueue(): Robot { return new Robot({ ...this.#state, queue: [] }); }
  relocate(position: Position, facing: Facing): Robot {
    const queue = this.#state.queue.map((c, i) => i === 0 && c.type === 'GOTO' ? { ...c, consecutiveNoPathTicks: 0 } : c);
    return new Robot({ ...this.#state, position, facing, queue });
  }
}
