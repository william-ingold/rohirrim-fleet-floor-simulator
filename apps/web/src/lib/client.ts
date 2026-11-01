import type { CancelReceipt, HistoryPage, StreamEvent, WorldAction, WorldResponse } from './types.js';
export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0) { super(message); }
}
export interface Transport {
  create(width: number, height: number): Promise<WorldResponse>;
  get(id: string): Promise<WorldResponse>;
  act(id: string, action: WorldAction): Promise<WorldResponse | CancelReceipt>;
  history(id: string, after: number, through: number): Promise<HistoryPage>;
  presence(id: string, subscriptionId: string): Promise<{ worldId: string; revision: number; expiresInMs: number }>;
  subscribe(id: string, event: (event: StreamEvent) => void, lost: () => void): () => void;
}
export function createTransport(base = '/api'): Transport {
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(base + path, { signal: controller.signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      const result = await response.json();
      if (!response.ok) throw new ApiError(result.error?.code ?? 'INTERNAL_ERROR', result.error?.message ?? 'The server could not complete that request.', response.status);
      return result as T;
    } finally { clearTimeout(timeout); }
  }
  const world = (id: string) => `/worlds/${encodeURIComponent(id)}`;
  return {
    create: (width, height) => request('/worlds', { width, height }),
    get: id => request(world(id)),
    act: (id, action) => request(world(id) + '/actions', action),
    history: (id, after, through) => request(world(id) + `/history?afterRevision=${after}&throughRevision=${through}&limit=100`),
    presence: (id, subscriptionId) => request(world(id) + '/presence', { subscriptionId }),
    subscribe(id, onEvent, lost) {
      const source = new EventSource(base + world(id) + '/events');
      for (const type of ['stream.ready', 'world.snapshot', 'world.updated', 'scheduler.error'] as const) {
        source.addEventListener(type, event => {
          try { onEvent({ type, data: JSON.parse((event as MessageEvent<string>).data) } as StreamEvent); }
          catch { source.close(); lost(); }
        });
      }
      source.onerror = () => { source.close(); lost(); };
      return () => source.close();
    },
  };
}
