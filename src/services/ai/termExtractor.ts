import type { AiBridge } from '../../types';
import { leaks, termPatterns } from './leakGuard';
import { termSystem } from './prompts';

export type ExtractedTerm = { term: string; answer: string; clue: string; chunkId: string };

export const toAnswer = (t: string) => t.toUpperCase().replace(/[^A-Z]/g, '');

export const termSchema = (maxTerms: number) => ({
  type: 'object',
  properties: {
    terms: {
      type: 'array',
      maxItems: maxTerms,
      items: {
        type: 'object',
        properties: {
          term: { type: 'string', maxLength: 40 },
          clue: { type: 'string', maxLength: 140 },
        },
        required: ['term', 'clue'],
      },
    },
  },
  required: ['terms'],
});

/** Keeps only crossword-safe, grounded terms whose clue doesn't give the answer away. */
export function validateTerms(raw: string, passage: string, chunkId: string): ExtractedTerm[] {
  let parsed: { terms?: { term?: unknown; clue?: unknown }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed?.terms)) return [];
  return parsed.terms.flatMap((x): ExtractedTerm[] => {
    const term = typeof x?.term === 'string' ? x.term.trim() : '';
    const clue = typeof x?.clue === 'string' ? x.clue.trim() : '';
    const answer = toAnswer(term);
    const words = clue.split(/\s+/).filter(Boolean).length;
    const grounded = termPatterns(term).some(p => {
      p.lastIndex = 0;
      return p.test(passage);
    });
    const ok =
      /^[A-Za-z][A-Za-z -]*$/.test(term) && // letters only, crossword-safe
      answer.length >= 3 &&
      answer.length <= 12 &&
      grounded && // appears in the notes
      words >= 4 &&
      words <= 22 &&
      !leaks(clue, term); // the clue never contains the answer
    return ok ? [{ term, answer, clue, chunkId }] : [];
  });
}

export async function extractTerms(
  bridge: AiBridge,
  chunkId: string,
  passage: string,
  opts: { maxTerms: number; n_predict: number },
): Promise<ExtractedTerm[]> {
  const raw = await bridge.complete({
    messages: [
      { role: 'system', content: termSystem(opts.maxTerms) },
      { role: 'user', content: `Passage:\n${passage}` },
    ],
    jsonSchema: termSchema(opts.maxTerms),
    n_predict: opts.n_predict,
    temperature: 0.2,
    priority: 'normal',
  });
  return validateTerms(raw, passage, chunkId);
}
