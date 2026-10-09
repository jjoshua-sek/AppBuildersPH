import type { AiBridge, TermRow } from '../../../types';
import {
  askTutor,
  claimsAnswer,
  fallbackHint,
  messageSolves,
  dropPraise,
  plainText,
  wrongGuess,
} from '../tutor';

const term: TermRow = {
  id: 't1',
  doc_id: 'd1',
  chunk_id: 'd1:0',
  term: 'audit',
  answer: 'AUDIT',
  clue: 'An independent check of records to confirm they are accurate.',
  description: null,
  why: null,
};
const passage =
  'An audit is an independent check. The auditor reviews evidence.';

/** Bridge that streams the given replies, one per call. */
function scripted(replies: string[]) {
  const seen: string[] = [];
  let stops = 0;
  let stopped = false;
  const bridge: AiBridge = {
    async complete(o) {
      seen.push(o.messages[0].content);
      stopped = false;
      const text = replies.shift() ?? '';
      let out = '';
      for (const t of text.match(/\S+\s*|\S/g) ?? []) {
        if (stopped) break;
        out += t;
        o.onToken?.(t);
      }
      return out;
    },
    stopGeneration() {
      stops++;
      stopped = true;
    },
    async embed() {
      return new Float32Array(4);
    },
  };
  return { bridge, seen, stops: () => stops };
}

const ui = () => {
  const shown: string[] = [];
  const state = { solved: false };
  return {
    shown,
    state,
    ui: {
      setText: (s: string) => shown.push(s),
      setStatus: () => {},
      onSolved: () => (state.solved = true),
    },
  };
};

describe('messageSolves', () => {
  test.each([
    ['is it audit?', 'AUDIT', true],
    ['Access Control yata', 'ACCESSCONTROL', true],
    ['that was heroic', 'ROI', false],
    ['auditor?', 'AUDIT', false],
  ])('%s / %s -> %s', (msg, answer, expected) => {
    expect(messageSolves(msg, answer)).toBe(expected);
  });
});

describe('askTutor', () => {
  test('solves without calling the model when the student types the answer', async () => {
    const { bridge, seen } = scripted([]);
    const u = ui();
    await askTutor(bridge, term, passage, 'is it AUDIT?', [], u.ui);
    expect(u.state.solved).toBe(true);
    expect(seen).toHaveLength(0);
  });

  test('the model never sees the term', async () => {
    const { bridge, seen } = scripted([
      'What happens to the records in your notes?',
    ]);
    await askTutor(bridge, term, passage, 'help', [], ui().ui);
    expect(seen[0].toLowerCase()).not.toMatch(/audit/);
  });

  test('stops a leaking reply, retries, and never shows the term', async () => {
    const { bridge, stops } = scripted([
      'Think carefully, the answer you want is audit',
      'Who checks the evidence in your notes?',
    ]);
    const u = ui();
    const out = await askTutor(bridge, term, passage, 'just tell me', [], u.ui);
    expect(stops()).toBe(1);
    expect(out).toBe('Who checks the evidence in your notes?');
    expect(u.shown.every(s => !/audit/i.test(s))).toBe(true);
  });

  test('falls back to a template hint after two leaks', async () => {
    const { bridge } = scripted([
      'It is audit, obviously, my friend',
      'Spelled A-U-D-I-T',
    ]);
    const u = ui();
    const out = await askTutor(bridge, term, passage, 'just tell me', [], u.ui);
    expect(out).toMatch(/starts with "A" and has 5 letters/);
    expect(out).not.toMatch(/audit/i);
  });
});

test('fallbackHint quotes the masked sentence', () => {
  expect(fallbackHint(term, 'An _____ is a check. Other text.')).toContain(
    '"An _____ is a check."',
  );
});

describe('wrongGuess', () => {
  test.each([
    ['Atp', 'AUDIT', 'ATP'],
    ['is it NADH?', 'AUDIT', 'NADH'],
    ['ATP ba?', 'AUDIT', 'ATP'],
    ['light reactions yata po', 'AUDIT', 'LIGHT REACTIONS'],
    ['Pa-hint po', 'AUDIT', null],
    ['Give me a hint', 'AUDIT', null],
    ["I'm stuck", 'AUDIT', null],
    ['what does the passage say?', 'AUDIT', null],
    ['hindi ko alam', 'AUDIT', null],
    ['ok thanks', 'AUDIT', null],
    ['is it audit?', 'AUDIT', null], // that solves it
    ['the records are checked by someone outside the company', 'AUDIT', null],
  ])('%s / %s -> %s', (msg, answer, expected) => {
    expect(wrongGuess(msg, answer)).toBe(expected);
  });
});

