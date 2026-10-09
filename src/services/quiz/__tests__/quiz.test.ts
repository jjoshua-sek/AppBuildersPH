import type { AiBridge, TermRow } from '../../../types';
import { createMockBridge } from '../../ai/mockBridge';
import { buildQuiz, OPTIONS, SYNONYM_COSINE } from '../quiz';

const unit = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return Float32Array.from(xs.map(x => x / n));
};

const term = (answer: string): TermRow => ({
  id: `t-${answer}`,
  doc_id: 'd',
  chunk_id: 'd:0',
  term: answer.toLowerCase(),
  answer,
  clue: `Clue for ${answer.toLowerCase()} written as a full sentence.`,
  description: null,
  why: null,
});

// Meaning space: AUDIT's neighbours in order EVIDENCE, SAMPLING, ASSURANCE; LEDGER is far;
// AUDITLOG is a near-synonym of AUDIT.
const V: Record<string, Float32Array> = {
  AUDIT: unit(1, 0, 0),
  AUDITLOG: unit(0.99, 0.05, 0),
  EVIDENCE: unit(0.9, 0.43, 0),
  SAMPLING: unit(0.8, 0.6, 0),
  ASSURANCE: unit(0.6, 0.8, 0),
  LEDGER: unit(0, 0, 1),
};

function vectorBridge(
  failFor: string[] = [],
): AiBridge & { embedded: string[] } {
  const embedded: string[] = [];
  return {
    ...createMockBridge(),
    embedded,
    async embed(text) {
      embedded.push(text);
      const answer = text.split(':')[0].toUpperCase();
      if (failFor.includes(answer)) throw new Error('embedder busy');
      return V[answer];
    },
  };
}

/** Deterministic "random" so shuffles are repeatable. */
const seeded =
  (seed = 1) =>
  () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

const ALL = Object.keys(V).map(term);
const qFor = (qs: Awaited<ReturnType<typeof buildQuiz>>, a: string) =>
  qs.find(q => q.term.answer === a)!;
const answers = (ts: TermRow[]) => ts.map(t => t.answer).sort();

it('uses the closest other terms as wrong options, skipping near-synonyms', async () => {
  expect(
    V.AUDIT[0] * V.AUDITLOG[0] + V.AUDIT[1] * V.AUDITLOG[1],
  ).toBeGreaterThan(SYNONYM_COSINE);
  const qs = await buildQuiz(vectorBridge(), ALL, { rand: seeded() });
  const q = qFor(qs, 'AUDIT');
  expect(q.options).toHaveLength(OPTIONS);
  expect(answers(q.options)).toEqual([
    'ASSURANCE',
    'AUDIT',
    'EVIDENCE',
    'SAMPLING',
  ]);
  expect(q.options[q.answerIndex].answer).toBe('AUDIT');
});

it('asks one question per term, up to count, each with the right answer in its options', async () => {
  const qs = await buildQuiz(vectorBridge(), ALL, { rand: seeded(7) });
  expect(answers(qs.map(q => q.term))).toEqual(answers(ALL));
  for (const q of qs) {
    expect(q.options[q.answerIndex].id).toBe(q.term.id);
    expect(new Set(q.options.map(o => o.id)).size).toBe(q.options.length);
  }
  expect(
    await buildQuiz(vectorBridge(), ALL, { count: 3, rand: seeded() }),
  ).toHaveLength(3);
});

it('shuffles where the right answer sits', async () => {
  const positions = new Set<number>();
  for (let s = 1; s < 12; s++) {
    const qs = await buildQuiz(vectorBridge(), ALL, { rand: seeded(s) });
    positions.add(qFor(qs, 'LEDGER').answerIndex);
  }
  expect(positions.size).toBeGreaterThan(1);
});

it('embeds each term once', async () => {
  const b = vectorBridge();
  await buildQuiz(b, ALL, { rand: seeded() });
  expect(b.embedded).toHaveLength(ALL.length);
});

it('still gives full questions when an embedding fails', async () => {
  const qs = await buildQuiz(vectorBridge(['AUDIT']), ALL, { rand: seeded() });
  expect(qFor(qs, 'AUDIT').options).toHaveLength(OPTIONS);
  // other terms still rank by meaning; AUDIT (no vector) sorts last for them
  expect(answers(qFor(qs, 'EVIDENCE').options)).not.toContain('AUDIT');
});

it('works with small decks and ignores duplicate answers', async () => {
  const two = [term('AUDIT'), term('LEDGER'), { ...term('AUDIT'), id: 'dup' }];
  const qs = await buildQuiz(vectorBridge(), two, { rand: seeded() });
  expect(qs).toHaveLength(2);
  for (const q of qs) expect(q.options).toHaveLength(2);
  expect(await buildQuiz(vectorBridge(), [term('AUDIT')])).toEqual([]);
});
