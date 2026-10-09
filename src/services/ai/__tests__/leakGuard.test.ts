import { leaks, maskTerm, MASK, StreamGuard } from '../leakGuard';

describe('leaks', () => {
  test.each([
    ['That was a heroic effort', 'ROI', false],
    ['Your ROI is high', 'ROI', true],
    ['Compare the ROIs', 'ROI', true],
    ['It was roiling', 'ROI', false],
    ['an iambic line', 'IAM', false],
    ['Take a brisk walk', 'risk', false],
    ['Think about risks', 'risk', true],
    ['a risk-based approach', 'risk', true],
    ['The auditor arrived', 'audit', true],
    ['It is A-U-D-I-T', 'audit', true],
    ['spell it a u d i t', 'audit', true],
    ['a. u. d. i. t.', 'audit', true],
    ['you must authenticate first', 'authentication', true],
    ['an AccessControl list', 'access control', true],
    ['an access-control list', 'access control', true],
    ['Access   Control matters', 'access control', true],
    ['access to the control room', 'access control', false],
    ['what protects the data?', 'encryption', false],
    ['anything', '', false],
  ])('%s / %s -> %s', (text, term, expected) => {
    expect(leaks(text, term)).toBe(expected);
  });
});

describe('maskTerm', () => {
  test('masks the term and its suffixed forms', () => {
    expect(maskTerm('The auditor performs an audit.', 'audit')).toBe(
      `The ${MASK} performs an ${MASK}.`,
    );
  });

  test('leaves unrelated words that contain a short term', () => {
    expect(maskTerm('A brisk risk review', 'risk')).toBe(`A brisk ${MASK} review`);
  });

  test('masks stem variants of long terms', () => {
    const out = maskTerm('Users authenticate. Authentication proves identity.', 'authentication');
    expect(out).toBe(`Users ${MASK}. ${MASK} proves identity.`);
  });

  test('masked text never leaks', () => {
    const passage =
      'Access control limits who can use a system. Access-control lists (ACLs) store the rules.';
    expect(leaks(maskTerm(passage, 'access control'), 'access control')).toBe(false);
  });
});

describe('StreamGuard', () => {
  const run = (tokens: string[], term: string) => {
    const shown: string[] = [];
    const guard = new StreamGuard(term, s => shown.push(s));
    for (const t of tokens) guard.push(t);
    return { guard, shown };
  };

  test('never emits any part of a leak split across tokens', () => {
    const tokens = ['Well,', ' a good guess here', ' would be the word', ' aud', 'it'];
    const { guard, shown } = run(tokens, 'audit');
    expect(guard.leaked).toBe(true);
    expect(shown.every(s => !s.toLowerCase().includes('aud'))).toBe(true);
  });

  test('catches a spelled-out leak', () => {
    const { guard } = run(['It is ', 'A', '-', 'U', '-', 'D', '-', 'I', '-', 'T'], 'audit');
    expect(guard.leaked).toBe(true);
  });

  test('passes a safe reply through', () => {
    const reply = 'What does the passage say happens when someone checks the records?';
    const { guard, shown } = run(reply.split(/(?=\s)/), 'audit');
    expect(guard.leaked).toBe(false);
    expect(reply.startsWith(shown[shown.length - 1])).toBe(true);
  });
});