describe('claimsAnswer', () => {
  test.each([
    ['**Answer:** The Krebs cycle', true],
    ['The answer is the Krebs cycle.', true],
    ['Ang sagot ay ATP.', true],
    ['What do your notes say the auditor reviews?', false],
    ['Your answer is close! What else is checked?', false],
    [
      "Okay, let's see if you can recall the term “NADPH” from the notes.",
      true,
    ],
    ['What term in your notes describes the check?', false],
  ])('%s -> %s', (text, expected) => {
    expect(claimsAnswer(text)).toBe(expected);
  });
});

test('plainText removes markdown', () => {
  expect(plainText('**Hmm**, think about *this*:\n- the `records`')).toBe(
    'Hmm, think about this:\nthe records',
  );
});

describe('askTutor replies', () => {
  test('tells the model when the student guessed wrong', async () => {
    const { bridge, seen } = scripted(['Not quite! Who reviews the evidence?']);
    await askTutor(bridge, term, passage, 'Atp', [], ui().ui);
    expect(seen[0]).toContain(
      'The student just guessed "ATP". That is NOT the hidden term.',
    );
  });

  test('a normal question does not mention a guess', async () => {
    const { bridge, seen } = scripted(['Who reviews the evidence?']);
    await askTutor(bridge, term, passage, 'Pa-hint po', [], ui().ui);
    expect(seen[0]).not.toContain('just guessed');
  });

  test('a reply that claims an answer is retried', async () => {
    const { bridge, stops } = scripted([
      "Hmm! **Answer:** The Krebs cycle. Let's see!",
      'Who reviews the evidence in your notes?',
    ]);
    const u = ui();
    const out = await askTutor(bridge, term, passage, 'Pa-hint po', [], u.ui);
    expect(stops()).toBe(1);
    expect(out).toBe('Who reviews the evidence in your notes?');
    expect(u.shown.some(s => /Answer:/.test(s))).toBe(false);
  });

  test('two answer claims after a wrong guess fall back to a template that says so', async () => {
    const { bridge } = scripted([
      'Great start! **Answer:** ATP/GTP',
      'The answer is the Krebs cycle.',
    ]);
    const out = await askTutor(bridge, term, passage, 'Atp', [], ui().ui);
    expect(out).toMatch(
      /^Not quite, "ATP" isn't it\. Here's a nudge: it starts with "A"/,
    );
  });

  test('an empty reply is retried, then falls back', async () => {
    const { bridge } = scripted(['', '   ']);
    const out = await askTutor(bridge, term, passage, 'help', [], ui().ui);
    expect(out).toMatch(/starts with "A" and has 5 letters/);
  });

  test('markdown is stripped from what the student sees', async () => {
    const { bridge } = scripted(['**Hmm**, who checks the *evidence*?']);
    const u = ui();
    const out = await askTutor(bridge, term, passage, 'help', [], u.ui);
    expect(out).toBe('Hmm, who checks the evidence?');
    expect(u.shown.every(s => !s.includes('*'))).toBe(true);
  });
});

test('dropPraise removes praise sentences only', () => {
  expect(
    dropPraise(
      "The reactions happen in the thylakoids. That's a good start! What do your notes say comes next?",
    ),
  ).toBe(
    'The reactions happen in the thylakoids. What do your notes say comes next?',
  );
});

describe('wrong guesses get the verdict from the app', () => {
  test('the reply starts with "Not quite" and the praise is removed', async () => {
    const { bridge } = scripted([
      "That's a good start! Which records get checked in your notes?",
    ]);
    const u = ui();
    const out = await askTutor(bridge, term, passage, 'Atp', [], u.ui);
    expect(out).toBe(
      'Not quite, "ATP" isn\'t it. Which records get checked in your notes?',
    );
    expect(u.shown.some(s => /good start/i.test(s))).toBe(false);
  });

  test('a reply that is only praise is retried', async () => {
    const { bridge } = scripted([
      'Great job! Exactly.',
      'Who checks the evidence?',
    ]);
    const out = await askTutor(bridge, term, passage, 'Atp', [], ui().ui);
    expect(out).toBe('Not quite, "ATP" isn\'t it. Who checks the evidence?');
  });

  test('a question (not a guess) keeps its wording', async () => {
    const { bridge } = scripted(['Good thinking! Who checks the evidence?']);
    const out = await askTutor(
      bridge,
      term,
      passage,
      'Pa-hint po',
      [],
      ui().ui,
    );
    expect(out).toBe('Good thinking! Who checks the evidence?');
  });
});
