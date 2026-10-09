import type { AiBridge, CompleteOptions } from '../../types';

/**
 * Fake model for development and tests: lanes B, C and D build against it until
 * the real llama.rn bridge works on the phones. Never ship it.
 */
export function createMockBridge(opts: { delayMs?: number; dims?: number } = {}): AiBridge {
  const { delayMs = 0, dims = 384 } = opts;
  let stopped = false;
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const reply = (o: CompleteOptions): string => {
    const props = (o.jsonSchema as any)?.properties ?? {};
    if (props.terms) {
      return JSON.stringify({
        terms: [
          { term: 'audit', clue: 'An independent check of records to confirm they are accurate and complete.' },
          { term: 'audit trail', clue: 'A record that shows who did what in a system, and when.' },
        ],
      });
    }
    if (props.why) {
      return JSON.stringify({
        description: 'A placeholder description from the mock model for this term.',
        why: 'A placeholder explanation of why this term matters on the exam.',
      });
    }
    return 'What does your passage say happens right before the records are checked?';
  };

  return {
    async complete(o) {
      stopped = false;
      const text = reply(o);
      let out = '';
      for (const token of text.match(/\S+\s*/g) ?? []) {
        if (stopped) break;
        if (delayMs) await sleep(delayMs);
        out += token;
        o.onToken?.(token);
      }
      return out;
    },
    stopGeneration() {
      stopped = true;
    },
    async embed(text) {
      // Deterministic unit vector from the text, so equal texts embed equally.
      const v = new Float32Array(dims);
      for (let i = 0; i < text.length; i++) v[(text.charCodeAt(i) * 31 + i) % dims] += 1;
      const n = Math.hypot(...v) || 1;
      return v.map(x => x / n);
    },
  };
}
