import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

/** node:sqlite prints an ExperimentalWarning on load; it is expected and noisy for CLI users. */
function silenceSqliteWarning() {
  const g = globalThis as { __lcWarnPatched?: boolean };
  if (g.__lcWarnPatched) return;
  g.__lcWarnPatched = true;
  const original = process.emitWarning;
  process.emitWarning = function (warning: string | Error, ...rest: unknown[]) {
    const text = typeof warning === 'string' ? warning : warning?.message;
    if (text && text.includes('SQLite is an experimental feature')) return;
    return (original as (...a: unknown[]) => void).call(process, warning, ...rest);
  } as typeof process.emitWarning;
}

export function loadSqlite(): typeof import('node:sqlite') {
  silenceSqliteWarning();
  const mod = process.getBuiltinModule?.('node:sqlite') as typeof import('node:sqlite') | undefined;
  if (!mod) throw new Error('node:sqlite is unavailable. LocalCode requires Node.js 22.13 or newer.');
  return mod;
}

/** Platform-appropriate data directory, overridable with LOCALCODE_HOME. */
export function defaultDataDir(): string {
  if (process.env.LOCALCODE_HOME) return path.resolve(process.env.LOCALCODE_HOME);
  const home = os.homedir();
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'LocalCode');
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'LocalCode');
    default:
      return path.join(process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), 'localcode');
  }
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    last_opened_at TEXT NOT NULL
  );
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    provider_id TEXT,
    model TEXT,
    summary TEXT,
    summary_upto_seq INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_conversations_ws ON conversations(workspace_id, updated_at);
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    task_id TEXT,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    tool_call_id TEXT,
    tool_name TEXT,
    meta TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (conversation_id, seq)
  );
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT '[]',
    report TEXT,
    error TEXT,
    checkpoint_before TEXT,
    steps INTEGER NOT NULL DEFAULT 0,
    usage TEXT NOT NULL DEFAULT '{}',
    provider_id TEXT,
    model TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE INDEX idx_tasks_conv ON tasks(conversation_id, created_at);
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    conversation_id TEXT,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_events_task ON events(task_id, id);
  CREATE INDEX idx_events_conv ON events(conversation_id, id);
  CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    task_id TEXT,
    commit_hash TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_checkpoints_ws ON checkpoints(workspace_id, created_at);
  CREATE TABLE permission_rules (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    pattern TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (workspace_id, tool, pattern)
  );
  CREATE TABLE model_profiles (
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL,
    tool_mode TEXT,
    probe TEXT,
    benchmark TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (provider_id, model)
  );
  CREATE TABLE embeddings (
    workspace_id TEXT NOT NULL,
    model TEXT NOT NULL,
    path TEXT NOT NULL,
    chunk INTEGER NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    mtime_ms REAL NOT NULL,
    vector BLOB NOT NULL,
    PRIMARY KEY (workspace_id, model, path, chunk)
  );
  `,
];

export type Database = DatabaseSyncType;

export function openDatabase(file: string): Database {
  const { DatabaseSync } = loadSqlite();
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  let version = row.user_version;
  for (; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}
