import { writable } from 'svelte/store';
import { ApiError, type Transport } from './client.js';
import type { Connection, HistoryEntry, Snapshot, StreamEvent, WorldAction, WorldResponse } from './types.js';
export type SessionView = {
  world: WorldResponse | null; history: HistoryEntry[]; historyCursor: number; connection: Connection;
  error: string; pending: string; stopped: boolean; missing: boolean; historyError: string;
  adjacent: boolean; previous: WorldResponse | null;
};
const initial = (): SessionView => ({ world: null, history: [], historyCursor: 0, connection: 'connecting', error: '', pending: '', stopped: false, missing: false, historyError: '', adjacent: false, previous: null });
export class Session {
  private view = initial();
  private store = writable(this.view);
  subscribe = this.store.subscribe;
  private id = '';
  private generation = 0;
  private streamGeneration = 0;
  private close: (() => void) | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private subscriptionId = '';
  private history = new Map<number, HistoryEntry>();
  private loadingHistory = false;
  constructor(private transport: Transport) {}
  private update(patch: Partial<SessionView>) { this.view = { ...this.view, ...patch }; this.store.set(this.view); }
  open(id: string) {
    this.dispose(); this.id = id; this.view = initial(); this.history.clear(); this.loadingHistory = false;
    this.update({}); this.connect();
  }
  private stopHeartbeat() { clearInterval(this.heartbeat); this.heartbeat = undefined; this.subscriptionId = ''; }
  private connect() {
    const generation = this.generation, stream = ++this.streamGeneration;
    this.close = this.transport.subscribe(this.id, event => {
      if (generation === this.generation && stream === this.streamGeneration) this.receive(event);
    }, () => { if (generation === this.generation && stream === this.streamGeneration) void this.lost(); });
  }
  private receive(event: StreamEvent) {
    if (event.data.worldId !== this.id) return;
    if (event.type === 'stream.ready') {
      this.stopHeartbeat(); this.subscriptionId = event.data.subscriptionId;
      const generation = this.generation, subscriptionId = this.subscriptionId;
      this.heartbeat = setInterval(() => { void this.renew(generation, subscriptionId); }, 5000);
    } else if (event.type === 'scheduler.error') {
      this.update({ stopped: true, world: this.view.world ? { ...this.view.world, runningTickIntervalMs: null } : null });
    } else {
      this.apply(event.data, event.type === 'world.updated');
      this.update({ connection: 'live', error: '' });
    }
  }
  private async renew(generation: number, subscriptionId: string) {
    try {
      const result = await this.transport.presence(this.id, subscriptionId);
      if (generation !== this.generation || subscriptionId !== this.subscriptionId) return;
      if (result.revision > (this.view.world?.revision ?? 0)) await this.refresh();
    } catch {
      if (generation === this.generation && subscriptionId === this.subscriptionId) await this.lost();
    }
  }
  private async lost() {
    this.close?.(); this.close = undefined; this.streamGeneration++; this.stopHeartbeat();
    clearTimeout(this.retry); this.update({ connection: 'reconnecting', adjacent: false });
    const generation = this.generation;
    await this.refresh(true);
    if (generation !== this.generation || this.view.missing) return;
    this.retry = setTimeout(() => this.connect(), 1000);
  }
  async refresh(draftGone = false) {
    const generation = this.generation;
    try {
      const world = await this.transport.get(this.id);
      if (generation === this.generation) this.apply(world, false);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof ApiError && error.status === 404) {
        this.dispose(); this.update({ missing: true, error: draftGone ? 'This draft is no longer available.' : "We can't find that world. Create a new one to continue." });
      } else this.update({ error: message(error), adjacent: false });
    }
  }
  private apply(incoming: Snapshot | WorldResponse, liveUpdate: boolean) {
    if (incoming.worldId !== this.id) return;
    const before = this.view.world;
    const entries = 'historyEntries' in incoming ? incoming.historyEntries : [];
    this.addHistory(entries);
    if (!before || incoming.revision > before.revision) {
      const adjacent = !!before && liveUpdate && this.view.connection === 'live' && incoming.revision === before.revision + 1 && incoming.state.tick === before.state.tick + 1;
      this.update({ world: { ...incoming, historyEntries: entries }, previous: adjacent ? before : liveUpdate && before?.state.tick === incoming.state.tick ? this.view.previous : null, adjacent, stopped: incoming.state.lifecycle === 'PLAYING' && this.view.stopped });
    } else if (incoming.revision === before.revision && !this.view.stopped) {
      this.update({ world: { ...before, runningTickIntervalMs: incoming.runningTickIntervalMs } });
    }
    void this.catchUpHistory();
  }
  private addHistory(entries: readonly HistoryEntry[]) {
    for (const entry of entries) if (entry.worldId === this.id) this.history.set(entry.revision, entry);
    let cursor = this.view.historyCursor;
    while (this.history.has(cursor + 1)) cursor++;
    this.update({ historyCursor: cursor, history: [...this.history.values()].sort((a, b) => a.revision - b.revision) });
  }
  async catchUpHistory() {
    if (this.loadingHistory || this.view.missing || !this.view.world) return;
    this.loadingHistory = true;
    const generation = this.generation;
    try {
      while (this.view.historyCursor < (this.view.world?.revision ?? 0)) {
        const through = this.view.world!.revision;
        while (this.view.historyCursor < through) {
          const after = this.view.historyCursor;
          const page = await this.transport.history(this.id, after, through);
          if (generation !== this.generation) return;
          this.addHistory(page.entries);
          if (this.view.historyCursor <= after) throw new Error('History is incomplete. Retry loading history.');
        }
      }
      this.update({ historyError: '' });
    } catch (error) {
      if (generation === this.generation) this.update({ historyError: error instanceof Error ? error.message : 'History could not be loaded.' });
    } finally { if (generation === this.generation) this.loadingHistory = false; }
  }
  async act(action: WorldAction): Promise<boolean> {
    if (this.view.pending || this.view.connection !== 'live' || this.view.missing) return false;
    const generation = this.generation;
    this.update({ pending: action.type, error: '' });
    try {
      const result = await this.transport.act(this.id, action);
      if (generation !== this.generation) return false;
      if ('cancelled' in result) { this.dispose(); this.update({ missing: true, error: '' }); }
      else this.apply(result, true);
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      await this.refresh();
      if (generation === this.generation) this.update({ error: error instanceof ApiError ? actionMessage(error, action, this.view.world) : "We couldn't confirm that change. Check the latest saved state before trying again.", adjacent: false });
      return false;
    } finally { if (generation === this.generation) this.update({ pending: '' }); }
  }
  dispose() {
    this.generation++; this.streamGeneration++; this.close?.(); this.close = undefined;
    clearTimeout(this.retry); this.stopHeartbeat();
  }
}
export function message(error: unknown): string {
  if (!(error instanceof ApiError)) return 'The simulator could not be reached. Check your connection and try again.';
  switch (error.code) {
    case 'PERSISTENCE_UNAVAILABLE': return 'That change was not saved. The database is unavailable, so the floor is unchanged. Try again in a moment.';
    case 'UNSUPPORTED_SNAPSHOT_VERSION': return "This world was saved in a format this version can't read. Its saved data was not changed.";
    case 'WORLD_NOT_FOUND': return "We can't find that world. Create a new one to continue.";
    case 'INVALID_LIFECYCLE': return "The world has changed, so the action wasn't applied. Check its current state before trying again.";
    default: return error.message;
  }
}

