import type { AiBridge } from '../../../types';
import {
  BENCH_CHUNKS,
  LEAK_MESSAGES,
  LEAK_TERMS,
} from '../../../assets/sample/benchData';
import { benchLeaks } from '../devBench';
import { leaks, termPatterns } from '../leakGuard';
import { messageSolves } from '../tutor';

/**
 * The tutor ship gate (docs/BUILD_SPEC.md, section 11): 10 terms x 5 scripted
 * student messages = 50 attempts, 0 visible leaks. The same cases run on the
 * phone with DevBench "4b. Full tutor leak test (50 attempts)".
 */

const cases = LEAK_TERMS.map(t => ({ ...t, passage: BENCH_CHUNKS[t.chunk] }));

/** Ways a small model gives the answer away; the guard must catch every one. */
const LEAK_STYLES: ((term: string) => string)[] = [
  t => 'Okay fine, the answer is ' + t + '.',
  t => 'It is ' + t.toUpperCase() + '!',
  t => 'Spell it: ' + t.toUpperCase().replace(/ /g, '').split('').join('-'),
  t => 'Think of ' + t.replace(/ /g, '-') + ' in your notes.',
  t =>
    'Close! It is ' +
    t
      .split(' ')
      .map(w => w[0].toUpperCase() + w.slice(1))
      .join(' ') +
    's.',
];

/** Worst case: a model that leaks on every single reply, in a rotating style. */
function leakyBridge() {
  let call = 0;
  let stopped = false;
  const bridge: AiBridge = {
    async complete(o) {
      stopped = false;
      const system = o.messages[0].content;
      const c = cases.find(x => system.includes(x.clue));
      const text = c
        ? LEAK_STYLES[call++ % LEAK_STYLES.length](c.term)
        : 'No idea.';
      let out = '';
      for (const ch of text.split('')) {
        if (stopped) break;
        out += ch;
        o.onToken?.(ch);
      }
      return out;
    },
    stopGeneration() {
      stopped = true;
    },
    async embed() {
      return new Float32Array(4);
    },
  };
  return bridge;
}

test('the full gate is 10 terms x 5 messages = 50 attempts', () => {
  expect(LEAK_TERMS).toHaveLength(10);
  expect(LEAK_MESSAGES).toHaveLength(5);
  expect(new Set(LEAK_TERMS.map(t => t.term)).size).toBe(10);
});

test('every leak term appears in its passage, so masking is really tested', () => {
  for (const c of cases) {
    const found = termPatterns(c.term).some(p => {
      p.lastIndex = 0;
      return p.test(c.passage);
    });
    expect([c.term, found]).toEqual([c.term, true]);
  }
});

test('no clue gives away its own term', () => {
  for (const c of cases)
    expect([c.term, leaks(c.clue, c.term)]).toEqual([c.term, false]);
});

test('no scripted message solves its term, so each one reaches the model', () => {
  for (const c of cases) {
    const answer = c.term.toUpperCase().replace(/[^A-Z]/g, '');
    for (const m of LEAK_MESSAGES) expect(messageSolves(m, answer)).toBe(false);
  }
});

test('the guard catches every leak style for every term', () => {
  for (const c of cases) {
    for (const style of LEAK_STYLES) {
      const text = style(c.term);
      expect([text, leaks(text, c.term)]).toEqual([text, true]);
    }
  }
});

test('ship gate: a model that leaks every reply still shows 0 leaks in 50 attempts', async () => {
  const r = await benchLeaks(leakyBridge(), cases, LEAK_MESSAGES, {
    n_predict: 90,
  });
  expect(r.attempts).toBe(50);
  expect(r.rawLeaks).toBe(50);
  expect(r.visibleLeaks).toBe(0);
  expect(r.fallbacks).toBe(50);
});
