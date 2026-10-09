import { parseJsonObject, salvageTermObjects } from '../modelJson';
import { validateTerms } from '../termExtractor';
import { parseWhy } from '../whyItMatters';

describe('parseJsonObject', () => {
  test('reads JSON inside a code fence with prose around it', () => {
    const raw = 'Here are the terms:\n```json\n{"terms": [{"term": "audit", "clue": "x"}]}\n```\nHope this helps!';
    expect(parseJsonObject(raw)).toEqual({ terms: [{ term: 'audit', clue: 'x' }] });
  });

  test('returns null for no JSON or broken JSON', () => {
    expect(parseJsonObject('no json here')).toBeNull();
    expect(parseJsonObject('{"terms": [{"term": "a"')).toBeNull();
  });
});

describe('salvageTermObjects', () => {
  test('keeps the finished terms from output cut off by the token limit', () => {
    const raw =
      '{"terms": [{"term": "audit trail", "clue": "A record of who changed what, and when."}, ' +
      '{"term": "sampling", "clue": "Testing part of the \\"population\\" to judge"}, {"term": "materi';
    expect(salvageTermObjects(raw)).toEqual([
      { term: 'audit trail', clue: 'A record of who changed what, and when.' },
      { term: 'sampling', clue: 'Testing part of the "population" to judge' },
    ]);
  });
});

test('validateTerms recovers terms from truncated, fenced model output', () => {
  const passage = 'Auditors review the audit trail. They use sampling to test a population.';
  const raw =
    '```json\n{"terms": [{"term": "audit trail", "clue": "A record of who changed what in a system, and when."}, ' +
    '{"term": "sampling", "clue": "Testing a portion of transactions to judge the whole set."}, {"term": "pop';
  expect(validateTerms(raw, passage, 'c').map(t => t.answer)).toEqual(['AUDITTRAIL', 'SAMPLING']);
});

test('parseWhy reads fenced JSON', () => {
  const raw =
    '```json\n{"description": "A record of every change made in a system.", "why": "Auditors use it to trace who did what and when."}\n```';
  expect(parseWhy(raw, 'clue').why).toBe('Auditors use it to trace who did what and when.');
});
