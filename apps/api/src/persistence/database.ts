import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';

export function openDatabase(path: string): Database.Database {
  const db = new Database(path, { timeout: 5000 });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    return db;
  } catch (error) { db.close(); throw error; }
}

export function migrate(db: Database.Database, directory = new URL('../../migrations/', import.meta.url)): void {
  const files = readdirSync(directory).filter(name => /^\d+_.+\.sql$/.test(name)).sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]));
  db.transaction(() => {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    const applied = new Set((db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(row => row.version));
    const versions = files.map(name => Number(name.split('_')[0]));
    if (new Set(versions).size !== versions.length || versions.some(v => !Number.isSafeInteger(v) || v < 1) || [...applied].some(v => !versions.includes(v))) throw new Error('Unsupported or duplicate SQL migration version');
    for (const [index, file] of files.entries()) {
      const version = versions[index]!;
      if (applied.has(version)) continue;
      db.exec(readFileSync(new URL(file, directory), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
    }
  }).immediate();
}
