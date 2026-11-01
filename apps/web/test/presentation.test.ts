import { describe, it, expect } from 'vitest';
import { outcomeText } from '../src/lib/presentation.js';
import type { RobotSnapshot, RobotTickOutcome, WorldResponse } from '../src/lib/types.js';
const chargerWorld = (x: number, y: number): WorldResponse => ({ worldId: 'w', revision: 1, snapshotVersion: 1, runningTickIntervalMs: null, historyEntries: [], state: { width: 5, height: 5, tick: 1, lifecycle: 'PAUSED', robots: [], obstacles: [], chargers: [{ x, y }] } });
describe('independent committed effects', () => {
 it('describes a blocked GOTO turn and charging together', () => {
  const before: RobotSnapshot = { id: 'R2', position: { x: 1, y: 1 }, facing: 'NORTH', battery: 30, queue: [{ type: 'GOTO', target: { x: 4, y: 1 }, consecutiveNoPathTicks: 0 }] };
  const after: RobotSnapshot = { ...before, facing: 'EAST', battery: 40 };
  const outcome: RobotTickOutcome = { robotId: 'R2', position: after.position, facing: 'EAST', battery: 40, movement: { status: 'BLOCKED', reason: 'CONTESTED', blockerId: 'R1' }, command: { status: 'CONTINUING', type: 'GOTO' } };
  const world = chargerWorld(1, 1);
  const text = outcomeText(outcome, before, after, world);
  expect(text).toContain('turned to face East'); expect(text).toContain('R1 has the lower ID'); expect(text).toContain('battery 30 to 40');
 });
 it('keeps arrival and movement together and shows idle charging', () => {
  const before: RobotSnapshot = { id: 'R1', position: { x: 0, y: 0 }, facing: 'NORTH', battery: 90, queue: [{ type: 'GOTO', target: { x: 0, y: 1 }, consecutiveNoPathTicks: 0 }] };
  const after: RobotSnapshot = { ...before, position: { x: 0, y: 1 }, battery: 99, queue: [] };
  const outcome: RobotTickOutcome = { robotId: 'R1', position: after.position, facing: 'NORTH', battery: 99, movement: { status: 'SUCCEEDED' }, command: { status: 'COMPLETED', type: 'GOTO' } };
  const world = chargerWorld(0, 1);
  expect(outcomeText(outcome, before, after, world)).toContain('GOTO complete'); expect(outcomeText(outcome, before, after, world)).toContain('moved north');
  expect(outcomeText({ ...outcome, battery: 100, movement: { status: 'NOT_ATTEMPTED' }, command: { status: 'NONE' } }, after, { ...after, battery: 100 }, world)).toContain('battery 99 to 100, capped');
 });
});
