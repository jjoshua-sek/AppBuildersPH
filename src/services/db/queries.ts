import type { Attempt, TermRow } from '../../types';
import type { WhyCard } from '../ai/whyItMatters';
import { PICK_DAILY_SQL, todayKey } from '../game/dailyTerm';
import { getDb, type SqlRow } from './client';

/**
 * The only database functions other lanes call. Lanes C and D never write SQL;
 * if you need a new query, ask Lane B to add it here.
 */

const TERM_COLS =
  't.id, t.doc_id, t.chunk_id, t.term, t.answer, t.clue, t.description, t.why';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const str = (v: unknown) => (v == null ? null : String(v));

const toTerm = (r: SqlRow): TermRow => ({
  id: String(r.id),
  doc_id: String(r.doc_id),
  chunk_id: String(r.chunk_id),
  term: String(r.term),
  answer: String(r.answer),
  clue: String(r.clue),
  description: str(r.description),
  why: str(r.why),
});

/** Every term extracted from a document, in extraction order. */
export async function getTerms(docId: string): Promise<TermRow[]> {
  const { rows } = await getDb().execute(
    `SELECT ${TERM_COLS} FROM terms t WHERE t.doc_id = ? ORDER BY t.rowid`,
    [docId],
  );
  return rows.map(toTerm);
}

/** The terms selectTerms() chose for the crossword (selected = 1). */
export async function getSelectedTerms(docId: string): Promise<TermRow[]> {
  const { rows } = await getDb().execute(
    `SELECT ${TERM_COLS} FROM terms t WHERE t.doc_id = ? AND t.selected = 1 ORDER BY t.rowid`,
    [docId],
  );
  return rows.map(toTerm);
}

export type ChunkRow = {
  id: string;
  doc_id: string;
  idx: number;
  text: string;
};

/** A term's source passage, for the tutor and the "why it matters" card. */
export async function getChunk(id: string): Promise<ChunkRow | null> {
  const { rows } = await getDb().execute(
    'SELECT id, doc_id, idx, text FROM chunks WHERE id = ?',
    [id],
  );
  const r = rows[0];
  return r
    ? {
        id: String(r.id),
        doc_id: String(r.doc_id),
        idx: Number(r.idx),
        text: String(r.text),
      }
    : null;
}

/** Log every crossword or Daily Term submission; misses feed the Daily Term pick. */
export async function logAttempt(a: Attempt): Promise<void> {
  await getDb().execute(
    'INSERT INTO attempts (term_id, mode, correct, hints_used, ts) VALUES (?,?,?,?,?)',
    [a.term_id, a.mode, a.correct, a.hints_used, a.ts],
  );
}

/** Completed Wordscape terms survive closing the app and contribute to study progress. */
export async function getWordscapeSolved(docId: string): Promise<Set<string>> {
  const { rows } = await getDb().execute(
    `SELECT DISTINCT a.term_id FROM attempts a JOIN terms t ON t.id = a.term_id
     WHERE t.doc_id = ? AND a.mode = 'wordscape' AND a.correct = 1`,
    [docId],
  );
  return new Set(rows.map(r => String(r.term_id)));
}

/**
 * Today's term for a document: the most-missed term (3–16 letters) in the last 7
 * days, else the least recently seen. Saved in `daily` on first call, so it stays
 * the same all day. Null when the document has no eligible term.
 */
export async function getDailyTerm(
  docId: string,
  now = new Date(),
): Promise<TermRow | null> {
  const db = getDb();
  const day = todayKey(now);
  const saved = async () => {
    const { rows } = await db.execute(
      `SELECT ${TERM_COLS} FROM daily d JOIN terms t ON t.id = d.term_id WHERE d.day = ? AND d.doc_id = ?`,
      [day, docId],
    );
    return rows[0] ? toTerm(rows[0]) : null;
  };
  const existing = await saved();
  if (existing) return existing;

  const { rows } = await db.execute(PICK_DAILY_SQL, [
    now.getTime() - WEEK_MS,
    docId,
  ]);
  if (!rows[0]) return null;
  await db.execute(
    'INSERT OR IGNORE INTO daily (day, doc_id, term_id) VALUES (?,?,?)',
    [day, docId, String(rows[0].id)],
  );
  return saved(); // re-read, so two screens asking at once get the same term
}

/** Stores the background-generated "why it matters" card for a term. */
export async function saveWhy(termId: string, card: WhyCard): Promise<void> {
  await getDb().execute(
    'UPDATE terms SET description = ?, why = ? WHERE id = ?',
    [card.description, card.why, termId],
  );
}

export type DeckSummary = {
  id: string;
  title: string;
  source: string;
  created_at: number;
  terms: number; // terms selected for the crossword
};

