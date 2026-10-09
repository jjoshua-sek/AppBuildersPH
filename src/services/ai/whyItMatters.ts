import type { AiBridge } from '../../types';
import { WHY_SYSTEM } from './prompts';
import { parseJsonObject } from './modelJson';

export type WhyCard = { description: string; why: string | null };

export const WHY_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string', maxLength: 240 },
    why: { type: 'string', maxLength: 240 },
  },
  required: ['description', 'why'],
};

const sentenceOk = (s: unknown): s is string => {
  if (typeof s !== 'string') return false;
  const n = s.trim().split(/\s+/).filter(Boolean).length;
  return n >= 5 && n <= 50;
};

/** Parses the model output; falls back to the clue so the card always has a description. */
export function parseWhy(raw: string, clue: string): WhyCard {
  const x = parseJsonObject(raw);
  return {
    description: sentenceOk(x?.description) ? x.description.trim() : clue,
    why: sentenceOk(x?.why) ? x.why.trim() : null,
  };
}

/**
 * Generates the post-solve card for one term. Runs at low priority so a tutor
 * request preempts it; the queue re-runs it afterwards.
 */
export async function generateWhy(
  bridge: AiBridge,
  t: { term: string; clue: string },
  passage: string,
  n_predict = 140,
): Promise<WhyCard> {
  const raw = await bridge.complete({
    messages: [
      { role: 'system', content: WHY_SYSTEM },
      { role: 'user', content: `Term: ${t.term}\nPassage:\n${passage}` },
    ],
    jsonSchema: WHY_SCHEMA,
    n_predict,
    temperature: 0.3,
    priority: 'low',
  });
  return parseWhy(raw, t.clue);
}
