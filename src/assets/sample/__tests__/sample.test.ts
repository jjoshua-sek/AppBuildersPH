import { SAMPLE_TERMS } from '..';
import { leaks, termPatterns } from '../../../services/ai/leakGuard';
import { toAnswer } from '../../../services/ai/termExtractor';
import {
  buildCrossword,
  MIN_PLACED_FOR_GRID,
} from '../../../services/game/crossword';
import { chunk } from '../../../services/ingest/chunker';

const fs = require('fs');
const text: string = fs.readFileSync(
  'src/assets/sample/it_audit_ch1.txt',
  'utf8',
); // jest runs from the repo root;
const chunks = chunk(text);

describe('sample handout', () => {
  it('is one handout page and splits into a few chunks', () => {
    const words = text.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(300);
    expect(words).toBeLessThanOrEqual(400);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('sample terms', () => {
  it('has 10 terms with unique ids and answers', () => {
    expect(SAMPLE_TERMS).toHaveLength(10);
    expect(new Set(SAMPLE_TERMS.map(t => t.id)).size).toBe(10);
    expect(new Set(SAMPLE_TERMS.map(t => t.answer)).size).toBe(10);
  });

  it.each(SAMPLE_TERMS.map(t => [t.answer, t] as const))(
    '%s passes the extractor rules',
    (_, t) => {
      expect(t.doc_id).toBe('sample');
      expect(t.answer).toBe(toAnswer(t.term));
      expect(t.answer).toMatch(/^[A-Z]{3,12}$/);
      const clueWords = t.clue.split(/\s+/).length;
      expect(clueWords).toBeGreaterThanOrEqual(6);
      expect(clueWords).toBeLessThanOrEqual(20);
      expect(leaks(t.clue, t.term)).toBe(false);
      expect(t.description).toBeTruthy();
      expect(t.why).toBeTruthy();
    },
  );

  it.each(SAMPLE_TERMS.map(t => [t.answer, t] as const))(
    '%s appears in its chunk',
    (_, t) => {
      const idx = Number(t.chunk_id.split(':')[1]);
      expect(t.chunk_id).toBe(`sample:${idx}`);
      const found = termPatterns(t.term).some(p => {
        p.lastIndex = 0;
        return p.test(chunks[idx]);
      });
      expect(found).toBe(true);
    },
  );

  it('builds a full crossword grid', () => {
    const puzzle = buildCrossword(
      SAMPLE_TERMS.map(t => ({ termId: t.id, answer: t.answer, clue: t.clue })),
    );
    expect(puzzle?.entries.length ?? 0).toBeGreaterThanOrEqual(
      MIN_PLACED_FOR_GRID,
    );
  });

  it('has Daily Term candidates (4-10 letters)', () => {
    expect(
      SAMPLE_TERMS.filter(t => t.answer.length >= 4 && t.answer.length <= 10)
        .length,
    ).toBeGreaterThan(3);
  });
});
