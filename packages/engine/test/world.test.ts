import { describe, expect, it } from 'vitest';
import { World, DomainError } from '../src/index.js';

const p = (x: number, y: number) => ({ x, y });

describe('B1 construction, edits and lifecycle', () => {
  it('E01: validates dimensions, placement, features and southwest coordinates atomically', () => {
    for (const width of [0, 21, 1.1, NaN]) expect(() => World.create(width, 1)).toThrow(DomainError);
    for (const size of [1, 20]) expect(World.create(size, size).snapshot.width).toBe(size);
    const world = World.create(3, 2).setObstacle(p(1, 1), true).placeRobot(p(0, 0));
    expect(world.snapshot.robots[0]).toMatchObject({ id: 'R1', position: p(0, 0), facing: 'NORTH', battery: 100 });
    const before = world.snapshot;
    for (const position of [p(-1, 0), p(3, 0), p(1, 1), p(0, 0)]) {
      expect(() => world.placeRobot(position)).toThrow(DomainError);
    }
    expect(() => world.setObstacle(p(0, 0), true)).toThrow(DomainError);
    expect(world.snapshot).toEqual(before);
  });

  it('E01/E07: allocates smallest unused ID and keeps numeric serialization order', () => {
    const world = World.create().placeRobot(p(0, 0), 'r010').placeRobot(p(1, 0), 'R2').placeRobot(p(2, 0));
    expect(world.snapshot.robots.map(r => r.id)).toEqual(['R1', 'R2', 'R10']);
    expect(() => world.placeRobot(p(3, 0), 'R0')).toThrow(DomainError);
    expect(() => world.placeRobot(p(3, 0), 'R9007199254740992')).toThrow(DomainError);
  });

  it('L01/L02/L03: captures immutable paused t0, guards lifecycle, and returns identical no-ops', () => {
    const setup = World.create(2, 2).placeRobot(p(0, 0));
    expect(setup.baseline).toBeNull();
    expect(() => setup.step()).toThrow(DomainError);
    expect(() => setup.end()).toThrow(DomainError);
    const paused = setup.finishSetup();
    expect(paused.baseline).toEqual({ ...setup.snapshot, lifecycle: 'PAUSED' });
    const edited = paused.enqueue('R1', [{ type: 'LEFT' }]).setCharger(p(0, 0), true);
    expect(edited.baseline).toEqual(paused.snapshot);
    expect(edited.pause()).toBe(edited);
    expect(() => edited.resize(3, 3)).toThrow(DomainError);
    const playing = edited.play();
    expect(playing.play()).toBe(playing);
    expect(() => playing.clearQueue('R1')).toThrow(DomainError);
    expect(() => playing.step()).toThrow(DomainError);
    const ended = playing.end();
    expect(ended.end()).toBe(ended);
    for (const action of [() => ended.play(), () => ended.pause(), () => ended.step(), () => ended.placeRobot(p(1, 1)), () => ended.setCharger(p(1, 1), true)]) {
      expect(action).toThrow(DomainError);
    }
    expect(edited.baseline).toEqual(paused.snapshot);
    expect(edited.setCharger(p(0, 0), true)).toBe(edited);
  });

  it('L04: resize preserves all contents and rejects any out-of-bounds feature/robot/GOTO', () => {
    const variants = [
      World.create(3, 3).placeRobot(p(2, 2)),
      World.create(3, 3).setObstacle(p(2, 2), true),
      World.create(3, 3).setCharger(p(2, 2), true),
      World.create(3, 3).placeRobot(p(0, 0)).enqueue('R1', [{ type: 'LEFT' }, { type: 'GOTO', target: p(2, 2) }]),
    ];
    for (const world of variants) {
      const before = world.snapshot;
      expect(() => world.resize(2, 2)).toThrow(DomainError);
      expect(world.snapshot).toEqual(before);
      expect(world.resize(4, 4).snapshot).toEqual({ ...before, width: 4, height: 4 });
    }
  });

  it('E07/B05: queues and input positions are deeply immutable; features remain independent', () => {
    const position = p(0, 0);
    const command = { type: 'GOTO' as const, target: p(1, 1) };
    const batch = [command];
    const world = World.create(2, 2).placeRobot(position).enqueue('R1', batch);
    position.x = 99; command.target.x = 99; batch.length = 0;
    expect(world.snapshot.robots[0]?.queue).toEqual([{ type: 'GOTO', target: p(1, 1), consecutiveNoPathTicks: 0 }]);
    expect(() => { (world.snapshot.robots as unknown[]).pop(); }).toThrow();
    expect(() => { (world.snapshot.robots[0]!.position as { x: number }).x = 4; }).toThrow();
    expect(world.clearQueue('R1').snapshot.robots[0]?.queue).toEqual([]);
    expect(world.snapshot.robots[0]?.queue).toHaveLength(1);
    const features = world.setCharger(p(1, 0), true).setObstacle(p(1, 0), true);
    expect(features.setObstacle(p(1, 0), false).snapshot.chargers).toEqual([p(1, 0)]);
    expect(features.setCharger(p(1, 0), false).snapshot.obstacles).toEqual([p(1, 0)]);
  });

  it('E07: validates complete hydrated snapshots and atomic enqueue batches', () => {
    const world = World.create(2, 2).placeRobot(p(0, 0));
    const invalid = [
      { ...world.snapshot, tick: -1 }, { ...world.snapshot, lifecycle: 'CANCELLED' },
      { ...world.snapshot, obstacles: [p(0, 0)] },
      { ...world.snapshot, robots: [...world.snapshot.robots, { ...world.snapshot.robots[0], id: 'R2' }] },
      ...[-1, 101, 0.5].map(battery => ({ ...world.snapshot, robots: [{ ...world.snapshot.robots[0], battery }] })),
      ...[3, -1, 0.5].map(consecutiveNoPathTicks => ({ ...world.snapshot, robots: [{ ...world.snapshot.robots[0], queue: [{ type: 'GOTO', target: p(1, 1), consecutiveNoPathTicks }] }] })),
      { ...world.snapshot, robots: [{ ...world.snapshot.robots[0], queue: [{ type: 'LEFT' }, { type: 'GOTO', target: p(1, 1), consecutiveNoPathTicks: 1 }] }] },
      { ...world.snapshot, robots: [{ ...world.snapshot.robots[0], id: 'R01' }] },
      { ...world.snapshot, chargers: [p(2, 0)] },
      { ...world.snapshot, obstacles: [p(1, 1), p(1, 1)] },
    ];
    for (const snapshot of invalid) expect(() => World.restore(snapshot)).toThrow(DomainError);
    expect(World.restore(world.snapshot).snapshot).toEqual(world.snapshot);
    for (const batch of [[], [{ type: 'LEFT' }, { type: 'UNKNOWN' }], [{ type: 'GOTO', target: p(2, 1) }], [{ type: 'GOTO', target: p(1, 1), consecutiveNoPathTicks: 2 }]]) {
      expect(() => world.enqueue('R1', batch as never)).toThrow(DomainError);
    }
    expect(() => world.enqueue('R2', [{ type: 'MOVE' }])).toThrow(DomainError);
    expect(world.snapshot.robots[0]?.queue).toEqual([]);
    expect(world.enqueue('R1', [{ type: 'GOTO', target: p(0, 0) }]).snapshot.robots[0]?.queue).toHaveLength(1);
  });
});
