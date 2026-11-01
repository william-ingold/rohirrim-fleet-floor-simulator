import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import Workbench from '../src/components/Workbench.svelte';
import type { SessionView } from '../src/lib/session.js';
import type { WorldAction, WorldResponse } from '../src/lib/types.js';
const world: WorldResponse = { worldId: 'test', revision: 2, snapshotVersion: 1, runningTickIntervalMs: null, historyEntries: [], state: { width: 10, height: 8, tick: 0, lifecycle: 'SETTING_UP', obstacles: [], chargers: [], robots: [{ id: 'R1', position: { x: 1, y: 0 }, facing: 'EAST', battery: 64, queue: [{ type: 'GOTO', target: { x: 8, y: 6 }, consecutiveNoPathTicks: 2 }] }] } };
function view(override: Partial<SessionView> = {}): SessionView { return { world, history: [], historyCursor: 0, connection: 'live', pending: '', error: '', stopped: false, missing: false, historyError: '', adjacent: false, previous: null, ...override }; }
describe('simulation workbench', () => {
 it('maps southwest coordinates and sends placement without changing the floor optimistically (U01/U02)', async () => {
  const act = vi.fn(async (_action: WorldAction) => true); render(Workbench, { view: view(), act, createAnother: vi.fn(), retryHistory: vi.fn() });
  const cell = screen.getByRole('gridcell', { name: /^x 2, y 1, empty/ });
  expect(cell.style.gridRow).toBe('7'); expect(cell.style.gridColumn).toBe('3');
  await fireEvent.click(cell); expect(act).toHaveBeenCalledWith({ type: 'PLACE_ROBOT', position: { x: 2, y: 1 } });
  expect(screen.getByRole('gridcell', { name: /^x 2, y 1, empty/ })).toBeTruthy();
 });
 it('selects, queues relative Forward by button and scoped arrows, ignores inputs and repeats, and clears active GOTO (U02/U03)', async () => {
  const act = vi.fn(async (_action: WorldAction) => true); render(Workbench, { view: view(), act, createAnother: vi.fn(), retryHistory: vi.fn() });
  const robot = screen.getByRole('gridcell', { name: /^x 1, y 0, R1/ }); await fireEvent.click(robot);
  await fireEvent.click(screen.getByRole('button', { name: /Forward/ }));
  expect(act).toHaveBeenLastCalledWith({ type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'MOVE' }] });
  await fireEvent.keyDown(robot, { key: 'ArrowLeft' }); expect(act).toHaveBeenLastCalledWith({ type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'LEFT' }] });
  const count = act.mock.calls.length; await fireEvent.keyDown(robot, { key: 'ArrowUp', repeat: true });
  await fireEvent.keyDown(screen.getByLabelText('Go to x'), { key: 'ArrowUp' }); expect(act).toHaveBeenCalledTimes(count);
  await fireEvent.click(screen.getByRole('button', { name: 'Clear Queue' })); expect(act).toHaveBeenLastCalledWith({ type: 'CLEAR_QUEUE', robotId: 'R1' });
 });
 it('supports explicit GOTO and accepts in-bounds obstacle targets (U03)', async () => {
  const act = vi.fn(async (_action: WorldAction) => true); const v = view(); v.world = { ...world, state: { ...world.state, obstacles: [{ x: 3, y: 4 }] } };
  render(Workbench, { view: v, act, createAnother: vi.fn(), retryHistory: vi.fn() });
  await fireEvent.click(screen.getByRole('gridcell', { name: /^x 1, y 0, R1/ }));
  await fireEvent.input(screen.getByLabelText('Go to x'), { target: { value: '3' } }); await fireEvent.input(screen.getByLabelText('Go to y'), { target: { value: '4' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Queue GOTO' }));
  expect(act).toHaveBeenLastCalledWith({ type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'GOTO', target: { x: 3, y: 4 } }] });
 });
 it('retains Playing after scheduler error, exposes Pause/End, and separates running from next interval (U04/U08)', async () => {
  const v = view({ stopped: true }); v.world = { ...world, runningTickIntervalMs: null, state: { ...world.state, lifecycle: 'PLAYING' } };
  const act = vi.fn(async () => true); render(Workbench, { view: v, act, createAnother: vi.fn(), retryHistory: vi.fn() });
  expect(screen.getByText('Playback stopped due to an error.')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Pause' })); expect(act).toHaveBeenCalledWith({ type: 'PAUSE' });
  expect(screen.getByLabelText('Next Play interval')).toHaveProperty('value', '1000');
 });
 it('keeps ended queues inspectable and all edits disabled (U04)', async () => {
  const v = view(); v.world = { ...world, state: { ...world.state, lifecycle: 'ENDED' } };
  const act = vi.fn(async () => true); render(Workbench, { view: v, act, createAnother: vi.fn(), retryHistory: vi.fn() });
  await fireEvent.click(screen.getByRole('gridcell', { name: /^x 1, y 0, R1/ })); await fireEvent.click(screen.getByRole('button', { name: /Forward/ }));
  expect(act).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Create another world' })).toBeTruthy();
  expect(screen.getAllByText(/GOTO 8,6/).length).toBeGreaterThan(0);
 });
});
