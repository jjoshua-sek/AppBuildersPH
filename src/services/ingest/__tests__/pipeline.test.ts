import { SAMPLE_TERMS, SAMPLE_TEXT } from '../../../assets/sample';
import type { AiBridge, CompleteOptions } from '../../../types';
import { termPatterns } from '../../ai/leakGuard';
import { createMockBridge } from '../../ai/mockBridge';
import { connect, getDb } from '../../db/client';
import { getChunk, getSelectedTerms, getTerms } from '../../db/queries';
import { memoryDb } from '../../db/testing/memoryDb';
import { PROFILES } from '../../device/deviceProfile';
import { chunk } from '../chunker';
import { fillWhyCards, ingest, READY_TERMS, type Progress } from '../pipeline';

const TEXT = SAMPLE_TEXT;
const P = PROFILES['ios-metal']; // 180-word chunks, like the sample's chunk ids

const inText = (term: string, text: string) =>
  termPatterns(term).some(p => {
    p.lastIndex = 0;
    return p.test(text);
  });

/**
 * A scripted model: term extraction returns the sample terms that appear in the
 * passage (at most maxTerms), so the output is grounded like a good LLM's.
 * Everything else comes from the mock bridge.
 */
function scriptedBridge(
  overrides: Partial<AiBridge> = {},
): AiBridge & { calls: CompleteOptions[] } {
  const mock = createMockBridge();
  const calls: CompleteOptions[] = [];
  return {
    calls,
    stopGeneration: mock.stopGeneration,
    embed: mock.embed,
    async complete(o) {
      calls.push(o);
      const props = (o.jsonSchema as any)?.properties ?? {};
      if (props.terms) {
        const passage = o.messages[o.messages.length - 1].content;
        const max = props.terms.maxItems;
        const terms = SAMPLE_TERMS.filter(t => inText(t.term, passage))
          .slice(0, max)
          .map(t => ({ term: t.term, clue: t.clue }));
        return JSON.stringify({ terms });
      }
      return mock.complete(o);
    },
    ...overrides,
  };
}

const count = async (sql: string, params: string[] = []) =>
  Number((await getDb().execute(sql, params)).rows[0].n);

beforeEach(async () => {
  await connect(memoryDb());
});

