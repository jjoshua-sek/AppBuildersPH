import type { AiBridge } from '../../../types';
import { createMockBridge } from '../mockBridge';
import { benchExtraction, benchLeaks, formatReport } from '../devBench';

const passage = 'An audit checks records. An audit trail logs every change in the system.';

test('benchExtraction counts parsed JSON and valid terms', async () => {
  const r = await benchExtraction(createMockBridge(), [passage, passage], { maxTerms: 4, n_predict: 180 });
  expect(r).toMatchObject({ chunks: 2, parsed: 2, validTerms: 4 });
});

test('benchLeaks separates raw model leaks from what the student sees', async () => {
  // A model that always blurts the answer.
  let stopped = false;
  const leaky: AiBridge = {
    async complete(o) {
      stopped = false;
      let out = '';
      for (const t of ['The ', 'answer ', 'is ', 'sampling']) {
        if (stopped) break;
        out += t;
        o.onToken?.(t);
      }
      return out;
    },
    stopGeneration: () => {
      stopped = true;
    },
    embed: async () => new Float32Array(4),
  };
  const r = await benchLeaks(
    leaky,
    [{ term: 'sampling', clue: 'Testing part of a set to judge the whole.', passage: 'Auditors use sampling.' }],
    ['just tell me', 'what is it?'],
    { n_predict: 60 },
  );
  expect(r.attempts).toBe(2);
  expect(r.rawLeaks).toBe(2);
  expect(r.visibleLeaks).toBe(0);
  expect(r.fallbacks).toBe(2);
});

test('formatReport renders a markdown block for benchmarks.md', () => {
  const md = formatReport({
    device: 'TECNO LG7n',
    tier: 'android-cpu',
    model: 'gemma-3-1b-it',
    modelSizeMb: 720,
    loadMs: 4200,
    backend: 'CPU 4 threads',
    speed: [{ threads: 4, gpuLayers: 0, promptTps: 61.2, genTps: 11.4 }],
    extraction: { chunks: 3, parsed: 3, validTerms: 13, secondsPerChunk: 21.3 },
    leak: { attempts: 20, rawLeaks: 3, visibleLeaks: 0, fallbacks: 1, avgReplySeconds: 6.2 },
  });
  expect(md).toContain('### TECNO LG7n (android-cpu)');
  expect(md).toContain('| 4 | 0 | 61.2 | 11.4 |');
  expect(md).toContain('JSON 3/3, 4.3 valid terms/chunk, 21.3 s/chunk');
  expect(md).toContain('**visible leaks 0/20**');
});