function actionMessage(error: ApiError, action: WorldAction, world: WorldResponse | null): string {
  if (error.code === 'PERSISTENCE_UNAVAILABLE' && action.type === 'PAUSE') return "Couldn't pause yet because the database is unavailable. Nothing changed. Try Pause again in a moment.";
  if (error.code === 'INVALID_LIFECYCLE' && world) return `This world is now ${world.state.lifecycle === 'PLAYING' ? 'Playing' : world.state.lifecycle === 'ENDED' ? 'Ended' : 'in a different state'}, so the change wasn't applied.${world.state.lifecycle === 'PLAYING' ? ' Pause to edit.' : ''}`;
  if (error.code === 'INVALID_PLACEMENT' && world) {
    if (action.type === 'PLACE_ROBOT') {
      const p = action.position, robot = world.state.robots.find(r => r.position.x === p.x && r.position.y === p.y);
      const obstacle = world.state.obstacles.some(o => o.x === p.x && o.y === p.y);
      if (robot || obstacle) return `Can't place a robot at (${p.x},${p.y}): ${obstacle ? 'that cell has an obstacle' : `${robot!.id} is standing there`}. Choose another cell.`;
    }
    if (action.type === 'SET_OBSTACLE') {
      const p = action.position, robot = world.state.robots.find(r => r.position.x === p.x && r.position.y === p.y);
      if (robot) return `Can't add an obstacle at (${p.x},${p.y}): ${robot.id} is standing there.`;
    }
    if (action.type === 'RESIZE') {
      const outside = (p: { x: number; y: number }) => p.x >= action.width || p.y >= action.height;
      const robot = world.state.robots.find(r => outside(r.position));
      const target = world.state.robots.flatMap(r => r.queue.flatMap(c => c.type === 'GOTO' ? [c.target] : [])).find(outside);
      const feature = world.state.obstacles.concat(world.state.chargers).find(outside);
      const cause = robot ? `${robot.id} at (${robot.position.x},${robot.position.y})` : target ? `a GOTO target at (${target.x},${target.y})` : feature ? `a feature at (${feature.x},${feature.y})` : 'existing content';
      return `Can't resize to ${action.width} × ${action.height}: ${cause} would be off the floor. The size stays ${world.state.width} × ${world.state.height}.`;
    }
  }
  return message(error);
}
