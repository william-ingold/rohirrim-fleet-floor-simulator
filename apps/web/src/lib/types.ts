import type { WorldSnapshot } from '@rohirrim/engine';
export type { Position, Facing, Lifecycle, RobotSnapshot, CommandInput, CommandSnapshot, RobotTickOutcome, WorldSnapshot } from '@rohirrim/engine';
// Type-only reuse: no Nest, SQLite, or simulation runtime enters the browser bundle.
export type { WorldAction, HistoryEntry, HistoryPage, CancelReceipt } from '../../../api/src/floors/types.js';
import type { HistoryEntry } from '../../../api/src/floors/types.js';
export type Snapshot = {
  readonly worldId: string; readonly revision: number; readonly snapshotVersion: number;
  readonly runningTickIntervalMs: number | null; readonly state: WorldSnapshot;
};
export type WorldResponse = Snapshot & { readonly historyEntries: readonly HistoryEntry[] };
export type StreamEvent =
  | { type: 'stream.ready'; data: { worldId: string; subscriptionId: string } }
  | { type: 'world.snapshot'; data: Snapshot }
  | { type: 'world.updated'; data: WorldResponse }
  | { type: 'scheduler.error'; data: { worldId: string; error: { code: string; message: string } } };
export type Connection = 'connecting' | 'live' | 'reconnecting';
