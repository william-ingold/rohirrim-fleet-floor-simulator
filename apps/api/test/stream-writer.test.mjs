import { expect, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { StreamWriter, MAX_STREAM_BYTES, MAX_STREAM_FRAMES } from '../dist/streaming/streams.js';

class Response extends EventEmitter {
  writableLength = 0; frames = []; accept = false; destroyed = false;
  write(frame) { this.frames.push(frame); return this.accept; }
  destroy() { this.destroyed = true; this.emit('close'); }
}
test('S07/S08: backpressure queues preserve frames, then drain; overflow disconnects and releases listeners', () => {
  const response = new Response(); let cleanups = 0;
  const writer = new StreamWriter(response, () => cleanups++);
  writer.send('world.updated', { revision: 1 }, 1); writer.send('world.updated', { revision: 2 }, 2);
  expect(response.frames).toHaveLength(1);
  response.accept = true; response.emit('drain');
  expect(response.frames).toEqual(['event: world.updated\nid: 1\ndata: {"revision":1}\n\n', 'event: world.updated\nid: 2\ndata: {"revision":2}\n\n']);
  response.accept = false;
  for (let i = 0; i < MAX_STREAM_FRAMES + 2; i++) writer.send('world.updated', { i }, i);
  expect(response.destroyed).toBe(true); expect(cleanups).toBe(1);
  expect(response.eventNames()).toEqual([]);
  writer.close(); expect(cleanups).toBe(1);
});
test('S07/S08: byte bound includes socket buffer; thrown transport write cleans up', () => {
  const response = new Response(); let cleanups = 0;
  const writer = new StreamWriter(response, () => cleanups++);
  response.writableLength = MAX_STREAM_BYTES;
  writer.send('world.updated', {}, 1); expect(response.destroyed).toBe(true); expect(response.frames).toEqual([]);
  const failed = new Response(); failed.write = () => { throw new Error('socket failure'); };
  new StreamWriter(failed, () => cleanups++).send('world.updated', {}, 1);
  expect(failed.destroyed).toBe(true); expect(cleanups).toBe(2);
});
