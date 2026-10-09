import type { AiBridge } from '../../types';
import { leaks, termPatterns } from './leakGuard';
import { parseJsonObject, salvageTermObjects } from './modelJson';
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

/** Longest answer the crossword accepts (e.g. AUTHENTICATION = 14, ACCESSCONTROL = 13). */
export const MAX_ANSWER = 15;

/** Why a term can't be used, or null when it's fine. */
export function rejectReason(term: string, clue: string, passage: string): string | null {
  const answer = toAnswer(term);
  const words = clue.split(/\s+/).filter(Boolean).length;
  if (!/^[A-Za-z][A-Za-z -]*$/.test(term)) return 'not letters only';
  if (answer.length < 3) return 'answer too short';
  if (answer.length > MAX_ANSWER) return `answer over ${MAX_ANSWER} letters`;
  const grounded = termPatterns(term).some(p => {
    p.lastIndex = 0;
    return p.test(passage);
  });
  if (!grounded) return 'not in the notes';
  if (words < 4) return 'clue too short';
  if (words > 22) return 'clue too long';
  if (leaks(clue, term)) return 'clue gives the answer away';
  return null;
}

/** Every term the model proposed, with the reason it was rejected (null = kept). */
export function reviewTerms(raw: string, passage: string) {
  const parsed = parseJsonObject(raw);
  const items: { term?: unknown; clue?: unknown }[] = Array.isArray(parsed?.terms)
    ? parsed.terms
    : salvageTermObjects(raw); // cut off before the JSON closed: keep the finished terms
  return items.map(x => {
    const term = typeof x?.term === 'string' ? x.term.trim() : '';
    const clue = typeof x?.clue === 'string' ? x.clue.trim() : '';
    return { term, clue, reason: rejectReason(term, clue, passage) };
  });
}

/** Keeps only crossword-safe, grounded terms whose clue doesn't give the answer away. */
export function validateTerms(raw: string, passage: string, chunkId: string): ExtractedTerm[] {
  return reviewTerms(raw, passage)
    .filter(t => t.reason === null)
    .map(({ term, clue }) => ({ term, answer: toAnswer(term), clue, chunkId }));
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