describe('ingest', () => {
  it('saves the document, chunks, embeddings, FTS rows and terms', async () => {
    const res = await ingest(scriptedBridge(), P, {
      title: 'IT Audit',
      source: 'paste',
      text: TEXT,
    });
    const parts = chunk(TEXT, P.chunkWords, 30);

    expect(
      await count('SELECT count(*) n FROM documents WHERE id = ?', [res.docId]),
    ).toBe(1);
    expect(
      await count('SELECT count(*) n FROM chunks WHERE doc_id = ?', [
        res.docId,
      ]),
    ).toBe(parts.length);
    expect(
      await count('SELECT count(*) n FROM chunks_fts WHERE doc_id = ?', [
        res.docId,
      ]),
    ).toBe(parts.length);
    const { rows } = await getDb().execute(
      'SELECT embedding FROM chunks WHERE doc_id = ?',
      [res.docId],
    );
    for (const r of rows)
      expect((r.embedding as Uint8Array).byteLength).toBe(384 * 4);

    const terms = await getTerms(res.docId);
    expect(new Set(terms.map(t => t.answer)).size).toBe(terms.length);
    expect(terms.length).toBe(res.found);
    for (const t of terms) {
      const c = await getChunk(t.chunk_id);
      expect(c?.doc_id).toBe(res.docId);
      expect(inText(t.term, c!.text)).toBe(true);
    }
    expect(res).toMatchObject({ total: parts.length, ready: true });
    expect(res.ms).toBeGreaterThanOrEqual(0);
  });

  it('selects between READY_TERMS and 10 terms for the crossword', async () => {
    const res = await ingest(scriptedBridge(), P, {
      title: 'IT Audit',
      source: 'paste',
      text: TEXT,
    });
    const sel = await getSelectedTerms(res.docId);
    expect(sel.length).toBe(res.selected);
    expect(sel.length).toBeGreaterThanOrEqual(READY_TERMS);
    expect(sel.length).toBeLessThanOrEqual(10);
  });

  it('reports progress per chunk, and ready only once the DB can serve the game', async () => {
    const seen: Progress[] = [];
    const checks: Promise<void>[] = [];
    await ingest(
      scriptedBridge(),
      P,
      { title: 'x', source: 'paste', text: TEXT },
      x => {
        seen.push(x);
        if (x.ready) {
          checks.push(
            getSelectedTerms(x.docId).then(s =>
              expect(s.length).toBeGreaterThanOrEqual(READY_TERMS),
            ),
          );
        }
      },
    );
    await Promise.all(checks);
    expect(seen.map(x => x.chunk)).toEqual(seen.map((_, i) => i + 1));
    expect(seen.every(x => x.total === seen.length)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
  });

  it('passes the profile limits to the model', async () => {
    const bridge = scriptedBridge();
    await ingest(bridge, PROFILES['android-cpu'], {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    const extract = bridge.calls.filter(
      c => (c.jsonSchema as any)?.properties?.terms,
    );
    expect(extract.length).toBe(chunk(TEXT, 150, 30).length);
    for (const c of extract) {
      expect(c.n_predict).toBe(PROFILES['android-cpu'].extractTokens);
      expect((c.jsonSchema as any).properties.terms.maxItems).toBe(
        PROFILES['android-cpu'].termsPerChunk,
      );
    }
  });

  it('throws on empty text and writes nothing', async () => {
    await expect(
      ingest(scriptedBridge(), P, {
        title: 'x',
        source: 'paste',
        text: ' \n ',
      }),
    ).rejects.toThrow('No text');
    expect(await count('SELECT count(*) n FROM documents')).toBe(0);
  });

  it('survives junk model output with zero terms', async () => {
    const bridge = scriptedBridge({ complete: async () => 'not json' });
    const res = await ingest(bridge, P, {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    expect(res).toMatchObject({ found: 0, selected: 0, ready: false });
    expect(await getTerms(res.docId)).toEqual([]);
  });

  it('propagates a model failure', async () => {
    const bridge = scriptedBridge({
      embed: async () => {
        throw new Error('Embedder not loaded');
      },
    });
    await expect(
      ingest(bridge, P, { title: 'x', source: 'paste', text: TEXT }),
    ).rejects.toThrow('Embedder');
  });

  it('keeps going when the model fails on one chunk', async () => {
    const base = scriptedBridge();
    let extractCalls = 0;
    const bridge = scriptedBridge({
      complete: async o => {
        if ((o.jsonSchema as any)?.properties?.terms && extractCalls++ === 0) {
          throw new Error('context full');
        }
        return base.complete(o);
      },
    });
    const res = await ingest(bridge, P, {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    expect(res.failedChunks).toBe(1);
    expect(res.found).toBeGreaterThan(0);
    // the failed chunk's text is still saved, for the tutor
    expect(await getChunk(`${res.docId}:0`)).toMatchObject({ idx: 0 });
  });

  it('keeps a chunk whose embedding failed, without extracting from it', async () => {
    const mock = createMockBridge();
    let n = 0;
    const bridge = scriptedBridge({
      embed: async t => {
        if (n++ === 0) throw new Error('embedder busy');
        return mock.embed(t);
      },
    });
    const res = await ingest(bridge, P, {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    expect(res.failedChunks).toBe(1);
    expect(await getChunk(`${res.docId}:0`)).not.toBeNull();
    const terms = await getTerms(res.docId);
    expect(terms.some(t => t.chunk_id === `${res.docId}:0`)).toBe(false);
  });

  it('still dedupes by answer when a term embedding fails', async () => {
    const mock = createMockBridge();
    const bridge = scriptedBridge({
      embed: async t => {
        // fail only the "term: clue" embeddings, not the chunks
        if (SAMPLE_TERMS.some(x => t === `${x.term}: ${x.clue}`)) {
          throw new Error('embedder busy');
        }
        return mock.embed(t);
      },
    });
    const res = await ingest(bridge, P, {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    expect(res.failedChunks).toBe(0);
    const terms = await getTerms(res.docId);
    expect(new Set(terms.map(t => t.answer)).size).toBe(terms.length);
    expect(res.selected).toBeGreaterThanOrEqual(READY_TERMS);
  });

  it('stops after the chunk in progress when cancelled, keeping what it read', async () => {
    const cancel = { cancelled: false };
    const seen: Progress[] = [];
    const res = await ingest(
      scriptedBridge(),
      P,
      { title: 'x', source: 'paste', text: TEXT },
      x => {
        seen.push(x);
        cancel.cancelled = true; // the student taps Stop during chunk 1
      },
      cancel,
    );
    expect(seen).toHaveLength(1);
    expect(res).toMatchObject({ cancelled: true, total: 3 });
    expect(
      await count('SELECT count(*) n FROM chunks WHERE doc_id = ?', [
        res.docId,
      ]),
    ).toBe(1);
    expect((await getTerms(res.docId)).length).toBe(res.found);
  });
});

describe('ingest with appendTo (add a page to a deck)', () => {
  // Page 1 is the handout's first half, page 2 the rest: different terms on each.
  const words = TEXT.split(/\s+/);
  const PAGE1 = words.slice(0, 170).join(' ');
  const PAGE2 = words.slice(170).join(' ');
  const answersIn = (text: string) =>
    SAMPLE_TERMS.filter(t => inText(t.term, text)).map(t => t.answer);

  it("adds chunks after the deck's own and keeps one document", async () => {
    const bridge = scriptedBridge();
    const first = await ingest(bridge, P, {
      title: 'Ch 1',
      source: 'camera',
      text: PAGE1,
    });
    const before = await count(
      'SELECT count(*) n FROM chunks WHERE doc_id = ?',
      [first.docId],
    );
    const res = await ingest(
      bridge,
      P,
      { title: 'ignored', source: 'camera', text: PAGE2 },
      () => {},
      { cancelled: false },
      { appendTo: first.docId },
    );
    expect(res.docId).toBe(first.docId);
    expect(await count('SELECT count(*) n FROM documents')).toBe(1);
    const { rows } = await getDb().execute(
      'SELECT id, idx FROM chunks WHERE doc_id = ? ORDER BY idx',
      [first.docId],
    );
    expect(rows.map(r => Number(r.idx))).toEqual(rows.map((_, i) => i)); // 0..n-1, no clash
    expect(rows.length).toBeGreaterThan(before);
    expect(rows.map(r => String(r.id))).toEqual(
      rows.map((_, i) => `${first.docId}:${i}`),
    );
  });

  it('skips answers the deck already has and counts the whole deck', async () => {
    const bridge = scriptedBridge();
    const first = await ingest(bridge, P, {
      title: 'Ch 1',
      source: 'paste',
      text: PAGE1,
    });
    const res = await ingest(
      bridge,
      P,
      { title: 'x', source: 'paste', text: PAGE2 },
      () => {},
      undefined,
      {
        appendTo: first.docId,
      },
    );
    const terms = await getTerms(first.docId);
    expect(new Set(terms.map(t => t.answer)).size).toBe(terms.length);
    expect(res.found).toBe(terms.length);
    const expected = new Set([...answersIn(PAGE1), ...answersIn(PAGE2)]);
    expect(new Set(terms.map(t => t.answer))).toEqual(expected);
  });

  it('re-selects the puzzle across both pages', async () => {
    const bridge = scriptedBridge();
    const first = await ingest(bridge, P, {
      title: 'Ch 1',
      source: 'paste',
      text: PAGE1,
    });
    await ingest(
      bridge,
      P,
      { title: 'x', source: 'paste', text: PAGE2 },
      () => {},
      undefined,
      {
        appendTo: first.docId,
      },
    );
    const sel = await getSelectedTerms(first.docId);
    const pageOf = (chunkId: string) =>
      Number(chunkId.split(':').pop()) < chunk(PAGE1, P.chunkWords, 30).length
        ? 1
        : 2;
    expect(new Set(sel.map(t => pageOf(t.chunk_id)))).toEqual(new Set([1, 2]));
    expect(sel.length).toBeLessThanOrEqual(10);
  });

  it('fails cleanly for a deck that does not exist', async () => {
    await expect(
      ingest(
        scriptedBridge(),
        P,
        { title: 'x', source: 'paste', text: PAGE2 },
        () => {},
        undefined,
        {
          appendTo: 'nope',
        },
      ),
    ).rejects.toThrow('Deck not found');
    expect(await count('SELECT count(*) n FROM chunks')).toBe(0);
  });
});

describe('fillWhyCards', () => {
  it('fills a card for every selected term', async () => {
    const bridge = scriptedBridge();
    const { docId, selected } = await ingest(bridge, P, {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    expect(await fillWhyCards(bridge, P, docId).done).toBe(selected);
    for (const t of await getSelectedTerms(docId)) {
      expect(t.description).toBeTruthy();
      expect(t.why).toBeTruthy();
    }
    expect(await fillWhyCards(bridge, P, docId).done).toBe(0); // nothing left to do
  });

  it('runs at low priority with the profile token budget', async () => {
    const bridge = scriptedBridge();
    const { docId } = await ingest(bridge, P, {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    bridge.calls.length = 0;
    await fillWhyCards(bridge, P, docId).done;
    expect(bridge.calls.length).toBeGreaterThan(0);
    for (const c of bridge.calls)
      expect(c).toMatchObject({ priority: 'low', n_predict: P.whyTokens });
  });

  it('does a bumped term first', async () => {
    const bridge = scriptedBridge();
    const { docId } = await ingest(bridge, P, {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    const sel = await getSelectedTerms(docId);
    const last = sel[sel.length - 1];
    bridge.calls.length = 0;
    const filler = fillWhyCards(bridge, P, docId);
    filler.bump(last.id);
    await filler.done;
    expect(bridge.calls[0].messages[1].content).toContain(
      `Term: ${last.term}\n`,
    );
  });

  it('skips a card that fails and keeps going', async () => {
    const base = scriptedBridge();
    const { docId, selected } = await ingest(base, P, {
      title: 'x',
      source: 'paste',
      text: TEXT,
    });
    let n = 0;
    const flaky = scriptedBridge({
      complete: async o => {
        if (n++ === 0) throw new Error('stopped');
        return base.complete(o);
      },
    });
    expect(await fillWhyCards(flaky, P, docId).done).toBe(selected - 1);
  });
});
