import { describe, expect, it } from 'vitest';
import { World, resolveMovement } from '../src/index.js';
import type { Facing, Position, RobotSnapshot, WorldSnapshot } from '../src/index.js';

const p = (x: number, y: number) => ({ x, y });
const robot = (id: string, x: number, y: number, facing: Facing, queue: RobotSnapshot['queue'] = [{ type: 'MOVE' }], battery = 100): RobotSnapshot => ({ id, position: p(x, y), facing, queue, battery });
const world = (robots: readonly RobotSnapshot[], width = 5, height = 5, obstacles: readonly Position[] = []) => World.restore({ width, height, robots, obstacles, chargers: [], tick: 0, lifecycle: 'PAUSED' });
const positions = (w: World) => w.snapshot.robots.map(r => [r.id, r.position.x, r.position.y]);

describe('simultaneous movement', () => {
  it('E02/B01: turns at zero battery and consumes blocked ordinary MOVE once', () => {
    let w = world([robot('R1', 0, 0, 'NORTH', [{ type: 'LEFT' }, { type: 'RIGHT' }, { type: 'MOVE' }], 0)], 1, 1);
    const left = w.step();
    expect(left.outcomes[0]).toMatchObject({ facing: 'WEST', battery: 0, movement: { status: 'NOT_ATTEMPTED' }, command: { status: 'COMPLETED', type: 'LEFT' } });
    w = left.world.step().world;
    expect(w.snapshot.robots[0]?.facing).toBe('NORTH');
    const blocked = w.step();
    expect(blocked.outcomes[0]?.movement).toEqual({ status: 'BLOCKED', reason: 'NO_BATTERY' });
    expect(blocked.world.snapshot.robots[0]?.queue).toEqual([]);
    expect(blocked.world.step().outcomes[0]?.command).toEqual({ status: 'NONE' });
  });

  it('E03: compares numeric IDs for one contested destination', () => {
    const result = world([robot('R10', 2, 0, 'WEST'), robot('R2', 0, 0, 'EAST')]).step();
    expect(positions(result.world)).toEqual([['R2', 1, 0], ['R10', 2, 0]]);
    expect(result.outcomes[1]?.movement).toEqual({ status: 'BLOCKED', reason: 'CONTESTED', blockerId: 'R2' });
    expect(result.world.snapshot.robots.map(r => r.battery)).toEqual([99, 100]);
  });

  it('E03/E05: does not reconsider a loser when its winner is blocked', () => {
    const result = world([robot('R1', 0, 0, 'EAST'), robot('R2', 2, 0, 'WEST'), robot('R3', 1, 0, 'NORTH')], 3, 1).step();
    expect(positions(result.world)).toEqual([['R1', 0, 0], ['R2', 2, 0], ['R3', 1, 0]]);
    expect(result.outcomes.map(o => o.movement)).toEqual([
      { status: 'BLOCKED', reason: 'OCCUPIED', blockerId: 'R3' },
      { status: 'BLOCKED', reason: 'CONTESTED', blockerId: 'R1' },
      { status: 'BLOCKED', reason: 'OUT_OF_BOUNDS' },
    ]);
    expect(result.world.snapshot.robots.every(r => r.queue.length === 0)).toBe(true);
  });

  it('E04: blocks both head-on swaps but permits following into vacated cells', () => {
    const swap = world([robot('R1', 0, 0, 'EAST'), robot('R2', 1, 0, 'WEST')]).step();
    expect(swap.outcomes.map(o => o.movement)).toEqual([
      { status: 'BLOCKED', reason: 'HEAD_ON_SWAP', blockerId: 'R2' },
      { status: 'BLOCKED', reason: 'HEAD_ON_SWAP', blockerId: 'R1' },
    ]);
    const chain = world([robot('R1', 0, 0, 'EAST'), robot('R2', 1, 0, 'EAST'), robot('R3', 2, 0, 'EAST')]).step();
    expect(positions(chain.world)).toEqual([['R1', 1, 0], ['R2', 2, 0], ['R3', 3, 0]]);
    expect(chain.outcomes.every(o => o.movement.status === 'SUCCEEDED')).toBe(true);
  });

  it.each(['idle', 'turning', 'wall', 'obstacle'] as const)('E05: propagates blocking through a chain ending in %s', kind => {
    const end = robot('R3', 2, 0, 'EAST', kind === 'idle' ? [] : [{ type: kind === 'turning' ? 'LEFT' : 'MOVE' }]);
    const result = world([robot('R1', 0, 0, 'EAST'), robot('R2', 1, 0, 'EAST'), end], kind === 'wall' ? 3 : 4, 1, kind === 'obstacle' ? [p(3, 0)] : []).step();
    expect(positions(result.world)).toEqual([['R1', 0, 0], ['R2', 1, 0], ['R3', 2, 0]]);
    expect(result.outcomes.slice(0, 2).map(o => o.movement)).toEqual([
      { status: 'BLOCKED', reason: 'OCCUPIED', blockerId: 'R2' },
      { status: 'BLOCKED', reason: 'OCCUPIED', blockerId: 'R3' },
    ]);
  });

  it('E06: permits a four-robot rotation from one snapshot', () => {
    const result = world([robot('R1', 0, 0, 'NORTH'), robot('R2', 0, 1, 'EAST'), robot('R3', 1, 1, 'SOUTH'), robot('R4', 1, 0, 'WEST')], 2, 2).step();
    expect(positions(result.world)).toEqual([['R1', 0, 1], ['R2', 1, 1], ['R3', 1, 0], ['R4', 0, 0]]);
    expect(result.outcomes.every(o => o.movement.status === 'SUCCEEDED')).toBe(true);
  });

  it('E07: resolver is order independent before World sorts input; tick never mutates inputs', () => {
    const robots = [robot('R10', 2, 0, 'WEST'), robot('R2', 0, 0, 'EAST'), robot('R3', 3, 0, 'WEST')];
    const w = world(robots), before = JSON.stringify(w.snapshot);
    const intents = [{ robotId: 'R10', destination: p(1, 0) }, { robotId: 'R2', destination: p(1, 0) }, { robotId: 'R3', destination: p(2, 0) }];
    const expected = resolveMovement(w.snapshot, intents);
    for (const order of permutations(robots)) {
      for (const plans of permutations(intents)) {
        expect(resolveMovement({ ...w.snapshot, robots: order }, plans)).toEqual(expected);
      }
      expect(World.restore({ ...w.snapshot, robots: order }).step()).toEqual(w.step());
    }
    expect(JSON.stringify(w.snapshot)).toBe(before);
    expect(robots[0]?.queue).toEqual([{ type: 'MOVE' }]);
  });

  it('L03: idle Step advances time, stays Paused and leaves t0 intact; automatic ticks require Playing', () => {
    const paused = World.create(1, 1).finishSetup();
    const result = paused.step();
    expect(result.world.snapshot).toEqual({ ...paused.snapshot, tick: 1 });
    expect(result.world.baseline).toEqual(paused.baseline);
    expect(result.outcomes).toEqual([]);
    expect(() => paused.automaticTick()).toThrow();
    const playing = paused.play();
    expect(playing.automaticTick().world.snapshot).toEqual({ ...playing.snapshot, tick: 1 });
  });
});

function permutations<T>(items: readonly T[]): T[][] {
  if (!items.length) return [[]];
  return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(tail => [item, ...tail]));
}
