import { randomUUID } from 'node:crypto';
import { DomainError, World } from '@rohirrim/engine';
import type Database from 'better-sqlite3';
import { migrate } from '../persistence/database.js';
import type { AuditAction, CancelReceipt, CommittedWorld, Effects, HistoryEntry, HistoryPage, HistoryQuery, WorldAction } from './types.js';

export class StorageError extends Error {
  constructor(message: string, readonly code: 'WORLD_NOT_FOUND' | 'UNSUPPORTED_SNAPSHOT_VERSION' | 'INTERNAL_ERROR', options?: ErrorOptions) {
    super(message, options); this.name = 'StorageError';
  }
}
type SavedRow = { id: string; revision: number; snapshot_version: number; snapshot_json: string; t0_json: string | null };

/** Synchronous execution serializes read/compute/write in the single API process.
 * No await, cache, network delivery or callback occurs within a transaction. */
export class WorldService {
  /** Construct once at process startup, before exposing the service. */
  constructor(private readonly db: Database.Database) {
    migrate(db);
    this.recover();
  }
  private recover(): void {
    this.db.transaction(() => {
      const ids = this.db.prepare('SELECT id FROM worlds ORDER BY id').all() as { id: string }[];
      const saved = ids.map(({ id }) => this.load(id));
      for (const { row, world } of saved) {
        if (world.snapshot.lifecycle === 'PLAYING') this.save(row, world.pause(), { type: 'PAUSE', reason: 'SERVER_RESTART' }, {});
      }
    }).immediate();
  }

