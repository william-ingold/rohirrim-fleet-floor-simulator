import { Buffer } from 'node:buffer';
import type { ServerResponse } from 'node:http';
import type { CommittedUpdates } from '../floors/committed-actions.js';
import type { CommittedWorld } from '../floors/types.js';
import type { WorldService } from '../floors/world-service.js';
import type { Playback } from '../playback/playback.js';

// Transport limits only: overflow closes the stream for current-state resync.
export const MAX_STREAM_BYTES = 1024 * 1024;
export const MAX_STREAM_FRAMES = 64;
export class StreamWriter {
  private readonly pending: string[] = [];
  private bytes = 0;
  private blocked = false;
  private closed = false;
  private readonly drain = () => { this.blocked = false; this.flush(); };
  private readonly closeListener = () => this.close();
  constructor(private readonly response: ServerResponse, private readonly cleanup: () => void) {
    response.on('drain', this.drain);
    response.on('close', this.closeListener);
    response.on('error', this.closeListener);
  }
  send(event: string, data: unknown, revision?: number): void {
    if (this.closed) return;
    const frame = `event: ${event}\n${revision === undefined ? '' : `id: ${revision}\n`}data: ${JSON.stringify(data)}\n\n`;
    const bytes = Buffer.byteLength(frame);
    if (this.pending.length >= MAX_STREAM_FRAMES || this.bytes + bytes + this.response.writableLength > MAX_STREAM_BYTES) { this.close(); return; }
    this.pending.push(frame); this.bytes += bytes; this.flush();
  }
  private flush(): void {
    try {
      while (!this.closed && !this.blocked && this.pending.length) {
        const frame = this.pending.shift()!; this.bytes -= Buffer.byteLength(frame);
        this.blocked = !this.response.write(frame);
      }
    } catch { this.close(); }
  }
  close(): void {
    this.detach();
    this.response.destroy();
  }
  detach(): void {
    if (this.closed) return;
    this.closed = true; this.pending.length = 0; this.bytes = 0;
    this.response.off('drain', this.drain); this.response.off('close', this.closeListener); this.response.off('error', this.closeListener);
    this.cleanup();
  }
}

export class Streams {
  private readonly clients = new Set<StreamWriter>();
  constructor(private readonly worlds: WorldService, private readonly updates: CommittedUpdates, private readonly playback: Playback) {}
  open(id: string, response: ServerResponse): void {
    let subscriptionId: string | undefined, unsubscribe = () => {}, unsubscribeErrors = () => {};
    let initializing = true, closed = false, revision = 0, bytes = 0;
    const pending: CommittedWorld[] = [];
    const writer = new StreamWriter(response, () => {
      closed = true; pending.length = 0; unsubscribe(); unsubscribeErrors();
      if (subscriptionId) this.playback.disconnect(subscriptionId);
      this.clients.delete(writer);
    });
    this.clients.add(writer);
    const updated = (world: CommittedWorld) => {
      if (world.revision <= revision) return;
      revision = world.revision;
      writer.send('world.updated', this.playback.envelope(world), world.revision);
    };
    // Subscribe before the authoritative read; a commit during that read is buffered.
    unsubscribe = this.updates.subscribe(event => {
      if (event.type === 'DRAFT_CANCELLED') {
        if (event.worldId === id) { this.playback.invalidate(id); writer.close(); }
      } else if (event.world.worldId === id) {
        if (initializing) {
          bytes += Buffer.byteLength(JSON.stringify(event.world));
          if (pending.length >= MAX_STREAM_FRAMES || bytes > MAX_STREAM_BYTES) writer.close();
          else pending.push(event.world);
        } else updated(event.world);
      }
    });
    try {
      subscriptionId = this.playback.register(id);
      const world = this.worlds.get(id);
      if (closed) return;
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      writer.send('stream.ready', { worldId: id, subscriptionId });
      const { historyEntries: _, ...snapshot } = this.playback.envelope(world);
      revision = world.revision;
      writer.send('world.snapshot', snapshot, revision);
      for (const buffered of pending) updated(buffered);
      pending.length = 0; initializing = false;
      const error = this.playback.error(id);
      if (error) writer.send('scheduler.error', error);
      if (!closed) unsubscribeErrors = this.playback.subscribeErrors(error => { if (error.worldId === id) writer.send('scheduler.error', error); });
    } catch (error) {
      // Leave an unstarted response available to the ordinary JSON exception filter.
      if (subscriptionId) this.playback.invalidateLease(subscriptionId);
      writer.detach();
      throw error;
    }
  }
  onModuleDestroy(): void { for (const writer of this.clients) writer.close(); }
}
