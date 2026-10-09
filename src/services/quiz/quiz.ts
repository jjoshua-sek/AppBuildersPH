import type { AiBridge, TermRow } from '../../types';
import { cosine } from '../rag/termSelect';

/**
 * Multiple-choice quiz from a deck. Each question shows a term's clue and four
 * terms to choose from. The wrong options are the deck's other terms the
 * embedding model rates closest in meaning, so they are plausible rather than
 * random. Near-synonyms are skipped, so only one option can be right.
 */

export type QuizQuestion = {
  term: TermRow; // the right answer
  options: TermRow[]; // includes `term`, in display order
  answerIndex: number;
};

export const OPTIONS = 4;
export const MAX_QUESTIONS = 10;
/** Above this, two terms mean nearly the same thing ("audit log" / "audit trail"). */
export const SYNONYM_COSINE = 0.95;

const shuffle = <T>(xs: T[], rand: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Builds up to `count` questions (one per term) from at least 2 terms. With
 * fewer than OPTIONS terms, questions have fewer options. A term whose
 * embedding fails gets random distractors.
 */
export async function buildQuiz(
  bridge: AiBridge,
  terms: TermRow[],
  opts: { count?: number; rand?: () => number } = {},
): Promise<QuizQuestion[]> {
  const { count = MAX_QUESTIONS, rand = Math.random } = opts;
  const pool = [...new Map(terms.map(t => [t.answer, t])).values()];
  if (pool.length < 2) return [];

  const vecs = new Map<string, Float32Array>();
  for (const t of pool) {
    const v = await bridge.embed(`${t.term}: ${t.clue}`).catch(() => null);
    if (v) vecs.set(t.id, v);
  }

  return shuffle(pool, rand)
    .slice(0, count)
    .map(term => {
      const v = vecs.get(term.id);
      const others = pool.filter(o => o.id !== term.id);
      const ranked = v
        ? others
            .map(o => ({
              o,
              s: vecs.has(o.id) ? cosine(v, vecs.get(o.id)!) : -1,
            }))
            .filter(x => x.s < SYNONYM_COSINE)
            .sort((a, b) => b.s - a.s)
            .map(x => x.o)
        : shuffle(others, rand);
      const options = shuffle([term, ...ranked.slice(0, OPTIONS - 1)], rand);
      return { term, options, answerIndex: options.indexOf(term) };
    });
}
