import type { AiBridge, CompleteOptions } from '../../../types';
import { createMemoryStore } from '../../db/store';
import { ingest, MIN_TERMS_TO_PLAY, type IngestProgress } from '../pipeline';

// 17 words, every term below appears in it; repeated so every chunk contains all of them.
const SENTENCE =
  'An audit uses evidence, sampling, risk, materiality, assurance, encryption, backup and an audit trail to judge controls.';
const notes = (times: number) => Array(times).fill(SENTENCE).join(' ');
// 60-word chunks with the fixed 30-word overlap: 136 words -> chunks at 0, 30, 60, 90.
const profile = { chunkWords: 60, termsPerChunk: 4, extractTokens: 180, whyTokens: 140 };

const T = {
  evidence: { term: 'evidence', clue: 'Information an auditor collects to support a conclusion.' },
  sampling: { term: 'sampling', clue: 'Testing part of a population to judge the whole.' },
  risk: { term: 'risk', clue: 'The chance that an event stops the objectives being met.' },
  materiality: { term: 'materiality', clue: 'How big an error must be to change a decision.' },
  assurance: { term: 'assurance', clue: 'Reasonable confidence that systems work as intended.' },
  encryption: { term: 'encryption', clue: 'Turning readable data into a coded form that needs a key.' },
  backup: { term: 'backup', clue: 'A copy of data kept to recover after a failure.' },
  trail: { term: 'audit trail', clue: 'A dated record of who did what in a system.' },
};

type Reply = { term: string; clue: string }[] | Error;

/** Replies to extraction calls in order; "why" calls get a valid card. */
function scriptedBridge(replies: Reply[], opts: { vec?: (s: string) => number[] | null } = {}) {
  const calls: CompleteOptions[] = [];
  const embedded: string[] = [];
  let next = 0;
  const bridge: AiBridge = {
    async complete(o) {
      calls.push(o);
      if ((o.jsonSchema as any)?.properties?.why) {
        return JSON.stringify({
          description: 'A short description written for the card.',
          why: 'It matters because exams ask about it often.',
        });
      }
      const r = replies[next++] ?? [];
      if (r instanceof Error) throw r;
      return JSON.stringify({ terms: r });
    },
    stopGeneration() {},
    async embed(s) {
      embedded.push(s);
      const v = opts.vec ? opts.vec(s) : null;
      if (v === null && opts.vec) throw new Error('embedder failed');
      // Default: a distinct unit vector per text, so nothing counts as a near-duplicate.
      const out = new Float32Array(64);
      if (v) v.forEach((x, i) => (out[i] = x));
      else out[embedded.length % 64] = 1;
      return out;
    },
  };
  return { bridge, calls, embedded };
}

async function run(replies: Reply[], extra: Partial<Parameters<typeof ingest>[0]> = {}, vec?: (s: string) => number[] | null) {
  const store = createMemoryStore();
  const { bridge, calls, embedded } = scriptedBridge(replies, { vec });
  const progress: IngestProgress[] = [];
  const result = await ingest({
    bridge,
    store,
    profile,
    title: ' IT Audit ',
    source: 'paste',
    text: notes(8),
    onProgress: p => progress.push(p),
    ...extra,
  });
  return { store, calls, embedded, progress, result, terms: await store.getTerms(result.progress.docId) };
}

test('saves the doc, every chunk with its embedding, and the terms', async () => {
  const { store, terms, result, embedded } = await run([[T.evidence, T.sampling], [T.risk], [], [T.trail]]);
  expect(result.progress).toMatchObject({ total: 4, chunk: 4, terms: 4, done: true, failedChunks: 0 });
  expect((await store.listDocs())[0].title).toBe('IT Audit');
  expect(terms.map(t => t.answer)).toEqual(['EVIDENCE', 'SAMPLING', 'RISK', 'AUDITTRAIL']);
  expect(terms[2].chunk_id).toBe(`${result.progress.docId}:1`);
  const chunk = await store.getChunk(`${result.progress.docId}:3`);
  expect(chunk?.embedding).toBeInstanceOf(Float32Array);
  expect(embedded).toContain('audit trail: A dated record of who did what in a system.');
});

test('reports progress after each chunk and turns ready at the minimum', async () => {
  const { progress } = await run([[T.evidence, T.sampling, T.risk], [T.materiality, T.assurance], [T.encryption], []]);
  expect(MIN_TERMS_TO_PLAY).toBe(6);
  expect(progress.map(p => [p.chunk, p.terms, p.ready])).toEqual([
    [0, 0, false], // start
    [1, 3, false],
    [2, 5, false],
    [3, 6, true],
    [4, 6, true],
    [4, 6, true], // done
  ]);
  expect(progress[progress.length - 1].done).toBe(true);
});

test('skips a repeated answer from an overlapping chunk', async () => {
  const { terms } = await run([[T.evidence], [{ term: 'Evidence', clue: 'What an auditor gathers before deciding anything.' }]]);
  expect(terms.map(t => t.answer)).toEqual(['EVIDENCE']);
});

test('skips a near-duplicate idea using the embeddings', async () => {
  const same = (s: string) => (s.startsWith('backup') || s.startsWith('encryption') ? [1, 0] : [0, 1]);
  const vec = (s: string) => (s.includes(':') ? same(s) : [0, 0, 1]);
  const { terms } = await run([[T.backup, T.encryption, T.risk]], {}, vec);
  expect(terms.map(t => t.answer)).toEqual(['BACKUP', 'RISK']);
});

test('a failed model call skips that chunk only', async () => {
  const { terms, result } = await run([[T.evidence], new Error('model crashed'), [T.risk]]);
  expect(result.progress.failedChunks).toBe(1);
  expect(terms.map(t => t.answer)).toEqual(['EVIDENCE', 'RISK']);
});

test('a failed embedding still saves the chunk and the term', async () => {
  const { store, terms, result } = await run([[T.evidence]], {}, () => null);
  expect(terms.map(t => t.answer)).toEqual(['EVIDENCE']);
  expect((await store.getChunk(`${result.progress.docId}:0`))?.embedding).toBeNull();
});

test('stops after the current chunk when cancelled', async () => {
  const cancel = { cancelled: false };
  const { result, calls } = await run([[T.evidence], [T.risk], [T.backup]], {
    cancel,
    onProgress: p => {
      if (p.chunk === 1) cancel.cancelled = true;
    },
    whyCards: true,
  });
  expect(result.progress).toMatchObject({ chunk: 1, cancelled: true, done: true, terms: 1 });
  await result.cardsDone;
  expect(calls).toHaveLength(1); // no more chunks, and no cards for a cancelled deck
});

test('writes the why-it-matters cards in the background, at low priority', async () => {
  const { store, result, calls } = await run([[T.evidence, T.risk]], { whyCards: true });
  await result.cardsDone;
  const terms = await store.getTerms(result.progress.docId);
  expect(terms.every(t => t.why === 'It matters because exams ask about it often.')).toBe(true);
  expect(calls.filter(c => c.priority === 'low')).toHaveLength(2);
});

test('rejects notes that are too short, before saving anything', async () => {
  const store = createMemoryStore();
  const { bridge } = scriptedBridge([]);
  await expect(ingest({ bridge, store, profile, title: 'x', source: 'paste', text: 'Too short.' })).rejects.toThrow(
    /at least 40 words/,
  );
  expect(await store.listDocs()).toEqual([]);
});
