import { createMockBridge } from '../mockBridge';
import { extractTerms, validateTerms } from '../termExtractor';
import { parseWhy, generateWhy } from '../whyItMatters';

const passage =
  'An audit is an independent check of records. Internal control is a process that prevents errors. ' +
  'Access is logged. ' +
  'ROI measures return. The heroic auditor uses COBIT.';

const json = (terms: { term: string; clue: string }[]) => JSON.stringify({ terms });

describe('validateTerms', () => {
  test('keeps grounded terms with safe clues', () => {
    const out = validateTerms(
      json([{ term: 'Access', clue: 'The ability to use a system or read its data.' }]),
      passage,
      'c1',
    );
    expect(out).toEqual([
      {
        term: 'Access',
        answer: 'ACCESS',
        clue: 'The ability to use a system or read its data.',
        chunkId: 'c1',
      },
    ]);
  });

  test.each([
    ['answer over 12 letters', 'internal control', 'A process the organization uses to prevent errors.'],
    ['clue contains the term', 'audit', 'An audit checks the records for accuracy.'],
    ['term not in the passage', 'firewall', 'Blocks unwanted network traffic from outside.'],
    ['clue too short', 'COBIT', 'A framework.'],
    ['term has digits', 'ISO 27001', 'A standard for managing information security.'],
    ['answer too long', 'independent check of records', 'What an auditor does with every single record.'],
  ])('rejects: %s', (_, term, clue) => {
    expect(validateTerms(json([{ term, clue }]), passage, 'c1')).toEqual([]);
  });

  test('ROI is grounded by "ROI", not by "heroic"', () => {
    const only = 'The heroic auditor.';
    expect(validateTerms(json([{ term: 'ROI', clue: 'How much you gain compared with what you spent.' }]), only, 'c')).toEqual([]);
  });

  test('bad JSON gives no terms', () => {
    expect(validateTerms('{"terms": [', passage, 'c1')).toEqual([]);
    expect(validateTerms('{"terms": 3}', passage, 'c1')).toEqual([]);
  });
});

test('extractTerms works end to end with the mock bridge', async () => {
  const mockPassage = 'An audit checks records. An audit trail logs every change.';
  const out = await extractTerms(createMockBridge(), 'c1', mockPassage, { maxTerms: 4, n_predict: 180 });
  expect(out.map(t => t.answer)).toEqual(['AUDIT', 'AUDITTRAIL']);
});

describe('why it matters', () => {
  test('falls back to the clue when the output is bad', () => {
    expect(parseWhy('nope', 'the clue')).toEqual({ description: 'the clue', why: null });
    expect(parseWhy('{"description":"too short","why":"x"}', 'the clue')).toEqual({
      description: 'the clue',
      why: null,
    });
  });

  test('generates a card at low priority', async () => {
    const bridge = createMockBridge();
    const spy = jest.spyOn(bridge, 'complete');
    const card = await generateWhy(bridge, { term: 'audit', clue: 'c' }, passage);
    expect(card.why).toMatch(/matters/);
    expect(spy.mock.calls[0][0].priority).toBe('low');
  });
});
