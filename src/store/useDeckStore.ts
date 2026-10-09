import { useSyncExternalStore } from 'react';
import type { AiBridge } from '../types';
import { connect, type SqlDb } from '../services/db/client';
import { getDocuments, type DeckSummary } from '../services/db/queries';
import type { Profile } from '../services/device/deviceProfile';
import {
  fillWhyCards,
  ingest,
  MIN_TERMS_TO_PLAY,
  type CancelToken,
  type Progress,
  type WhyFiller,
} from '../services/ingest/pipeline';

/**
 * Deck state: the saved decks, the deck being played, and the ingest in progress.
 * Ingest runs here rather than in the screen, so it keeps going (and its
 * progress survives) if the student leaves the Ingest screen.
 *
 * Same call shape as zustand (`useDeckStore(s => s.status)`), built on React's
 * useSyncExternalStore so it needs no extra dependency.
 */

export type IngestStatus = 'idle' | 'reading' | 'done' | 'error';

export type DeckState = {
  decks: DeckSummary[];
  currentDocId: string | null;
  status: IngestStatus;
  progress: Progress | null;
  error: string | null;
  lastIngestMs: number; // shown on the Proof panel
  dbError: string | null; // the database failed to open
};

const initial: DeckState = {
  decks: [],
  currentDocId: null,
  status: 'idle',
  progress: null,
  error: null,
  lastIngestMs: 0,
  dbError: null,
};

let state = initial;
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let why: WhyFiller | null = null;
let cancel: CancelToken | null = null;
let dbReady: Promise<void> | null = null;

function set(patch: Partial<DeckState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

export const deckStore = {
  getState: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Tests only. */
  reset() {
    running = null;
    why = null;
    cancel = null;
    dbReady = null;
    set(initial);
  },
};

/** Select primitives or stored objects; a selector that builds a new object re-renders forever. */
export function useDeckStore<T>(selector: (s: DeckState) => T): T {
  return useSyncExternalStore(deckStore.subscribe, () => selector(state));
}

/**
 * Call once at app start with op-sqlite's `open({ name: 'backpack.sqlite' })`:
 * creates the tables if needed and loads the deck list. Ingest waits for it.
 * Never rejects; a failure lands in `dbError`.
 */
export function openDecks(db: SqlDb): Promise<void> {
  dbReady ??= (async () => {
    try {
      await connect(db);
      await loadDecks();
    } catch (e) {
      set({ dbError: e instanceof Error ? e.message : String(e) });
    }
  })();
  return dbReady;
}

export async function loadDecks() {
  set({ decks: await getDocuments() });
}

export function setCurrentDeck(docId: string) {
  set({ currentDocId: docId });
}

/** Stops the running ingest after the chunk in progress; what was read is kept. */
export function cancelIngest() {
  if (cancel) cancel.cancelled = true;
}

/** Back to an empty Ingest screen. Ignored while an ingest is running. */
export function resetIngest() {
  if (state.status !== 'reading')
    set({ status: 'idle', progress: null, error: null });
}

/**
 * Reads the text into a new deck. Resolves when done; never rejects (errors land
 * in `status`/`error`). A second call while one is running joins the first.
 * When it finishes, the "why it matters" cards start filling in the background.
 * With `appendTo`, the text becomes another page of that deck.
 */
export function startIngest(
  bridge: AiBridge,
  profile: Profile,
  doc: { title: string; source: string; text: string },
  opts: { appendTo?: string } = {},
): Promise<void> {
  if (running) return running;
  set({ status: 'reading', progress: null, error: null });
  const token: CancelToken = (cancel = { cancelled: false });
  running = (async () => {
    try {
      await dbReady;
      const res = await ingest(
        bridge,
        profile,
        doc,
        progress => set({ progress, currentDocId: progress.docId }),
        token,
        opts,
      );
      // Keep the last progress (it has the counts); mark it cancelled if stopped early.
      set({
        status: 'done',
        currentDocId: res.docId,
        lastIngestMs: res.ms,
        progress: state.progress && {
          ...state.progress,
          cancelled: res.cancelled,
        },
      });
      why = fillWhyCards(bridge, profile, res.docId);
      why.done.catch(() => {}); // background; failures fall back to the clue
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      running = null;
      cancel = null;
      await loadDecks().catch(() => {});
    }
  })();
  return running;
}

/** Call when a term is solved before its "why it matters" card is ready. */
export function bumpWhy(termId: string) {
  why?.bump(termId);
}

/**
 * Play unlocks mid-ingest at READY_TERMS (a full crossword), or once the ingest
 * has finished with MIN_TERMS_TO_PLAY or more (the Clue List covers small decks).
 */
export const canPlay = (s: DeckState) =>
  !!s.progress &&
  (s.progress.ready ||
    (s.status === 'done' && s.progress.selected >= MIN_TERMS_TO_PLAY));
