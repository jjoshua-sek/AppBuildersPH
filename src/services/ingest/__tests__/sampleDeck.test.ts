import { toAnswer, validateTerms } from '../../ai/termExtractor';
import { createMemoryStore } from '../../db/store';
import { buildCrossword, MIN_PLACED_FOR_GRID } from '../../game/crossword';
import { SAMPLE_DOC_ID, SAMPLE_HANDOUT } from '../../../assets/sample/itAuditCh1';
import { chunk } from '../chunker';
import { loadSampleDeck, SAMPLE_CHUNK_OVERLAP, SAMPLE_CHUNK_WORDS, SAMPLE_TERMS } from '../sampleDeck';

const parts = chunk(SAMPLE_HANDOUT, SAMPLE_CHUNK_WORDS, SAMPLE_CHUNK_OVERLAP);

describe('sample terms', () => {
  test('there are 10, with unique ids and answers', () => {
    expect(SAMPLE_TERMS).toHaveLength(10);
    expect(new Set(SAMPLE_TERMS.map(t => t.id)).size).toBe(10);
    expect(new Set(SAMPLE_TERMS.map(t => t.answer)).size).toBe(10);
  });

  // Holds the hand-written terms to the same rules as the model's output, so
  // the backup deck is exactly what a good extraction would produce.
  test.each(SAMPLE_TERMS.map(t => [t.term, t] as const))('%s passes the extractor checks in its own chunk', (_, t) => {
    const idx = Number(t.chunk_id.split(':')[1]);
    expect(t.doc_id).toBe(SAMPLE_DOC_ID);
    expect(t.answer).toBe(toAnswer(t.term));
    const kept = validateTerms(JSON.stringify({ terms: [{ term: t.term, clue: t.clue }] }), parts[idx], t.chunk_id);
    expect(kept).toHaveLength(1);
  });

  test('includes daily-term lengths (4–10 letters) and longer crossword words', () => {
    const lens = SAMPLE_TERMS.map(t => t.answer.length);
    expect(lens.filter(n => n >= 4 && n <= 10).length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...lens)).toBeGreaterThan(10);
  });

  test('builds a full crossword grid', () => {
    const entries = SAMPLE_TERMS.map(t => ({ termId: t.id, answer: t.answer, clue: t.clue }));
    const puzzle = buildCrossword(entries, 10, 12, () => 0.5);
    expect(puzzle?.entries.length).toBeGreaterThanOrEqual(MIN_PLACED_FOR_GRID);
  });
});

describe('loadSampleDeck', () => {
  test('loads the doc, its chunks and all terms, and is safe to call twice', async () => {
    const store = createMemoryStore();
    await loadSampleDeck(store);
    const docId = await loadSampleDeck(store);
    expect(await store.listDocs()).toHaveLength(1);
    const terms = await store.getTerms(docId);
    expect(terms).toHaveLength(10);
    for (const t of terms) {
      const c = await store.getChunk(t.chunk_id);
      expect(c?.text).toBe(parts[c!.idx]);
    }
  });
});
