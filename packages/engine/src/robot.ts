import { restoreCommand } from './commands.js';
import type { Command, CommandPlan } from './commands.js';
import { freeze } from './types.js';
import type { CommandSnapshot, Facing, Position, RobotSnapshot, RobotTickOutcome, Movement, WorldSnapshot } from './types.js';

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
  propose(world: WorldSnapshot): CommandPlan | null {
    return this.#queue[0]?.propose({ robot: this.#state, world }) ?? null;
  }
  resolveTick(plan: CommandPlan | null, movement: Movement, onCharger: boolean): { robot: Robot; outcome: RobotTickOutcome } {
    const position = movement.status === 'SUCCEEDED' ? plan!.destination! : this.#state.position;
    const resolution = plan ? this.#queue[0]!.resolve(position, plan) : { remaining: null, progress: { status: 'NONE' as const } };
    const queue = plan ? [...(resolution.remaining ? [resolution.remaining] : []), ...this.#state.queue.slice(1)] : this.#state.queue;
    const battery = this.#state.battery - (movement.status === 'SUCCEEDED' ? 1 : 0);
    const robot = new Robot({ ...this.#state, position, facing: plan?.facing ?? this.#state.facing, queue, battery: Math.min(100, battery + (onCharger ? 10 : 0)) });
    return { robot, outcome: freeze({ robotId: this.#state.id, position, facing: robot.snapshot.facing, battery: robot.snapshot.battery, movement, command: resolution.progress }) };
  }
  append(commands: readonly CommandSnapshot[]): Robot {
    return new Robot({ ...this.#state, queue: [...this.#state.queue, ...commands] });
  }
  clearQueue(): Robot { return new Robot({ ...this.#state, queue: [] }); }
  face(facing: Facing): Robot { return new Robot({ ...this.#state, facing }); }
  relocate(position: Position, facing: Facing): Robot {
    const queue = this.#state.queue.map((c, i) => i === 0 && c.type === 'GOTO' ? { ...c, consecutiveNoPathTicks: 0 } : c);
    return new Robot({ ...this.#state, position, facing, queue });
  }
}
