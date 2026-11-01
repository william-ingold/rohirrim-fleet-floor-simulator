import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DomainError } from '@rohirrim/engine';
import type { CommittedActions } from '../floors/committed-actions.js';
import type { WorldService } from '../floors/world-service.js';
import type { CommittedWorld, WorldAction } from '../floors/types.js';

export interface Clock {
  now(): number;
  setTimeout(run: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}
export const systemClock: Clock = {
  now: () => performance.now(),
  setTimeout: (run, delay) => setTimeout(run, delay),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
export type SchedulerError = { readonly worldId: string; readonly error: { readonly code: 'PERSISTENCE_UNAVAILABLE' | 'INTERNAL_ERROR'; readonly message: string } };
const LEASE_MS = 15000;
type Lease = { worldId: string; open: boolean; deadline: number; timer: unknown };
type Loop = { interval: number; timer?: unknown };

/** Synchronous SQLite actions serialize HTTP and expiry callbacks between ticks. */
export class Playback {
  private readonly leases = new Map<string, Lease>();
  private readonly loops = new Map<string, Loop>();
  private readonly stopped = new Map<string, SchedulerError>();
  private readonly errorListeners = new Set<(error: SchedulerError) => void>();
  constructor(private readonly worlds: WorldService, private readonly actions: CommittedActions, private readonly clock: Clock = systemClock) {}
  interval(id: string): number | null { return this.loops.get(id)?.interval ?? null; }
  error(id: string): SchedulerError | undefined { return this.stopped.get(id); }
  envelope(world: CommittedWorld) { return { ...world, runningTickIntervalMs: this.interval(world.worldId) }; }
  subscribeErrors(listener: (error: SchedulerError) => void): () => void {
    this.errorListeners.add(listener); return () => { this.errorListeners.delete(listener); };
  }
  register(worldId: string): string {
    const id = randomUUID(), lease: Lease = { worldId, open: true, deadline: this.clock.now() + LEASE_MS, timer: undefined };
    this.leases.set(id, lease); this.armLease(id, lease); return id;
  }
  disconnect(id: string): void { const lease = this.leases.get(id); if (lease) lease.open = false; }
  invalidateLease(id: string): void {
    const lease = this.leases.get(id);
    if (lease) { this.clock.clearTimeout(lease.timer); this.leases.delete(id); }
  }
  invalidate(worldId: string): void {
    for (const [id, lease] of this.leases) if (lease.worldId === worldId) {
      this.clock.clearTimeout(lease.timer); this.leases.delete(id);
    }
    this.stop(worldId); this.stopped.delete(worldId);
  }
  renew(worldId: string, id: string) {
    const world = this.worlds.get(worldId), lease = this.leases.get(id);
    if (!lease || lease.worldId !== worldId || !lease.open || lease.deadline <= this.clock.now()) throw new DomainError('Subscription is closed or expired');
    this.clock.clearTimeout(lease.timer); lease.deadline = this.clock.now() + LEASE_MS; this.armLease(id, lease);
    return { worldId, revision: world.revision, expiresInMs: LEASE_MS };
  }
  private armLease(id: string, lease: Lease): void {
    lease.timer = this.clock.setTimeout(() => {
      if (this.leases.get(id) !== lease || lease.deadline > this.clock.now()) return;
      this.leases.delete(id);
      if (!this.hasPresence(lease.worldId) && this.loops.has(lease.worldId)) this.autoPause(lease.worldId);
    }, Math.max(0, lease.deadline - this.clock.now()));
  }
  private hasPresence(id: string, openOnly = false): boolean {
    return [...this.leases.values()].some(l => l.worldId === id && (!openOnly || l.open) && l.deadline > this.clock.now());
  }
  act(id: string, action: WorldAction) {
    if (action.type === 'PLAY') {
      const current = this.worlds.get(id);
      if (current.state.lifecycle !== 'PLAYING') {
        if (!this.hasPresence(id, true)) throw new DomainError('Play requires a live subscription', 'INVALID_LIFECYCLE');
        return this.actions.playback(id, action, () => this.start(id, action.tickIntervalMs));
      }
    }
    return this.actions.act(id, action, result => {
      if ('cancelled' in result) this.invalidate(id);
      else if (result.state.lifecycle === 'PAUSED' || result.state.lifecycle === 'ENDED') {
        this.stop(id); this.stopped.delete(id);
      }
    });
  }
  private start(id: string, interval: number): void {
    this.stop(id); this.stopped.delete(id);
    const loop: Loop = { interval }; this.loops.set(id, loop); this.armTick(id, loop);
  }
  private stop(id: string): void {
    const loop = this.loops.get(id); if (loop) this.clock.clearTimeout(loop.timer);
    this.loops.delete(id);
  }
  private armTick(id: string, loop: Loop): void {
    loop.timer = this.clock.setTimeout(() => {
      if (this.loops.get(id) !== loop) return;
      if (!this.hasPresence(id)) { this.autoPause(id); return; }
      try {
        if (this.worlds.get(id).state.lifecycle !== 'PLAYING') { this.stop(id); return; }
        this.actions.playback(id, { type: 'AUTOMATIC_TICK' });
        if (this.loops.get(id) === loop) this.armTick(id, loop);
      } catch (error) { this.fail(id, error); }
    }, loop.interval);
  }
  private autoPause(id: string): void {
    try {
      this.actions.playback(id, { type: 'PAUSE', reason: 'NO_CLIENTS' }, () => { this.stop(id); this.stopped.delete(id); });
    } catch (error) { this.fail(id, error); }
  }
  private fail(id: string, cause: unknown): void {
    this.stop(id);
    const temporary = cause !== null && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string' && /^(SQLITE_BUSY|SQLITE_LOCKED)(_|$)/.test(cause.code);
    const error: SchedulerError = { worldId: id, error: { code: temporary ? 'PERSISTENCE_UNAVAILABLE' : 'INTERNAL_ERROR', message: 'Playback stopped due to an error' } };
    this.stopped.set(id, error);
    for (const listener of this.errorListeners) { try { listener(structuredClone(error)); } catch { /* Transport cannot change committed state. */ } }
  }
  close(): void {
    for (const id of this.loops.keys()) this.stop(id);
    for (const lease of this.leases.values()) this.clock.clearTimeout(lease.timer);
    this.leases.clear(); this.stopped.clear(); this.errorListeners.clear();
  }
}
