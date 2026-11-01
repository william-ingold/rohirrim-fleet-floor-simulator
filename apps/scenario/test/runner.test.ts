import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { World } from '@rohirrim/engine';
import { runScenario } from '../src/runner.js';

describe('C01–C07: isolated scenario execution through the public engine', () => {
  it.each(['chain', 'swap', 'contention', 'rotation', 'queues', 'battery', 'goto-charger'])('matches independently specified %s output', name => {
    const input = readFileSync(new URL(`../../../scenarios/${name}.txt`, import.meta.url), 'utf8');
    const expected = readFileSync(new URL(`../../../scenarios/${name}.stdout`, import.meta.url), 'utf8');
    expect(runScenario(input).stdout).toBe(expected);
  });

  it('uses a fresh default 5 x 5 floor and exact EMPTY reports', () => {
    const first = runScenario('PLACE R1 4,4,NORTH\nREPORT\nQUEUE R1 MOVE');
    expect(first.stdout).toBe('R1 4,4,NORTH\n');
    expect(first.world.snapshot).toMatchObject({ width: 5, height: 5, tick: 0, lifecycle: 'ENDED' });
    expect(runScenario('REPORT\nREPORT BATTERY').stdout).toBe('EMPTY\nEMPTY\n');
  });

  it('accepts mixed case, tabs, comma spacing and leading-zero IDs; sorts numerically', () => {
    const result = runScenario(' \t# comment\r\n\r\n floor 5 , 5\r\nplace r010 4 , 4 , west\r\nPLACE R02 0,0,north\r\nqueue r0002 right\r\ntick\r\nreport\r\nreport battery');
    expect(result.stdout).toBe('R2 0,0,EAST\nR10 4,4,WEST\nR2 100\nR10 100\n');
  });

  it.each([
    'FLOOR 0,5', 'FLOOR 21,5', 'FLOOR 2.5,5', 'FLOOR 1e1,5', 'FLOOR +5,5',
    'PLACE R0 1,0,NORTH', 'PLACE R9007199254740992 1,0,NORTH', 'PLACE R2 1.0,0,NORTH',
    'PLACE R2 -1,0,NORTH', 'PLACE R2 1e0,0,NORTH', 'PLACE R2 1,0,NORTH junk',
    'PLACE R2 1,0,NORTH # inline', 'PLACE R2 1,0,UP', 'PLACE R2 1,0',
    'QUEUE R1', 'QUEUE R1 MOVE UNKNOWN LEFT', 'QUEUE R1 MOVE GOTO 2,',
    'QUEUE R1 MOVE GOTO 5,0 LEFT', 'QUEUE R9 MOVE', 'QUEUE R1 MOVE # inline',
    'TICK 0', 'TICK -1', 'TICK +1', 'TICK 1.0', 'TICK 1e1', 'TICK 9007199254740992',
    'TICK 1 junk', 'REPORT junk', 'REPORT BATTERY junk', 'OBSTACLE 1,0 junk',
    'CHARGER 0,0 junk', 'GOTO 1,0', 'CLEAR R1',
  ])('rejects the entire invalid line without a state change: %s', line => {
    const prefix = 'PLACE R1 0,0,EAST\nQUEUE R1 LEFT\n';
    const result = runScenario(`${prefix}${line}\nREPORT\nTICK\nREPORT`);
    expect(result.world.snapshot)
      .toEqual(runScenario(`${prefix}REPORT\nTICK\nREPORT`).world.snapshot);
    expect(result.stdout).toBe('R1 0,0,EAST\nR1 0,0,NORTH\n');
  });

  it('rejects illegal placements/features atomically and keeps processing later lines', () => {
    const result = runScenario('PLACE R1 0,0,EAST\nPLACE R2 1,0,NORTH\nOBSTACLE 2,0\nPLACE R1 1,0,WEST\nPLACE R1 2,0,WEST\nPLACE R3 5,0,NORTH\nOBSTACLE 0,0\nOBSTACLE 5,0\nCHARGER 5,0\nQUEUE R1 MOVE\nTICK\nREPORT');
    expect(result.stdout).toBe('R1 0,0,EAST\nR2 1,0,NORTH\n');
    expect(result.world.snapshot.obstacles).toEqual([{ x: 2, y: 0 }]);
    expect(result.world.snapshot.chargers).toEqual([]);
    expect(result.world.snapshot.robots[0]?.queue).toEqual([]);
  });

  it('does not let REPORT or invalid TICK finalize setup; valid FLOOR clears all draft contents', () => {
    const result = runScenario('PLACE R1 4,4,NORTH\nQUEUE R1 MOVE\nOBSTACLE 3,3\nCHARGER 2,2\nREPORT\nTICK 0\nFLOOR 2,1\nREPORT\nREPORT BATTERY');
    expect(result.stdout).toBe('R1 4,4,NORTH\nEMPTY\nEMPTY\n');
    expect(result.world.snapshot).toEqual({ width: 2, height: 1, tick: 0, lifecycle: 'ENDED', robots: [], obstacles: [], chargers: [] });
    expect(result.world.baseline).toMatchObject({ width: 2, height: 1, tick: 0, lifecycle: 'PAUSED', robots: [] });
  });

  it('first valid TICK captures t0; later FLOOR is ignored, while paused edits are legal', () => {
    const result = runScenario('FLOOR 3,1\nPLACE R1 0,0,EAST\nQUEUE R1 MOVE MOVE\nTICK\nFLOOR 1,1\nPLACE R1 0,0,NORTH\nCHARGER 0,0\nQUEUE R1 RIGHT\nTICK\nREPORT\nREPORT BATTERY');
    expect(result.stdout).toBe('R1 0,0,NORTH\nR1 100\n');
    expect(result.world.snapshot).toMatchObject({ width: 3, height: 1, tick: 2, lifecycle: 'ENDED' });
    expect(result.world.baseline).toMatchObject({ tick: 0, lifecycle: 'PAUSED', chargers: [], robots: [{ position: { x: 0, y: 0 }, facing: 'EAST', battery: 100, queue: [{ type: 'MOVE' }, { type: 'MOVE' }] }] });
    expect(result.world.snapshot.robots[0]?.queue).toEqual([{ type: 'RIGHT' }]);
  });

  it('EOF finishes setup and ends, preserving pending commands without an extra report or tick', () => {
    const result = runScenario('PLACE R1 0,0,EAST\nQUEUE R1 GOTO 4,0 LEFT');
    expect(result.stdout).toBe('');
    expect(result.world.snapshot).toMatchObject({ tick: 0, lifecycle: 'ENDED', robots: [{ position: { x: 0, y: 0 }, battery: 100, queue: [{ type: 'GOTO', target: { x: 4, y: 0 }, consecutiveNoPathTicks: 0 }, { type: 'LEFT' }] }] });
    expect(result.world.baseline?.tick).toBe(0);
  });

  it('accepts unreachable in-bounds GOTO; abandons only on the third no-path tick', () => {
    const result = runScenario('FLOOR 2,1\nPLACE R1 0,0,WEST\nOBSTACLE 1,0\nQUEUE R1 GOTO 1,0 LEFT\nTICK 2\nREPORT\nREPORT BATTERY');
    expect(result.stdout).toBe('R1 0,0,WEST\nR1 100\n');
    expect(result.world.snapshot.robots[0]?.queue).toEqual([{ type: 'GOTO', target: { x: 1, y: 0 }, consecutiveNoPathTicks: 2 }, { type: 'LEFT' }]);
    const later = runScenario('FLOOR 2,1\nPLACE R1 0,0,WEST\nOBSTACLE 1,0\nQUEUE R1 GOTO 1,0 LEFT\nTICK 3\nREPORT\nTICK\nREPORT');
    expect(later.stdout).toBe('R1 0,0,WEST\nR1 0,0,SOUTH\n');
  });

  it('surfaces unexpected engine failures instead of treating them as bad input', () => {
    const fault = new Error('unexpected engine fault');
    const spy = vi.spyOn(World.prototype, 'placeRobot').mockImplementation(() => { throw fault; });
    try { expect(() => runScenario('PLACE R1 0,0,NORTH')).toThrow(fault); }
    finally { spy.mockRestore(); }
  });

  it('accepts spaced mixed GOTO batches and occupied in-bounds targets', () => {
    const result = runScenario('FLOOR 4,1\nPLACE R1 0,0,NORTH\nPLACE R2 3,0,WEST\nQUEUE R1 goto 2 , 0 left GOTO 3 , 0 right\nTICK 3\nREPORT\nTICK 2\nREPORT');
    expect(result.stdout).toBe('R1 2,0,NORTH\nR2 3,0,WEST\nR1 2,0,NORTH\nR2 3,0,WEST\n');
    expect(result.world.snapshot.robots[0]?.queue).toEqual([{ type: 'GOTO', target: { x: 3, y: 0 }, consecutiveNoPathTicks: 2 }, { type: 'RIGHT' }]);
  });

  it('REPORT BATTERY and malformed TICK leave FLOOR replacement available', () => {
    const result = runScenario('PLACE R1 0,0,EAST\nREPORT BATTERY\nTICK 1 junk\nFLOOR 1,1\nREPORT\nPLACE R2 0,0,SOUTH\nTICK 2\nREPORT');
    expect(result.stdout).toBe('R1 100\nEMPTY\nR2 0,0,SOUTH\n');
    expect(result.world.baseline).toMatchObject({ width: 1, height: 1, tick: 0, robots: [{ id: 'R2' }] });
  });

  it('uses numeric-ID contention and preserves progress/battery across valid re-placement', () => {
    const contention = runScenario('FLOOR 3,1\nPLACE R10 0,0,EAST\nPLACE R2 2,0,WEST\nQUEUE R10 MOVE\nQUEUE R2 MOVE\nTICK\nREPORT');
    expect(contention.stdout).toBe('R2 1,0,WEST\nR10 0,0,EAST\n');
    const result = runScenario('FLOOR 3,1\nPLACE R1 0,0,EAST\nQUEUE R1 MOVE GOTO 2,0 LEFT\nTICK\nOBSTACLE 2,0\nTICK 2\nPLACE R1 2,0,WEST\nREPORT\nPLACE R1 0,0,WEST\nREPORT BATTERY');
    expect(result.stdout).toBe('R1 1,0,EAST\nR1 99\n');
    expect(result.world.snapshot.robots[0]).toMatchObject({ position: { x: 0, y: 0 }, facing: 'WEST', battery: 99, queue: [{ type: 'GOTO', target: { x: 2, y: 0 }, consecutiveNoPathTicks: 0 }, { type: 'LEFT' }] });
  });
});
