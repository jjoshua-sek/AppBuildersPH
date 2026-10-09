import { useSyncExternalStore } from 'react';
import type { AiBridge } from '../types';
import { getDocuments, type DeckSummary } from '../services/db/queries';
import type { Profile } from '../services/device/deviceProfile';
import {
  fillWhyCards,
  ingest,
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
};

const initial: DeckState = {
  decks: [],
  currentDocId: null,
  status: 'idle',
  progress: null,
  error: null,
  lastIngestMs: 0,
};

let state = initial;
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let why: WhyFiller | null = null;

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
    set(initial);
  },
};

/** Select primitives or stored objects; a selector that builds a new object re-renders forever. */
export function useDeckStore<T>(selector: (s: DeckState) => T): T {
  return useSyncExternalStore(deckStore.subscribe, () => selector(state));
}

export async function loadDecks() {
  set({ decks: await getDocuments() });
}

export function setCurrentDeck(docId: string) {
  set({ currentDocId: docId });
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
 */
export function startIngest(
  bridge: AiBridge,
  profile: Profile,
  doc: { title: string; source: string; text: string },
): Promise<void> {
  if (running) return running;
  set({ status: 'reading', progress: null, error: null });
  running = (async () => {
    try {
      const res = await ingest(bridge, profile, doc, progress =>
        set({ progress, currentDocId: progress.docId }),
      );
      set({ status: 'done', currentDocId: res.docId, lastIngestMs: res.ms });
      why = fillWhyCards(bridge, profile, res.docId);
      why.done.catch(() => {}); // background; failures fall back to the clue
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      running = null;
      await loadDecks().catch(() => {});
    }
  })();
  return running;
}

/** Call when a term is solved before its "why it matters" card is ready. */
export function bumpWhy(termId: string) {
  why?.bump(termId);
}

/** Play once the DB already holds enough selected terms; a finished small deck can still use the Clue List. */
export const canPlay = (s: DeckState) =>
  !!s.progress &&
  (s.progress.ready || (s.status === 'done' && s.progress.selected >= 2));
