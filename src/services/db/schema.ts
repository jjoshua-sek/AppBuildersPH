/** The tables in BUILD_SPEC §7. Every statement is idempotent, so migrate() can run on each launch. */
export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT, source TEXT, created_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, doc_id TEXT, idx INTEGER, text TEXT, embedding BLOB)',
  'CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, chunk_id UNINDEXED, doc_id UNINDEXED)',
  `CREATE TABLE IF NOT EXISTS terms (id TEXT PRIMARY KEY, doc_id TEXT, chunk_id TEXT, term TEXT,
    answer TEXT, clue TEXT, description TEXT, why TEXT, selected INTEGER DEFAULT 0, UNIQUE(doc_id, answer))`,
  `CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, term_id TEXT, mode TEXT,
    correct INTEGER, hints_used INTEGER, ts INTEGER)`,
  'CREATE TABLE IF NOT EXISTS daily (day TEXT, doc_id TEXT, term_id TEXT, PRIMARY KEY (day, doc_id))',
  'CREATE TABLE IF NOT EXISTS daily_rounds (day TEXT, doc_id TEXT, term_id TEXT, guesses TEXT, solved INTEGER DEFAULT 0, PRIMARY KEY (day, doc_id))',
  'CREATE INDEX IF NOT EXISTS chunks_doc ON chunks (doc_id, idx)',
  'CREATE INDEX IF NOT EXISTS terms_doc ON terms (doc_id)',
  'CREATE INDEX IF NOT EXISTS attempts_term ON attempts (term_id, ts)',
];
