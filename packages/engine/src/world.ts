import { guard, transition } from './lifecycle.js';
import { Robot } from './robot.js';
import { validateCommand, validateSnapshot } from './snapshots.js';
import { canonicalId, DomainError, inBounds, requireDomain, samePosition } from './types.js';
import type { CommandInput, CommandSnapshot, Facing, Position, WorldSnapshot } from './types.js';

export class World {
  readonly #state: WorldSnapshot;
  readonly #robots: readonly Robot[];
  readonly baseline: WorldSnapshot | null;
  private constructor(snapshot: unknown, baseline: WorldSnapshot | null = null) {
    this.#state = validateSnapshot(snapshot);
    this.#robots = Object.freeze(this.#state.robots.map(r => new Robot(r)));
    this.baseline = baseline;
    Object.freeze(this);
  }
  static create(width = 10, height = 8): World {
    return new World({ width, height, tick: 0, lifecycle: 'SETTING_UP', obstacles: [], chargers: [], robots: [] });
  }
  static restore(snapshot: unknown, baseline: unknown = null): World {
    const state = validateSnapshot(snapshot);
    const t0 = baseline === null ? null : validateSnapshot(baseline);
    if (t0) requireDomain(t0.tick === 0 && t0.lifecycle === 'PAUSED' && state.lifecycle !== 'SETTING_UP' && state.width === t0.width && state.height === t0.height, 'Invalid baseline');
    return new World(state, t0);
  }
  get snapshot(): WorldSnapshot { return this.#state; }
  private replace(changes: Partial<WorldSnapshot>): World { return new World({ ...this.#state, ...changes }, this.baseline); }
  private edit(): void { guard(this.#state.lifecycle, ['SETTING_UP', 'PAUSED']); }
  private changeLifecycle(action: 'FINISH_SETUP' | 'PLAY' | 'PAUSE' | 'END'): World {
    const lifecycle = transition(this.#state.lifecycle, action);
    if (lifecycle === this.#state.lifecycle) return this;
    const state = { ...this.#state, lifecycle };
    return new World(state, action === 'FINISH_SETUP' ? validateSnapshot(state) : this.baseline);
  }
  finishSetup(): World { return this.changeLifecycle('FINISH_SETUP'); }
  play(): World { return this.changeLifecycle('PLAY'); }
  pause(): World { return this.changeLifecycle('PAUSE'); }
  end(): World { return this.changeLifecycle('END'); }
  resize(width: number, height: number): World {
    guard(this.#state.lifecycle, ['SETTING_UP']);
    if (width === this.#state.width && height === this.#state.height) return this;
    return this.replace({ width, height });
  }
  placeRobot(position: Position, robotId?: string, facing: Facing = 'NORTH'): World {
    this.edit();
    let id: string;
    if (robotId === undefined) {
      const used = new Set(this.#state.robots.map(r => r.id));
      let next = 1; while (used.has(`R${next}`)) next++;
      id = `R${next}`;
    } else id = canonicalId(robotId);
    if (!inBounds(position, this.#state.width, this.#state.height) || this.#state.obstacles.some(p => samePosition(p, position)) || this.#state.robots.some(r => r.id !== id && samePosition(r.position, position))) {
      throw new DomainError('Placement is blocked or out of bounds', 'INVALID_PLACEMENT');
    }
    const existing = this.#robots.find(r => r.snapshot.id === id);
    const robot = existing ? existing.relocate(position, facing) : new Robot({ id, position, facing, battery: 100, queue: [] });
    if (existing && JSON.stringify(existing.snapshot) === JSON.stringify(robot.snapshot)) return this;
    return this.replace({ robots: [...this.#state.robots.filter(r => r.id !== id), robot.snapshot] });
  }
  private feature(name: 'obstacles' | 'chargers', position: Position, enabled: boolean): World {
    this.edit(); requireDomain(typeof enabled === 'boolean', 'Expected feature boolean');
    requireDomain(inBounds(position, this.#state.width, this.#state.height), 'Feature out of bounds');
    if (name === 'obstacles' && enabled && this.#state.robots.some(r => samePosition(r.position, position))) throw new DomainError('Robot occupies cell', 'INVALID_PLACEMENT');
    const cells = this.#state[name];
    if (cells.some(p => samePosition(p, position)) === enabled) return this;
    return this.replace({ [name]: enabled ? [...cells, position] : cells.filter(p => !samePosition(p, position)) });
  }
  setObstacle(position: Position, enabled: boolean): World { return this.feature('obstacles', position, enabled); }
  setCharger(position: Position, enabled: boolean): World { return this.feature('chargers', position, enabled); }
  private robot(id: string): Robot {
    const robot = this.#robots.find(r => r.snapshot.id === canonicalId(id));
    requireDomain(robot, 'Unknown robot'); return robot;
  }
  private replaceRobot(robot: Robot): World {
    return this.replace({ robots: this.#robots.map(r => r.snapshot.id === robot.snapshot.id ? robot.snapshot : r.snapshot) });
  }
  enqueue(id: string, commands: readonly CommandInput[]): World {
    this.edit(); const robot = this.robot(id);
    requireDomain(Array.isArray(commands) && commands.length > 0, 'Expected nonempty command batch');
    const snapshots = commands.map((c): CommandSnapshot => {
      requireDomain(c !== null && typeof c === 'object' && !('consecutiveNoPathTicks' in c), 'Client cannot assign command progress');
      const snapshot = c.type === 'GOTO' ? { ...c, consecutiveNoPathTicks: 0 } : { ...c };
      validateCommand(snapshot, this.#state.width, this.#state.height, 1);
      return snapshot;
    });
    return this.replaceRobot(robot.append(snapshots));
  }
  clearQueue(id: string): World {
    this.edit(); const robot = this.robot(id);
    return robot.snapshot.queue.length === 0 ? this : this.replaceRobot(robot.clearQueue());
  }
  step(): never { guard(this.#state.lifecycle, ['PAUSED']); throw new Error('Tick not implemented'); }
}
