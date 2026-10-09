import type { AiBridge } from '../../../types';
import { createMockBridge } from '../../ai/mockBridge';
import { connect } from '../../db/client';
import {
  getChunkVectors,
  insertChunk,
  insertDocument,
  keywordChunkIds,
} from '../../db/queries';
import { memoryDb } from '../../db/testing/memoryDb';
import {
  bestSentence,
  KEYWORD_BOOST,
  keywords,
  QUERY_PREFIX,
  searchNotes,
} from '../retrieve';

const unit = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return Float32Array.from(xs.map(x => x / n));
};

/** Embeds by lookup, so the cosine scores in each test are exact. */
function tableBridge(
  table: Record<string, Float32Array>,
): AiBridge & { embedded: string[] } {
  const mock = createMockBridge();
  const embedded: string[] = [];
  return {
    ...mock,
    embedded,
    async embed(text) {
      embedded.push(text);
      const v = table[text.replace(QUERY_PREFIX, '')];
      if (!v) throw new Error(`no vector for ${text}`);
      return v;
    },
  };
}

const A =
  'Independence means the auditor has no ties to the system. Bias ruins findings.';
const B =
  'COBIT is a framework for IT governance. Auditors map controls to it.';
const C =
  'Sampling tests a subset of transactions. Results are projected to the population.';

async function seed(vectors: Record<string, Float32Array>) {
  await insertDocument({
    id: 'd1',
    title: 'Ch 1',
    source: 'paste',
    created_at: 1,
  });
  await insertDocument({
    id: 'd2',
    title: 'Ch 2',
    source: 'paste',
    created_at: 2,
  });
  await insertChunk({
    id: 'd1:0',
    doc_id: 'd1',
    idx: 0,
    text: A,
    embedding: vectors[A],
  });
  await insertChunk({
    id: 'd1:1',
    doc_id: 'd1',
    idx: 1,
    text: B,
    embedding: vectors[B],
  });
  await insertChunk({
    id: 'd2:0',
    doc_id: 'd2',
    idx: 0,
    text: C,
    embedding: vectors[C],
  });
}

const V = { [A]: unit(1, 0, 0), [B]: unit(0, 1, 0), [C]: unit(0, 0, 1) };

beforeEach(async () => {
  await connect(memoryDb());
});

describe('searchNotes', () => {
  it('ranks by cosine similarity and returns the best snippet', async () => {
    await seed(V);
    const q = 'How does bias ruin audit findings?';
    const hits = await searchNotes(
      tableBridge({ ...V, [q]: unit(0.9, 0.1, 0.4) }),
      q,
    );
    expect(hits.map(h => h.chunkId)).toEqual(['d1:0', 'd2:0', 'd1:1']);
    expect(hits[0]).toMatchObject({
      docId: 'd1',
      idx: 0,
      text: A,
      snippet: 'Bias ruins findings.',
    });
    expect(hits[0].keyword).toBe(true); // "bias" is in the passage
    expect(hits[0].score).toBeCloseTo(
      unit(0.9, 0.1, 0.4)[0] + KEYWORD_BOOST,
      5,
    );
  });

  it('prefixes the query, never the stored passages', async () => {
    await seed(V);
    const b = tableBridge({ ...V, 'what is cobit': unit(0, 1, 0) });
    await searchNotes(b, '  what is cobit ');
    expect(b.embedded).toEqual([QUERY_PREFIX + 'what is cobit']);
  });

  it('boosts chunks that contain a keyword from the question', async () => {
    const q = 'Tell me about COBIT';
    const vectors = {
      [A]: unit(0.9, 0.436, 0),
      [B]: unit(0.85, 0.527, 0),
      [C]: unit(0, 0, 1),
    };
    await seed(vectors);
    const hits = await searchNotes(
      tableBridge({ ...vectors, [q]: unit(1, 0, 0) }),
      q,
      { k: 2 },
    );
    expect(hits.map(h => [h.chunkId, h.keyword])).toEqual([
      ['d1:1', true],
      ['d1:0', false],
    ]);
    expect(hits[0].score).toBeCloseTo(
      0.85 / Math.hypot(0.85, 0.527) + KEYWORD_BOOST,
      5,
    );
  });

  it('searches one deck, or all decks', async () => {
    await seed(V);
    const q = 'sampling';
    const b = tableBridge({ ...V, [q]: unit(0, 0, 1) });
    expect(
      (await searchNotes(b, q, { docId: 'd1' })).map(h => h.docId),
    ).toEqual(['d1', 'd1']);
    expect((await searchNotes(b, q))[0]).toMatchObject({
      chunkId: 'd2:0',
      keyword: true,
    });
  });

  it('skips chunks embedded with a different model', async () => {
    await seed({ ...V, [C]: unit(1, 2, 3, 4) });
    const q = 'anything';
    const hits = await searchNotes(
      tableBridge({ ...V, [q]: unit(1, 1, 1) }),
      q,
      { k: 5 },
    );
    expect(hits.map(h => h.chunkId).sort()).toEqual(['d1:0', 'd1:1']);
  });

  it('returns nothing for an empty question without running the model', async () => {
    await seed(V);
    const b = tableBridge(V);
    expect(await searchNotes(b, '   ')).toEqual([]);
    expect(b.embedded).toEqual([]);
  });

  it('is safe with FTS5 syntax in the question', async () => {
    await seed(V);
    const q = 'NOT "cobit" * OR (bias) AND near/2 -';
    const hits = await searchNotes(
      tableBridge({ ...V, [q]: unit(1, 0, 0) }),
      q,
      { k: 3 },
    );
    expect(hits).toHaveLength(3);
    expect(hits.find(h => h.chunkId === 'd1:1')?.keyword).toBe(true);
  });
});

describe('db helpers', () => {
  it('round-trips embeddings exactly', async () => {
    await seed(V);
    const rows = await getChunkVectors('d1');
    expect(rows.map(r => r.id)).toEqual(['d1:0', 'd1:1']);
    expect(Array.from(rows[1].embedding)).toEqual(Array.from(V[B]));
  });

  it('keywordChunkIds ignores short and empty words', async () => {
    await seed(V);
    expect(await keywordChunkIds([])).toEqual(new Set());
    expect(await keywordChunkIds(['it', '**'])).toEqual(new Set());
    expect(await keywordChunkIds(['Auditors', 'sampling'])).toEqual(
      new Set(['d1:1', 'd2:0']),
    );
  });
});

describe('text helpers', () => {
  it('keywords drops stop words (English and Tagalog) and duplicates', () => {
    expect(keywords('Ano ang COBIT at bakit ang COBIT ay mahalaga?')).toEqual([
      'cobit',
      'mahalaga',
    ]);
    expect(keywords('What is the audit trail for?')).toEqual([
      'audit',
      'trail',
    ]);
  });

  it('bestSentence picks the sentence with most keywords, else the first', () => {
    const text =
      'First line here. The audit trail logs changes. Audit scope is set.';
    expect(bestSentence(text, ['audit', 'trail'])).toBe(
      'The audit trail logs changes.',
    );
    expect(bestSentence(text, ['zebra'])).toBe('First line here.');
    expect(bestSentence('', ['x'])).toBe('');
  });
});
