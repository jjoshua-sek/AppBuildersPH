import { SAMPLE_TEXT } from '../../assets/sample';
import { createMockBridge } from '../../services/ai/mockBridge';
import { connect } from '../../services/db/client';
import { getTerms } from '../../services/db/queries';
import { memoryDb } from '../../services/db/testing/memoryDb';
import { PROFILES } from '../../services/device/deviceProfile';
import type { AiBridge } from '../../types';
import {
  canPlay,
  deckStore,
  loadDecks,
  resetIngest,
  setCurrentDeck,
  startIngest,
} from '../useDeckStore';

const P = PROFILES['ios-metal'];
const doc = { title: 'IT Audit', source: 'paste', text: SAMPLE_TEXT };

/** Mock model whose extraction returns two grounded terms per chunk, named after the chunk. */
function bridge(): AiBridge {
  const mock = createMockBridge();
  return {
    ...mock,
    async complete(o) {
      if (!(o.jsonSchema as any)?.properties?.terms) return mock.complete(o);
      const words = o.messages[1].content.match(/[a-z]{8,}/g) ?? [];
      const terms = [...new Set(words)].slice(0, 4).map(term => ({
        term,
        clue: 'A key idea from this part of the handout that students should recall.',
      }));
      return JSON.stringify({ terms });
    },
  };
}

beforeEach(async () => {
  deckStore.reset();
  await connect(memoryDb());
});

it('runs an ingest to done and lists the new deck', async () => {
  const seen: string[] = [];
  const unsub = deckStore.subscribe(() =>
    seen.push(deckStore.getState().status),
  );
  await startIngest(bridge(), P, doc);
  unsub();
  const s = deckStore.getState();
  expect(s.status).toBe('done');
  expect(seen[0]).toBe('reading');
  expect(s.progress?.chunk).toBe(s.progress?.total);
  expect(s.currentDocId).toBe(s.progress?.docId);
  expect(s.decks).toEqual([
    expect.objectContaining({
      id: s.currentDocId,
      title: 'IT Audit',
      source: 'paste',
    }),
  ]);
  expect(s.decks[0].terms).toBe(s.progress?.selected);
  expect(canPlay(s)).toBe(true);
});

it('joins a second start instead of ingesting twice', async () => {
  const b = bridge();
  const first = startIngest(b, P, doc);
  const second = startIngest(b, P, doc);
  expect(second).toBe(first);
  await first;
  await loadDecks();
  expect(deckStore.getState().decks).toHaveLength(1);
});

it('puts errors in state instead of throwing', async () => {
  await startIngest(bridge(), P, { ...doc, text: '   ' });
  expect(deckStore.getState()).toMatchObject({
    status: 'error',
    error: 'No text to read',
  });
  expect(canPlay(deckStore.getState())).toBe(false);
});

it('fills why cards in the background after ingest', async () => {
  await startIngest(bridge(), P, doc);
  const id = deckStore.getState().currentDocId!;
  for (let i = 0; i < 50; i++) {
    const terms = (await getTerms(id)).filter(t => t.why);
    if (terms.length === deckStore.getState().progress!.selected) break;
    await new Promise<void>(r => setTimeout(r, 0));
  }
  const filled = (await getTerms(id)).filter(t => t.why).length;
  expect(filled).toBe(deckStore.getState().progress!.selected);
});

it('resetIngest clears a finished ingest but keeps the current deck', async () => {
  await startIngest(bridge(), P, doc);
  const id = deckStore.getState().currentDocId;
  resetIngest();
  expect(deckStore.getState()).toMatchObject({
    status: 'idle',
    progress: null,
    currentDocId: id,
  });
  setCurrentDeck('other');
  expect(deckStore.getState().currentDocId).toBe('other');
});

it('canPlay: ready mid-ingest, or a finished deck with at least 2 terms', () => {
  const p = {
    docId: 'd',
    chunk: 1,
    total: 3,
    found: 6,
    selected: 6,
    ready: true,
  };
  const base = deckStore.getState();
  expect(canPlay({ ...base, status: 'reading', progress: p })).toBe(true);
  expect(
    canPlay({
      ...base,
      status: 'reading',
      progress: { ...p, selected: 3, ready: false },
    }),
  ).toBe(false);
  expect(
    canPlay({
      ...base,
      status: 'done',
      progress: { ...p, selected: 3, ready: false },
    }),
  ).toBe(true);
  expect(
    canPlay({
      ...base,
      status: 'done',
      progress: { ...p, selected: 1, ready: false },
    }),
  ).toBe(false);
});
