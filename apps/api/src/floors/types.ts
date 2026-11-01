import type { CommandInput, Facing, Position, RobotTickOutcome, WorldSnapshot } from '@rohirrim/engine';

export type WorldAction =
  | { readonly type: 'FINISH_SETUP' | 'PAUSE' | 'STEP' | 'END' | 'CANCEL' }
  | { readonly type: 'RESIZE'; readonly width: number; readonly height: number }
  | { readonly type: 'PLACE_ROBOT'; readonly position: Position; readonly robotId?: string; readonly facing?: Facing }
  | { readonly type: 'SET_OBSTACLE' | 'SET_CHARGER'; readonly position: Position; readonly enabled: boolean }
  | { readonly type: 'ENQUEUE_COMMANDS'; readonly robotId: string; readonly commands: readonly CommandInput[] }
  | { readonly type: 'CLEAR_QUEUE'; readonly robotId: string }
  | { readonly type: 'PLAY'; readonly tickIntervalMs: number };
export type AuditAction = WorldAction | { readonly type: 'CREATE'; readonly width: number; readonly height: number }
  | { readonly type: 'AUTOMATIC_TICK' } | { readonly type: 'PAUSE'; readonly reason: 'SERVER_RESTART' };
export type Effects = { readonly outcomes?: readonly RobotTickOutcome[]; readonly robotId?: string };
export type HistoryEntry = {
  readonly worldId: string; readonly revision: number; readonly tick: number; readonly timestamp: string;
  readonly action: AuditAction; readonly effects: Effects;
};
/** Durable seam; the future transport adapter adds scheduler metadata. */
export type CommittedWorld = {
  readonly worldId: string; readonly revision: number; readonly snapshotVersion: number;
  readonly state: WorldSnapshot; readonly historyEntries: readonly HistoryEntry[];
};
export type CancelReceipt = { readonly worldId: string; readonly cancelled: true };
export type HistoryQuery = { readonly afterRevision?: number; readonly throughRevision?: number; readonly limit?: number };
export type HistoryPage = { readonly entries: readonly HistoryEntry[]; readonly nextAfterRevision: number; readonly hasMore: boolean };
