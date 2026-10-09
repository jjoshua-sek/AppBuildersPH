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
