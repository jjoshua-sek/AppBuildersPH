import { SAMPLE_TERMS } from '../../../assets/sample';
import { connect, getDb, migrate, type SqlDb, type SqlValue } from '../client';
import {
  getChunk,
  getDailyTerm,
  getSelectedTerms,
  getTerms,
  logAttempt,
  saveWhy,
} from '../queries';

/** In-memory SQLite (Node's built-in, with FTS5) behind the same interface as op-sqlite. */
function memoryDb(): SqlDb {
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(':memory:');
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const st = d.prepare(sql);
      if (/^\s*(SELECT|WITH)\b/i.test(sql)) return { rows: st.all(...params) };
      st.run(...params);
      return { rows: [] };
    },
  };
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 9, 12); // local noon, so the day key is stable
const byAnswer = (a: string) => SAMPLE_TERMS.find(t => t.answer === a)!;

async function seed() {
  const db = getDb();
  await db.execute('INSERT INTO documents VALUES (?,?,?,?)', [
    'sample',
    'IT Audit',
    'paste',
    0,
  ]);
  await db.execute('INSERT INTO chunks VALUES (?,?,?,?,?)', [
    'sample:0',
    'sample',
    0,
    'first chunk',
    null,
  ]);
  for (const [i, t] of SAMPLE_TERMS.entries()) {
    await db.execute('INSERT INTO terms VALUES (?,?,?,?,?,?,?,?,?)', [
      t.id,
      t.doc_id,
      t.chunk_id,
      t.term,
      t.answer,
      t.clue,
      null,
      null,
      i % 2,
    ]);
  }
}

const miss = (answer: string, ts: number) =>
  logAttempt({
    term_id: byAnswer(answer).id,
    mode: 'crossword',
    correct: 0,
    hints_used: 0,
    ts,
  });

beforeEach(async () => {
  await connect(memoryDb());
  await seed();
});

describe('schema', () => {
  it('migrates twice without error and has FTS5', async () => {
    await migrate(getDb());
    await getDb().execute(
      'INSERT INTO chunks_fts (text, chunk_id, doc_id) VALUES (?,?,?)',
      ['the audit trail records changes', 'sample:0', 'sample'],
    );
    const { rows } = await getDb().execute(
      'SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? AND doc_id = ?',
      ['"trail"', 'sample'],
    );
    expect(rows).toEqual([{ chunk_id: 'sample:0' }]);
  });

  it('rejects a duplicate answer in the same document', async () => {
    const t = SAMPLE_TERMS[0];
    await expect(
      getDb().execute('INSERT INTO terms (id, doc_id, answer) VALUES (?,?,?)', [
        'x',
        t.doc_id,
        t.answer,
      ]),
    ).rejects.toThrow();
  });
});

describe('term queries', () => {
  it('getTerms returns TermRows in insert order', async () => {
    const terms = await getTerms('sample');
    expect(terms).toEqual(
      SAMPLE_TERMS.map(t => ({ ...t, description: null, why: null })),
    );
    expect(await getTerms('other')).toEqual([]);
  });

  it('getSelectedTerms returns only selected ones', async () => {
    const sel = await getSelectedTerms('sample');
    expect(sel.map(t => t.id)).toEqual(
      SAMPLE_TERMS.filter((_, i) => i % 2).map(t => t.id),
    );
  });

  it('saveWhy stores the card, including a null why', async () => {
    const [a, b] = SAMPLE_TERMS;
    await saveWhy(a.id, { description: 'desc', why: 'because' });
    await saveWhy(b.id, { description: 'only desc', why: null });
    const terms = await getTerms('sample');
    expect(terms[0]).toMatchObject({ description: 'desc', why: 'because' });
    expect(terms[1]).toMatchObject({ description: 'only desc', why: null });
  });

  it('getChunk returns the passage or null', async () => {
    expect(await getChunk('sample:0')).toEqual({
      id: 'sample:0',
      doc_id: 'sample',
      idx: 0,
      text: 'first chunk',
    });
    expect(await getChunk('nope')).toBeNull();
  });
});

describe('getDailyTerm', () => {
  it('picks the most-missed term in the last 7 days', async () => {
    await miss('SAMPLING', NOW.getTime() - DAY);
    await miss('SAMPLING', NOW.getTime() - 2 * DAY);
    await miss('EVIDENCE', NOW.getTime() - DAY);
    expect((await getDailyTerm('sample', NOW))?.answer).toBe('SAMPLING');
  });

  it('ignores misses older than 7 days and terms outside 4-10 letters', async () => {
    for (let i = 0; i < 3; i++) await miss('EVIDENCE', NOW.getTime() - 8 * DAY);
    for (let i = 0; i < 3; i++) await miss('INHERENTRISK', NOW.getTime() - DAY); // 12 letters
    await miss('COBIT', NOW.getTime() - DAY);
    expect((await getDailyTerm('sample', NOW))?.answer).toBe('COBIT');
  });

  it('prefers never-seen terms, then the least recently seen', async () => {
    const eligible = SAMPLE_TERMS.filter(
      t => t.answer.length >= 4 && t.answer.length <= 10,
    );
    for (const [i, t] of eligible.entries()) {
      if (t.answer === 'ISACA') continue; // never seen
      await logAttempt({
        term_id: t.id,
        mode: 'daily',
        correct: 1,
        hints_used: 0,
        ts: NOW.getTime() - i * 1000,
      });
    }
    expect((await getDailyTerm('sample', NOW))?.answer).toBe('ISACA');
  });

  it('keeps the same pick all day, and picks again the next day', async () => {
    await miss('SAMPLING', NOW.getTime() - DAY);
    expect((await getDailyTerm('sample', NOW))?.answer).toBe('SAMPLING');
    for (let i = 0; i < 3; i++) await miss('EVIDENCE', NOW.getTime());
    expect(
      (await getDailyTerm('sample', new Date(NOW.getTime() + 60 * 60 * 1000)))
        ?.answer,
    ).toBe('SAMPLING');
    expect(
      (await getDailyTerm('sample', new Date(NOW.getTime() + DAY)))?.answer,
    ).toBe('EVIDENCE');
  });

  it('returns null when the document has no eligible terms', async () => {
    expect(await getDailyTerm('empty', NOW)).toBeNull();
  });
});