/** Every ingested document, newest first, with its crossword size. */
export async function getDocuments(): Promise<DeckSummary[]> {
  const { rows } = await getDb().execute(
    `SELECT d.id, d.title, d.source, d.created_at,
       (SELECT count(*) FROM terms t WHERE t.doc_id = d.id AND t.selected = 1) AS terms
     FROM documents d ORDER BY d.created_at DESC, d.rowid DESC`,
  );
  return rows.map(r => ({
    id: String(r.id),
    title: String(r.title),
    source: String(r.source),
    created_at: Number(r.created_at),
    terms: Number(r.terms),
  }));
}

/* ---- Search ("Ask my notes") ---- */

export type ChunkVector = ChunkRow & { embedding: Float32Array };

/** BLOB → Float32Array. op-sqlite returns an ArrayBuffer, other drivers a Uint8Array view. */
function toVector(blob: unknown): Float32Array | null {
  if (blob == null) return null;
  const bytes = ArrayBuffer.isView(blob)
    ? new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength)
    : new Uint8Array(blob as ArrayBuffer);
  if (bytes.byteLength % 4) return null;
  return new Float32Array(bytes.slice().buffer); // copy: the view may be unaligned
}

/** Chunks with their embeddings, for one document or (no docId) all of them. */
export async function getChunkVectors(docId?: string): Promise<ChunkVector[]> {
  const { rows } = await getDb().execute(
    `SELECT id, doc_id, idx, text, embedding FROM chunks${
      docId ? ' WHERE doc_id = ?' : ''
    }
     ORDER BY doc_id, idx`,
    docId ? [docId] : [],
  );
  return rows.flatMap(r => {
    const embedding = toVector(r.embedding);
    return embedding
      ? [
          {
            id: String(r.id),
            doc_id: String(r.doc_id),
            idx: Number(r.idx),
            text: String(r.text),
            embedding,
          },
        ]
      : [];
  });
}

/**
 * Ids of chunks containing any of the words (FTS5). Words are reduced to letters and
 * digits and quoted, so user input can never form FTS5 syntax (AND, NOT, *, quotes).
 */
export async function keywordChunkIds(
  words: string[],
  docId?: string,
): Promise<Set<string>> {
  const terms = [
    ...new Set(words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))),
  ].filter(w => w.length >= 3);
  if (!terms.length) return new Set();
  const { rows } = await getDb().execute(
    `SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ?${
      docId ? ' AND doc_id = ?' : ''
    }`,
    [terms.map(w => `"${w}"`).join(' OR '), ...(docId ? [docId] : [])],
  );
  return new Set(rows.map(r => String(r.chunk_id)));
}

/* ---- Ingest writes (Lane B's pipeline only) ---- */

export async function insertDocument(d: {
  id: string;
  title: string;
  source: string;
  created_at: number;
}): Promise<void> {
  await getDb().execute(
    'INSERT INTO documents (id, title, source, created_at) VALUES (?,?,?,?)',
    [d.id, d.title, d.source, d.created_at],
  );
}

/** Stores a chunk, its embedding, and its FTS5 row (chunks are never edited, so no triggers). */
export async function insertChunk(
  c: ChunkRow & { embedding: Float32Array | null }, // null: the embedder failed
): Promise<void> {
  const db = getDb();
  const e = c.embedding;
  const blob = e
    ? (e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength) as ArrayBuffer)
    : null;
  await db.execute(
    'INSERT INTO chunks (id, doc_id, idx, text, embedding) VALUES (?,?,?,?,?)',
    [c.id, c.doc_id, c.idx, c.text, blob],
  );
  await db.execute(
    'INSERT INTO chunks_fts (text, chunk_id, doc_id) VALUES (?,?,?)',
    [c.text, c.id, c.doc_id],
  );
}

/** Inserts a new, unselected term. A repeated answer in the same document is ignored. */
export async function insertTerm(
  t: Pick<TermRow, 'id' | 'doc_id' | 'chunk_id' | 'term' | 'answer' | 'clue'>,
): Promise<void> {
  await getDb().execute(
    'INSERT OR IGNORE INTO terms (id, doc_id, chunk_id, term, answer, clue) VALUES (?,?,?,?,?,?)',
    [t.id, t.doc_id, t.chunk_id, t.term, t.answer, t.clue],
  );
}

/** Marks exactly these terms as the crossword's (selected = 1); all others in the document get 0. */
export async function setSelectedTerms(
  docId: string,
  termIds: string[],
): Promise<void> {
  const inList = termIds.length
    ? `id IN (${termIds.map(() => '?').join(',')})`
    : '0';
  await getDb().execute(
    `UPDATE terms SET selected = CASE WHEN ${inList} THEN 1 ELSE 0 END WHERE doc_id = ?`,
    [...termIds, docId],
  );
}

export type PendingWhy = {
  id: string;
  term: string;
  clue: string;
  text: string;
};

