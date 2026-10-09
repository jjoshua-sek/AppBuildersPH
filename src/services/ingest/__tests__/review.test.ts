import { SAMPLE_TERMS } from '../../../assets/sample';
import { connect, getDb } from '../../db/client';
import {
  getDailyTerm,
  getSelectedTerms,
  getTerm,
  getTerms,
  logAttempt,
  saveWhy,
  setSelectedTerms,
} from '../../db/queries';
import { memoryDb } from '../../db/testing/memoryDb';
import { MAX_PUZZLE_TERMS } from '../pipeline';
import {
  addToPuzzle,
  editProblem,
  editTerm,
  removeTerm,
  ReviewError,
} from '../review';

const CLUE = 'A record showing who changed what in a system, and when.';
const id = (answer: string) => SAMPLE_TERMS.find(t => t.answer === answer)!.id;

/** The 10 sample terms in deck "sample"; the first `selected` are in the puzzle. */
async function seed(selected = 6) {
  const db = getDb();
  await db.execute('INSERT INTO documents VALUES (?,?,?,?)', [
    'sample',
    'IT Audit',
    'paste',
    0,
  ]);
  for (const t of SAMPLE_TERMS) {
    await db.execute(
      'INSERT INTO terms (id, doc_id, chunk_id, term, answer, clue) VALUES (?,?,?,?,?,?)',
      [t.id, t.doc_id, t.chunk_id, t.term, t.answer, t.clue],
    );
  }
  await setSelectedTerms(
    'sample',
    SAMPLE_TERMS.slice(0, selected).map(t => t.id),
  );
}

beforeEach(async () => {
  await connect(memoryDb());
  await seed();
});

describe('editProblem', () => {
  test.each([
    [{ term: 'NADP+', clue: CLUE }, /letters only/],
    [{ term: 'IT', clue: CLUE }, /at least 3 letters/],
    [{ term: 'segregation of duties', clue: CLUE }, /at most 15 letters/],
    [{ term: 'audit trail', clue: 'A log.' }, /at least 4 words/],
    [{ term: 'audit trail', clue: 'word '.repeat(23) }, /22 words/],
    [
      {
        term: 'audit trail',
        clue: 'The audit trail records who changed what.',
      },
      /gives the answer away/,
    ],
  ])('%j -> %s', (edit, msg) => {
    expect(editProblem(edit)).toMatch(msg);
  });

  it('accepts a corrected OCR spelling that is not in the notes', () => {
    expect(
      editProblem({
        term: 'NADP',
        clue: 'The carrier that accepts electrons at the end of the chain.',
      }),
    ).toBeNull();
  });
});

describe('editTerm', () => {
  it('saves the term, its answer and clue, and clears the old card', async () => {
    const tid = id('EVIDENCE');
    await saveWhy(tid, { description: 'old card', why: 'old why' });
    const t = await editTerm(tid, {
      term: '  audit   evidence ',
      clue: ' Proof an auditor gathers to support each finding. ',
    });
    expect(t).toMatchObject({
      term: 'audit evidence',
      answer: 'AUDITEVIDENCE',
      clue: 'Proof an auditor gathers to support each finding.',
      description: null,
      why: null,
    });
  });

  it('refuses an answer another term in the deck already has', async () => {
    await expect(
      editTerm(id('EVIDENCE'), { term: 'sampling', clue: CLUE }),
    ).rejects.toThrow('already has that answer');
    expect((await getTerm(id('EVIDENCE')))!.answer).toBe('EVIDENCE');
  });

  it('keeps the same answer when only the clue changes', async () => {
    const t = await editTerm(id('COBIT'), {
      term: 'COBIT',
      clue: 'A framework that maps IT governance objectives and controls.',
    });
    expect(t.answer).toBe('COBIT');
  });

  it('throws a ReviewError for a bad edit and changes nothing', async () => {
    await expect(
      editTerm(id('COBIT'), { term: 'x', clue: CLUE }),
    ).rejects.toBeInstanceOf(ReviewError);
    expect((await getTerm(id('COBIT')))!.term).toBe('COBIT');
  });
});

describe('removeTerm', () => {
  it('replaces a deleted puzzle term with the next one left out', async () => {
    const before = (await getSelectedTerms('sample')).map(t => t.id);
    await removeTerm(before[0]);
    const after = (await getSelectedTerms('sample')).map(t => t.id);
    expect(after).toHaveLength(before.length);
    expect(after).not.toContain(before[0]);
    expect(after).toContain(SAMPLE_TERMS[6].id); // first term that wasn't selected
    expect(await getTerm(before[0])).toBeNull();
  });

  it('shrinks the puzzle when nothing is left to promote', async () => {
    await getDb().execute('DELETE FROM terms');
    await getDb().execute('DELETE FROM documents');
    await seed(10);
    await removeTerm(SAMPLE_TERMS[0].id);
    expect(await getSelectedTerms('sample')).toHaveLength(9);
  });

  it('leaves the puzzle alone when the term was not in it', async () => {
    const before = (await getSelectedTerms('sample')).map(t => t.id);
    await removeTerm(SAMPLE_TERMS[9].id);
    expect((await getSelectedTerms('sample')).map(t => t.id)).toEqual(before);
    expect(await getTerms('sample')).toHaveLength(9);
  });

  it('removes its attempts and Daily Term pick', async () => {
    const tid = id('SAMPLING');
    await logAttempt({
      term_id: tid,
      mode: 'crossword',
      correct: 0,
      hints_used: 0,
      ts: Date.now(),
    });
    const daily = await getDailyTerm('sample');
    expect(daily?.id).toBe(tid);
    await removeTerm(tid);
    const { rows } = await getDb().execute(
      'SELECT count(*) n FROM attempts WHERE term_id = ?',
      [tid],
    );
    expect(Number(rows[0].n)).toBe(0);
    expect((await getDailyTerm('sample'))?.id).not.toBe(tid);
  });
});

describe('addToPuzzle', () => {
  it('adds a left-out term', async () => {
    await addToPuzzle(SAMPLE_TERMS[8].id);
    expect((await getSelectedTerms('sample')).map(t => t.id)).toContain(
      SAMPLE_TERMS[8].id,
    );
  });

  it(`refuses when the puzzle already has ${MAX_PUZZLE_TERMS} terms`, async () => {
    await getDb().execute('DELETE FROM terms');
    await getDb().execute('DELETE FROM documents');
    await seed(10);
    await getDb().execute(
      'INSERT INTO terms (id, doc_id, chunk_id, term, answer, clue) VALUES (?,?,?,?,?,?)',
      ['extra', 'sample', 'sample:0', 'ledger', 'LEDGER', CLUE],
    );
    await expect(addToPuzzle('extra')).rejects.toThrow('Delete one first');
  });
});
