import type { Attempt, TermRow } from '../../../types';
import { createMemoryStore, pickDailyTerm } from '../store';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 9, 20, 0).getTime(); // 8 PM local, Oct 9

const term = (id: string, answer: string, doc_id = 'd1'): TermRow => ({
  id,
  doc_id,
  chunk_id: `${doc_id}:0`,
  term: answer.toLowerCase(),
  answer,
  clue: `A clue for ${id} that is long enough.`,
  description: null,
  why: null,
});
const miss = (term_id: string, ts: number): Attempt => ({ term_id, mode: 'crossword', correct: 0, hints_used: 0, ts });
const hit = (term_id: string, ts: number): Attempt => ({ ...miss(term_id, ts), correct: 1 });

describe('saveTerms', () => {
  test('skips a repeated answer in the same doc, but not in another doc', async () => {
    const s = createMemoryStore();
    expect(await s.saveTerms([term('a', 'AUDIT'), term('b', 'AUDIT'), term('c', 'AUDIT', 'd2')])).toBe(2);
    expect((await s.getTerms('d1')).map(t => t.id)).toEqual(['a']);
    expect((await s.getTerms('d2')).map(t => t.id)).toEqual(['c']);
  });

  test('returned rows are copies, so callers cannot change the store by accident', async () => {
    const s = createMemoryStore();
    await s.saveTerms([term('a', 'AUDIT')]);
    (await s.getTerms('d1'))[0].clue = 'changed';
    expect((await s.getTerm('a'))?.clue).not.toBe('changed');
  });
});

test('updateTermCard fills description and why', async () => {
  const s = createMemoryStore();
  await s.saveTerms([term('a', 'AUDIT')]);
  await s.updateTermCard('a', { description: 'An independent check.', why: 'It finds errors.' });
  expect(await s.getTerm('a')).toMatchObject({ description: 'An independent check.', why: 'It finds errors.' });
  await expect(s.updateTermCard('missing', { description: 'x', why: null })).resolves.toBeUndefined();
});

test('getChunk returns null for an unknown id', async () => {
  expect(await createMemoryStore().getChunk('nope')).toBeNull();
});

test('listDocs puts the newest first', async () => {
  const s = createMemoryStore();
  await s.saveDoc({ id: 'old', title: 'Old', source: 'paste', created_at: 1 });
  await s.saveDoc({ id: 'new', title: 'New', source: 'camera', created_at: 2 });
  expect((await s.listDocs()).map(d => d.id)).toEqual(['new', 'old']);
});

describe('pickDailyTerm', () => {
  const terms = [term('risk', 'RISK'), term('cobit', 'COBIT'), term('backup', 'BACKUP')];

  test('only answers of 4–10 letters qualify', () => {
    expect(pickDailyTerm([term('a', 'ROI'), term('b', 'MATERIALITY')], [], NOW)).toBeNull();
  });

  test('with no attempts, the first term in the deck wins', () => {
    expect(pickDailyTerm(terms, [], NOW)?.id).toBe('risk');
  });

  test('the most-missed term in the last 7 days wins', () => {
    const attempts = [miss('cobit', NOW - DAY), miss('backup', NOW - DAY), miss('backup', NOW - 2 * DAY)];
    expect(pickDailyTerm(terms, attempts, NOW)?.id).toBe('backup');
  });

  test('misses older than 7 days do not count', () => {
    const attempts = [miss('backup', NOW - 8 * DAY), miss('backup', NOW - 9 * DAY), miss('cobit', NOW - DAY)];
    expect(pickDailyTerm(terms, attempts, NOW)?.id).toBe('cobit');
  });

  test('with equal misses, a never-seen term beats a recently seen one', () => {
    expect(pickDailyTerm(terms, [hit('risk', NOW - DAY)], NOW)?.id).toBe('cobit');
  });

  test('with equal misses, the term seen longest ago wins', () => {
    const attempts = [hit('risk', NOW - DAY), hit('cobit', NOW - 3 * DAY), hit('backup', NOW - 2 * DAY)];
    expect(pickDailyTerm(terms, attempts, NOW)?.id).toBe('cobit');
  });
});

describe('getDailyTerm', () => {
  test('keeps the same pick all day, and picks again the next day', async () => {
    const s = createMemoryStore();
    await s.saveTerms([term('risk', 'RISK'), term('cobit', 'COBIT')]);
    expect((await s.getDailyTerm('d1', NOW))?.id).toBe('risk');

    await s.logAttempt(miss('cobit', NOW + 1000));
    expect((await s.getDailyTerm('d1', NOW + 2000))?.id).toBe('risk'); // same day: unchanged
    expect((await s.getDailyTerm('d1', NOW + DAY))?.id).toBe('cobit'); // next day: most missed
  });

  test('returns null for a deck with no usable terms', async () => {
    expect(await createMemoryStore().getDailyTerm('empty', NOW)).toBeNull();
  });
});