/** Selected terms still waiting for a "why it matters" card, with their source passage. */
export async function getPendingWhy(docId: string): Promise<PendingWhy[]> {
  const { rows } = await getDb().execute(
    `SELECT t.id, t.term, t.clue, c.text FROM terms t JOIN chunks c ON c.id = t.chunk_id
     WHERE t.doc_id = ? AND t.selected = 1 AND t.why IS NULL ORDER BY t.rowid`,
    [docId],
  );
  return rows.map(r => ({
    id: String(r.id),
    term: String(r.term),
    clue: String(r.clue),
    text: String(r.text),
  }));
}

/* ---- Progress ---- */

/** Answer attempts per local calendar day for the 12-week study activity grid. */
export async function getStudyActivity(
  now = new Date(),
): Promise<Record<string, number>> {
  const firstDay = new Date(now);
  firstDay.setDate(firstDay.getDate() - firstDay.getDay() - 11 * 7);
  firstDay.setHours(0, 0, 0, 0);
  const { rows } = await getDb().execute(
    `SELECT date(ts / 1000, 'unixepoch', 'localtime') AS day, count(*) AS count
     FROM attempts WHERE ts >= ? AND ts <= ? GROUP BY day`,
    [firstDay.getTime(), now.getTime()],
  );
  return Object.fromEntries(rows.map(r => [String(r.day), Number(r.count)]));
}

export async function getDailyRound(
  term: TermRow,
  now = new Date(),
): Promise<{ guesses: string[]; solved: boolean }> {
  const { rows } = await getDb().execute(
    'SELECT guesses, solved FROM daily_rounds WHERE day = ? AND doc_id = ? AND term_id = ?',
    [todayKey(now), term.doc_id, term.id],
  );
  if (!rows[0]) return { guesses: [], solved: false };
  try {
    const guesses: unknown = JSON.parse(String(rows[0].guesses));
    if (
      !Array.isArray(guesses) ||
      guesses.length > 6 ||
      !guesses.every(
        g =>
          typeof g === 'string' &&
          new RegExp(`^[A-Z]{${term.answer.length}}$`).test(g),
      )
    )
      return { guesses: [], solved: false };
    return { guesses, solved: Number(rows[0].solved) === 1 };
  } catch {
    return { guesses: [], solved: false };
  }
}

export async function saveDailyRound(
  term: TermRow,
  guesses: string[],
  solved: boolean,
  now = new Date(),
): Promise<void> {
  await getDb().execute(
    'INSERT INTO daily_rounds (day, doc_id, term_id, guesses, solved) VALUES (?,?,?,?,?) ON CONFLICT(day, doc_id) DO UPDATE SET term_id = excluded.term_id, guesses = excluded.guesses, solved = excluded.solved',
    [
      todayKey(now),
      term.doc_id,
      term.id,
      JSON.stringify(guesses),
      solved ? 1 : 0,
    ],
  );
}

export type DeckProgress = {
  id: string;
  title: string;
  mastered: number; // crossword terms answered correctly at least once
  total: number; // crossword terms
};

export type ProgressStats = {
  streak: number; // consecutive days with an attempt, ending today or yesterday
  mastered: number;
  total: number;
  decks: DeckProgress[];
};

/** Consecutive days (YYYY-MM-DD, any order) ending today, or yesterday if today has none yet. */
export function streakFrom(days: string[], now = new Date()): number {
  const set = new Set(days);
  const d = new Date(now);
  if (!set.has(todayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(todayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Streak and mastery for the Home and Progress screens, from the attempts table. */
export async function getProgressStats(
  now = new Date(),
): Promise<ProgressStats> {
  const db = getDb();
  const { rows: dayRows } = await db.execute(
    `SELECT DISTINCT date(ts / 1000, 'unixepoch', 'localtime') AS d FROM attempts`,
  );
  const { rows } = await db.execute(
    `SELECT d.id, d.title,
       (SELECT count(*) FROM terms t WHERE t.doc_id = d.id AND t.selected = 1) AS total,
       (SELECT count(*) FROM terms t WHERE t.doc_id = d.id AND t.selected = 1
          AND EXISTS (SELECT 1 FROM attempts a WHERE a.term_id = t.id AND a.correct = 1)) AS mastered
     FROM documents d ORDER BY d.created_at DESC, d.rowid DESC`,
  );
  const decks = rows.map(r => ({
    id: String(r.id),
    title: String(r.title),
    total: Number(r.total),
    mastered: Number(r.mastered),
  }));
  return {
    streak: streakFrom(
      dayRows.map(r => String(r.d)),
      now,
    ),
    mastered: decks.reduce((s, d) => s + d.mastered, 0),
    total: decks.reduce((s, d) => s + d.total, 0),
    decks,
  };
}
