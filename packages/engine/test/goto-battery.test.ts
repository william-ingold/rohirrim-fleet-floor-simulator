import { describe, expect, it } from 'vitest';
import { DomainError, World } from '../src/index.js';
import type { CommandSnapshot, Facing, Position, RobotSnapshot } from '../src/index.js';

const p = (x: number, y: number) => ({ x, y });
const go = (x: number, y: number, consecutiveNoPathTicks = 0): CommandSnapshot => ({ type: 'GOTO', target: p(x, y), consecutiveNoPathTicks });
const robot = (id: string, x: number, y: number, facing: Facing, queue: readonly CommandSnapshot[], battery = 100): RobotSnapshot => ({ id, position: p(x, y), facing, queue, battery });
const world = (robots: readonly RobotSnapshot[], width = 5, height = 5, obstacles: readonly Position[] = [], chargers: readonly Position[] = []) => World.restore({ width, height, robots, obstacles, chargers, tick: 0, lifecycle: 'PAUSED' });

describe('GOTO planning and progress', () => {
  it.each([
    [p(2, 2), 'NORTH', p(1, 2)], [p(2, 0), 'EAST', p(2, 1)],
    [p(0, 0), 'SOUTH', p(1, 0)], [p(0, 2), 'NORTH', p(1, 2)],
  ] as const)('P01: equal shortest paths to %j prefer %s', (target, facing, position) => {
    const result = world([robot('R1', 1, 1, 'WEST', [go(target.x, target.y)])], 3, 3).step();
    expect(result.outcomes[0]).toMatchObject({ position, facing, movement: { status: 'SUCCEEDED' } });
  });

  it('P01/P03: uses a shortest detour and completes on arrival without executing successor', () => {
    let w = world([robot('R1', 0, 1, 'WEST', [go(2, 1), { type: 'RIGHT' }])], 3, 3, [p(1, 1)]);
    const path: Position[] = [];
    for (let i = 0; i < 4; i++) { w = w.step().world; path.push(w.snapshot.robots[0]!.position); }
    expect(path).toEqual([p(0, 2), p(1, 2), p(2, 2), p(2, 1)]);
    expect(w.snapshot.robots[0]).toMatchObject({ facing: 'SOUTH', battery: 96, queue: [{ type: 'RIGHT' }] });
    expect(w.step().world.snapshot.robots[0]?.facing).toBe('WEST');
  });

  it('P02/P04: a departing robot starting cell remains a wall; no-path preserves facing', () => {
    const result = world([robot('R1', 0, 0, 'NORTH', [go(2, 0)]), robot('R2', 1, 0, 'EAST', [{ type: 'MOVE' }])], 3, 1).step();
    expect(result.outcomes[0]).toMatchObject({ position: p(0, 0), facing: 'NORTH', movement: { status: 'NOT_ATTEMPTED' }, command: { status: 'CONTINUING', type: 'GOTO' } });
    expect(result.world.snapshot.robots[0]?.queue).toEqual([go(2, 0, 1)]);
    expect(result.world.snapshot.robots[1]?.position).toEqual(p(2, 0));
  });

  it('P03/P06: already-at-target consumes a tick even at zero battery', () => {
    const result = world([robot('R1', 1, 1, 'SOUTH', [go(1, 1), { type: 'LEFT' }], 0)]).step();
    expect(result.outcomes[0]).toEqual({ robotId: 'R1', position: p(1, 1), facing: 'SOUTH', battery: 0, movement: { status: 'NOT_ATTEMPTED' }, command: { status: 'COMPLETED', type: 'GOTO' } });
    expect(result.world.snapshot.robots[0]?.queue).toEqual([{ type: 'LEFT' }]);
  });

  it('P04/P06: abandons only the head on third consecutive no-path tick and records UNREACHABLE', () => {
    let w = world([robot('R1', 0, 0, 'WEST', [go(1, 0), go(1, 0), { type: 'RIGHT' }], 0)], 2, 1, [p(1, 0)]);
    const original = w.snapshot;
    for (let count = 1; count <= 2; count++) {
      w = w.step().world;
      expect(w.snapshot.robots[0]?.queue).toEqual([go(1, 0, count), go(1, 0), { type: 'RIGHT' }]);
    }
    const abandoned = w.step();
    expect(abandoned.outcomes[0]).toMatchObject({ facing: 'WEST', battery: 0, movement: { status: 'NOT_ATTEMPTED' }, command: { status: 'ABANDONED', type: 'GOTO', reason: 'UNREACHABLE' } });
    expect(abandoned.world.snapshot.robots[0]?.queue).toEqual([go(1, 0), { type: 'RIGHT' }]);
    expect(original.robots[0]?.queue).toEqual([go(1, 0), go(1, 0), { type: 'RIGHT' }]);
  });

  it('P05: a found path resets progress and changes facing even when losing contention', () => {
    const result = world([robot('R1', 2, 0, 'WEST', [{ type: 'MOVE' }]), robot('R2', 0, 0, 'NORTH', [go(1, 0, 2), { type: 'LEFT' }])], 3, 2).step();
    expect(result.outcomes[1]).toMatchObject({ position: p(0, 0), facing: 'EAST', battery: 100, movement: { status: 'BLOCKED', reason: 'CONTESTED', blockerId: 'R1' }, command: { status: 'CONTINUING', type: 'GOTO' } });
    expect(result.world.snapshot.robots[1]?.queue).toEqual([go(1, 0), { type: 'LEFT' }]);
  });

  it('P06: a found path still turns and resets progress at zero battery', () => {
    const result = world([robot('R1', 0, 0, 'WEST', [go(1, 0, 2)], 0)], 2, 1).step();
    expect(result.outcomes[0]).toMatchObject({ facing: 'EAST', position: p(0, 0), movement: { status: 'BLOCKED', reason: 'NO_BATTERY' } });
    expect(result.world.snapshot.robots[0]?.queue).toEqual([go(1, 0)]);
  });

  it('E08: valid re-placement preserves battery and queue, resets active progress; invalid changes nothing', () => {
    const w = world([robot('R1', 0, 0, 'WEST', [go(2, 0, 2), go(0, 0)], 37)], 3, 2, [p(2, 1)]);
    const before = w.snapshot;
    expect(() => w.placeRobot(p(2, 1), 'R1', 'NORTH')).toThrow(DomainError);
    expect(w.snapshot).toEqual(before);
    const replaced = w.placeRobot(p(1, 1), 'r01', 'SOUTH');
    expect(replaced.snapshot.robots[0]).toEqual({ id: 'R1', position: p(1, 1), facing: 'SOUTH', battery: 37, queue: [go(2, 0), go(0, 0)] });
    expect(w.enqueue('R1', [{ type: 'RIGHT' }]).snapshot.robots[0]?.queue).toEqual([go(2, 0, 2), go(0, 0), { type: 'RIGHT' }]);
    expect(replaced.clearQueue('R1').snapshot.robots[0]).toMatchObject({ battery: 37, facing: 'SOUTH', queue: [] });
  });
});

