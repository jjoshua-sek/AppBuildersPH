import type { SqlDb, SqlValue } from '../client';

/**
 * In-memory SQLite (Node's built-in, which has FTS5) behind the same interface
 * as op-sqlite. For Jest only; never import it from app code.
 */
export function memoryDb(): SqlDb {
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(':memory:');
  // node:sqlite takes typed arrays for BLOBs; op-sqlite takes ArrayBuffers.
  // (Jest's sandbox has its own ArrayBuffer, so `instanceof` can't be used here.)
  const bind = (v: SqlValue) =>
    v !== null && typeof v === 'object' && !ArrayBuffer.isView(v)
      ? new Uint8Array(v)
      : v;
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const st = d.prepare(sql);
      if (/^\s*(SELECT|WITH)\b/i.test(sql))
        return { rows: st.all(...params.map(bind)) };
      st.run(...params.map(bind));
      return { rows: [] };
    },
  };
}
