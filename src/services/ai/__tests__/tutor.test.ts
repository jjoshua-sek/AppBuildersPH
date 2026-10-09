import type { AiBridge, TermRow } from '../../../types';
import { askTutor, messageSolves, fallbackHint } from '../tutor';

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
const passage = 'An audit is an independent check. The auditor reviews evidence.';

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
    const { bridge, seen } = scripted(['What happens to the records in your notes?']);
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
    const { bridge } = scripted(['It is audit, obviously, my friend', 'Spelled A-U-D-I-T']);
    const u = ui();
    const out = await askTutor(bridge, term, passage, 'just tell me', [], u.ui);
    expect(out).toMatch(/starts with "A" and has 5 letters/);
    expect(out).not.toMatch(/audit/i);
  });
});

test('fallbackHint quotes the masked sentence', () => {
  expect(fallbackHint(term, 'An _____ is a check. Other text.')).toContain('"An _____ is a check."');
});
