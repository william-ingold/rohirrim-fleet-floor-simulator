import type { WorldService } from './world-service.js';
import type { CancelReceipt, CommittedWorld, PlaybackAction, WorldAction } from './types.js';

export type CommittedEvent = { readonly type: 'WORLD_COMMITTED'; readonly world: CommittedWorld }
  | { readonly type: 'DRAFT_CANCELLED'; readonly worldId: string };
export type CommittedListener = (event: CommittedEvent) => void;

/** In-process handoff; B5 listeners enqueue delivery synchronously, never await I/O. */
export class CommittedUpdates {
  constructor(private readonly reportError: (error: unknown) => void = error => console.error('Committed update delivery failed', error)) {}
  private readonly listeners = new Set<CommittedListener>();
  private readonly pending: CommittedEvent[] = [];
  private delivering = false;
  subscribe(listener: CommittedListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  publish(event: CommittedEvent): void {
    this.pending.push(event);
    if (this.delivering) return;
    this.delivering = true;
    try {
      while (this.pending.length > 0) {
        const next = this.pending.shift()!;
        for (const listener of [...this.listeners]) {
          try { listener(structuredClone(next)); }
          catch (error) {
            // Neither delivery nor its diagnostics may turn a commit into a rejection.
            try { this.reportError(error); } catch { /* The durable action is complete. */ }
          }
        }
      }
    } finally { this.delivering = false; }
  }
}
export class CommittedActions {
  constructor(private readonly worlds: WorldService, private readonly updates: CommittedUpdates) {}
  create(width?: number, height?: number): CommittedWorld {
    const result = this.worlds.create(width, height);
    this.updates.publish({ type: 'WORLD_COMMITTED', world: result });
    return result;
  }
  act(id: string, action: WorldAction, beforePublish?: (result: CommittedWorld | CancelReceipt) => void): CommittedWorld | CancelReceipt {
    const result = this.worlds.act(id, action);
    beforePublish?.(result);
    return this.publish(result);
  }
  playback(id: string, action: PlaybackAction | Extract<WorldAction, { type: 'PLAY' }>, beforePublish?: (result: CommittedWorld) => void): CommittedWorld {
    const result = this.worlds.playback(id, action);
    beforePublish?.(result);
    this.publish(result);
    return result;
  }
  private publish(result: CommittedWorld | CancelReceipt): CommittedWorld | CancelReceipt {
    const id = result.worldId;
    if ('cancelled' in result) this.updates.publish({ type: 'DRAFT_CANCELLED', worldId: id });
    else if (result.historyEntries.length > 0) this.updates.publish({ type: 'WORLD_COMMITTED', world: result });
    return result;
  }
}
