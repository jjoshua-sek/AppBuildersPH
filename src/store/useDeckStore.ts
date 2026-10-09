import { create } from 'zustand';
import { bridge, profile, stats } from '../services/ai/llamaBridge';
import { store, type DocRow } from '../services/db/store';
import { ingest, type IngestProgress } from '../services/ingest/pipeline';
import { loadSampleDeck } from '../services/ingest/sampleDeck';

type DeckState = {
  /** The deck the games play. Lane C reads this. */
  currentDocId: string | null;
  status: 'idle' | 'running' | 'done' | 'error';
  progress: IngestProgress | null;
  error: string;
  start(input: { title: string; text: string; source: DocRow['source'] }): Promise<void>;
  cancel(): void;
  loadSample(): Promise<void>;
  /** Clears a finished or failed run so the Ingest screen starts fresh. */
  reset(): void;
};

/** The student can play once a full crossword is possible, or once reading ends with any terms. */
export const canPlay = (p: IngestProgress | null) => !!p && (p.ready || (p.done && p.terms > 0));

// Lives outside the store so cancelling never waits on React.
let cancelToken = { cancelled: false };

export const useDeckStore = create<DeckState>((set, get) => ({
  currentDocId: null,
  status: 'idle',
  progress: null,
  error: '',

  async start({ title, text, source }) {
    if (get().status === 'running') return;
    cancelToken = { cancelled: false };
    set({ status: 'running', progress: null, error: '' });
    const t0 = Date.now();
    try {
      const { progress } = await ingest({
        bridge,
        store,
        profile,
        title,
        source,
        text,
        cancel: cancelToken,
        whyCards: true,
        onProgress: p => set({ progress: p, ...(canPlay(p) ? { currentDocId: p.docId } : {}) }),
      });
      stats.lastIngestMs = Date.now() - t0;
      set({ status: 'done', progress });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  cancel() {
    cancelToken.cancelled = true;
  },

  async loadSample() {
    const docId = await loadSampleDeck(store);
    set({ currentDocId: docId });
  },

  reset() {
    if (get().status !== 'running') set({ status: 'idle', progress: null, error: '' });
  },
}));