describe('battery and charging order', () => {
  it('B01: approved D010 sample is 98, because the third MOVE hits the boundary', () => {
    let w = world([robot('R1', 0, 0, 'EAST', [{ type: 'MOVE' }, { type: 'MOVE' }, { type: 'MOVE' }])], 3, 1);
    for (let i = 0; i < 3; i++) w = w.step().world;
    expect(w.snapshot.robots[0]).toMatchObject({ position: p(2, 0), battery: 98, queue: [] });
  });

  it('B02: zero battery is excluded before contention and precedes wall/obstacle reasons', () => {
    const result = world([robot('R1', 0, 0, 'EAST', [{ type: 'MOVE' }], 0), robot('R2', 2, 0, 'WEST', [{ type: 'MOVE' }], 50)], 3, 1).step();
    expect(result.outcomes[0]?.movement).toEqual({ status: 'BLOCKED', reason: 'NO_BATTERY' });
    expect(result.outcomes[1]).toMatchObject({ position: p(1, 0), battery: 49, movement: { status: 'SUCCEEDED' } });
    for (const w of [world([robot('R1', 0, 0, 'WEST', [{ type: 'MOVE' }], 0)], 1, 1), world([robot('R1', 0, 0, 'EAST', [{ type: 'MOVE' }], 0)], 2, 1, [p(1, 0)])]) {
      expect(w.step().outcomes[0]?.movement).toEqual({ status: 'BLOCKED', reason: 'NO_BATTERY' });
    }
  });

  it.each(([[], [{ type: 'LEFT' }], [{ type: 'MOVE' }], [go(1, 0)]] as readonly (readonly CommandSnapshot[])[]).map(queue => ({ queue })))('B03: tick-end charges idle, turned, blocked or no-path robot $queue', ({ queue }) => {
    const result = world([robot('R1', 0, 0, 'WEST', queue, 95)], 2, 1, [p(1, 0)], [p(0, 0)]).step();
    expect(result.outcomes[0]?.battery).toBe(100);
  });

  it('B04/B05: zero on charger waits then leaves; moving onto/off chargers uses end cell; edits do not charge', () => {
    const before = world([robot('R1', 0, 0, 'EAST', [{ type: 'MOVE' }, { type: 'MOVE' }], 0)], 2, 1);
    const chargedCell = before.setCharger(p(0, 0), true);
    expect(chargedCell.snapshot.robots[0]?.battery).toBe(0);
    const wait = chargedCell.step();
    expect(wait.outcomes[0]).toMatchObject({ battery: 10, position: p(0, 0), movement: { status: 'BLOCKED', reason: 'NO_BATTERY' } });
    expect(wait.world.step().outcomes[0]).toMatchObject({ battery: 9, position: p(1, 0), movement: { status: 'SUCCEEDED' } });
    const onto = world([robot('R1', 0, 0, 'EAST', [{ type: 'MOVE' }], 1)], 2, 1, [], [p(1, 0)]).step();
    expect(onto.outcomes[0]).toMatchObject({ battery: 10, position: p(1, 0) });
  });
});
