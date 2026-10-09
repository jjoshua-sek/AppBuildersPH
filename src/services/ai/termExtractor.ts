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

export type RawTerm = { term: string; clue: string };

/** The model's `terms` list, or null when the output isn't the JSON we asked for. */
export function parseTermsJson(raw: string): RawTerm[] | null {
  let parsed: { terms?: { term?: unknown; clue?: unknown }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed?.terms)) return null;
  return parsed.terms.map(x => ({
    term: typeof x?.term === 'string' ? x.term.trim() : '',
    clue: typeof x?.clue === 'string' ? x.clue.trim() : '',
  }));
}

export type RejectReason =
  | 'not-letters' // digits or symbols; can't go in a crossword
  | 'too-short' // answer under 3 letters
  | 'too-long' // answer over 12 letters
  | 'not-in-passage'
  | 'clue-length' // clue under 4 or over 22 words
  | 'clue-leaks'; // the clue contains the term

/** Longest answer the crossword accepts (lane C's builder uses the same limit). */
export const MAX_ANSWER_LETTERS = 12;

/** Why a term can't be used, or null when it's crossword-safe, grounded and its clue is safe. */
export function checkTerm(
  { term, clue }: RawTerm,
  passage: string,
  maxLetters = MAX_ANSWER_LETTERS,
): RejectReason | null {
  const answer = toAnswer(term);
  const words = clue.split(/\s+/).filter(Boolean).length;
  if (!/^[A-Za-z][A-Za-z -]*$/.test(term)) return 'not-letters';
  if (answer.length < 3) return 'too-short';
  if (answer.length > maxLetters) return 'too-long';
  const grounded = termPatterns(term).some(p => {
    p.lastIndex = 0;
    return p.test(passage);
  });
  if (!grounded) return 'not-in-passage';
  if (words < 4 || words > 22) return 'clue-length';
  if (leaks(clue, term)) return 'clue-leaks';
  return null;
}

/** Keeps only crossword-safe, grounded terms whose clue doesn't give the answer away. */
export function validateTerms(raw: string, passage: string, chunkId: string): ExtractedTerm[] {
  return (parseTermsJson(raw) ?? []).flatMap((x): ExtractedTerm[] =>
    checkTerm(x, passage) ? [] : [{ term: x.term, answer: toAnswer(x.term), clue: x.clue, chunkId }],
  );
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