  private load(id: string): { row: SavedRow; world: World } {
    const row = this.db.prepare('SELECT id, revision, snapshot_version, snapshot_json, t0_json FROM worlds WHERE id = ?').get(id) as SavedRow | undefined;
    if (!row) throw new StorageError('World not found', 'WORLD_NOT_FOUND');
    if (row.snapshot_version !== 1) throw new StorageError(`Unsupported snapshot version ${row.snapshot_version}`, 'UNSUPPORTED_SNAPSHOT_VERSION');
    try {
      if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Invalid revision');
      const world = World.restore(JSON.parse(row.snapshot_json), row.t0_json === null ? null : JSON.parse(row.t0_json));
      if ((world.snapshot.lifecycle === 'SETTING_UP') !== (world.baseline === null)) throw new Error('Invalid persisted baseline');
      return { row, world };
    } catch (cause) { throw new StorageError('Invalid saved world', 'INTERNAL_ERROR', { cause }); }
  }
  private response(row: Pick<SavedRow, 'id' | 'revision' | 'snapshot_version'>, world: World, historyEntries: readonly HistoryEntry[] = []): CommittedWorld {
    return { worldId: row.id, revision: row.revision, snapshotVersion: row.snapshot_version, state: world.snapshot, historyEntries };
  }
  private append(id: string, revision: number, world: World, action: AuditAction, effects: Effects, timestamp: string): HistoryEntry {
    this.db.prepare('INSERT INTO world_history (world_id, revision, tick, timestamp, action_json, effects_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, revision, world.snapshot.tick, timestamp, JSON.stringify(action), JSON.stringify(effects));
    return { worldId: id, revision, tick: world.snapshot.tick, timestamp, action: JSON.parse(JSON.stringify(action)) as AuditAction, effects };
  }
  create(width = 10, height = 8): CommittedWorld {
    return this.db.transaction(() => {
      const world = World.create(width, height), id = randomUUID(), timestamp = new Date().toISOString();
      this.db.prepare('INSERT INTO worlds (id, revision, snapshot_version, snapshot_json, t0_json, created_at, updated_at) VALUES (?, 1, 1, ?, NULL, ?, ?)')
        .run(id, JSON.stringify(world.snapshot), timestamp, timestamp);
      const entry = this.append(id, 1, world, { type: 'CREATE', width, height }, {}, timestamp);
      return this.response({ id, revision: 1, snapshot_version: 1 }, world, [entry]);
    }).immediate();
  }
  get(id: string): CommittedWorld {
    const { row, world } = this.load(id);
    return this.response(row, world);
  }
  private save(row: SavedRow, world: World, action: AuditAction, effects: Effects): CommittedWorld {
    if (row.revision >= Number.MAX_SAFE_INTEGER) throw new StorageError('Revision overflow', 'INTERNAL_ERROR');
    const revision = row.revision + 1, timestamp = new Date().toISOString();
    this.db.prepare('UPDATE worlds SET revision = ?, snapshot_json = ?, t0_json = ?, updated_at = ? WHERE id = ?')
      .run(revision, JSON.stringify(world.snapshot), world.baseline === null ? null : JSON.stringify(world.baseline), timestamp, row.id);
    const entry = this.append(row.id, revision, world, action, effects, timestamp);
    return this.response({ ...row, revision }, world, [entry]);
  }
  act(id: string, action: WorldAction): CommittedWorld | CancelReceipt {
    return this.db.transaction(() => {
      const { row, world } = this.load(id);
      let next = world;
      let effects: Effects = {};
      switch (action.type) {
        case 'CANCEL':
          if (world.snapshot.lifecycle !== 'SETTING_UP') throw new DomainError('Only setup drafts can Cancel', 'INVALID_LIFECYCLE');
          this.db.prepare('DELETE FROM worlds WHERE id = ?').run(id);
          return { worldId: id, cancelled: true } as const;
        case 'FINISH_SETUP': next = world.finishSetup(); break;
        case 'RESIZE': next = world.resize(action.width, action.height); break;
        case 'PLACE_ROBOT':
          next = world.placeRobot(action.position, action.robotId, action.facing);
          effects = { robotId: next.snapshot.robots.find(r => r.position.x === action.position.x && r.position.y === action.position.y)!.id };
          break;
        case 'SET_OBSTACLE': next = world.setObstacle(action.position, action.enabled); break;
        case 'SET_CHARGER': next = world.setCharger(action.position, action.enabled); break;
        case 'ENQUEUE_COMMANDS': next = world.enqueue(action.robotId, action.commands); break;
        case 'CLEAR_QUEUE': next = world.clearQueue(action.robotId); break;
        case 'PAUSE': next = world.pause(); break;
        case 'END': next = world.end(); break;
        case 'STEP': {
          const result = world.step(); next = result.world; effects = { outcomes: result.outcomes }; break;
        }
        case 'PLAY': throw new DomainError('Play requires the B5 presence/scheduler adapter', 'INVALID_LIFECYCLE');
        default: throw new DomainError('Unknown world action');
      }
      return next === world ? this.response(row, world) : this.save(row, next, action, effects);
    }).immediate();
  }
  history(id: string, query: HistoryQuery = {}): HistoryPage {
    const current = this.get(id);
    const after = query.afterRevision ?? 0, through = query.throughRevision ?? current.revision, limit = query.limit ?? 100;
    if (![after, through, limit].every(Number.isSafeInteger) || after < 0 || through < after || through > current.revision || limit < 1 || limit > 500) throw new DomainError('Invalid history cursor or limit');
    const rows = this.db.prepare('SELECT revision, tick, timestamp, action_json, effects_json FROM world_history WHERE world_id = ? AND revision > ? AND revision <= ? ORDER BY revision LIMIT ?')
      .all(id, after, through, limit + 1) as { revision: number; tick: number; timestamp: string; action_json: string; effects_json: string }[];
    const entries = rows.slice(0, limit).map(row => ({ worldId: id, revision: row.revision, tick: row.tick, timestamp: row.timestamp, action: JSON.parse(row.action_json) as AuditAction, effects: JSON.parse(row.effects_json) as Effects }));
    return { entries, nextAfterRevision: entries.at(-1)?.revision ?? after, hasMore: rows.length > limit };
  }
}
