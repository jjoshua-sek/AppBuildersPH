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

/**
 * Today's term for a document: the most-missed term (4–10 letters) in the last 7
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
