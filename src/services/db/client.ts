import { SCHEMA } from './schema';

export type SqlValue = string | number | null | ArrayBuffer | Uint8Array;
export type SqlRow = Record<string, unknown>;

/**
 * The slice of op-sqlite's API the app uses. op-sqlite's `open()` result fits it
 * directly; tests pass an in-memory SQLite instead.
 */
export interface SqlDb {
  execute(sql: string, params?: SqlValue[]): Promise<{ rows: SqlRow[] }>;
}

let current: SqlDb | null = null;

/**
 * Call once at app start, before any query:
 * `await connect(open({ name: 'backpack.sqlite' }))` (op-sqlite).
 */
export async function connect(db: SqlDb) {
  current = db;
  await migrate(db);
}

export async function migrate(db: SqlDb) {
  for (const s of SCHEMA) await db.execute(s);
}

export function getDb(): SqlDb {
  if (!current)
    throw new Error('Database not connected; call connect() at app start');
  return current;
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
