import type { AiBridge } from '../../types';
import { extractTerms, type ExtractedTerm } from '../ai/termExtractor';
import { generateWhy } from '../ai/whyItMatters';
import { uid } from '../db/client';
import {
  getPendingWhy,
  insertChunk,
  insertDocument,
  insertTerm,
  saveWhy,
  setSelectedTerms,
} from '../db/queries';
import type { Profile } from '../device/deviceProfile';
import { selectTerms } from '../rag/termSelect';
import { chunk } from './chunker';

/** Play unlocks mid-ingest once this many crossword terms are saved and selected. */
export const READY_TERMS = 6;
/** Once the ingest has finished, this many is enough: the game falls back to the Clue List. */
export const MIN_TERMS_TO_PLAY = 3;
export const MAX_PUZZLE_TERMS = 10;
const CHUNK_OVERLAP = 30;

export type Progress = {
  docId: string;
  chunk: number; // chunks read so far
  total: number;
  found: number; // distinct valid terms so far ("7 terms found")
  selected: number; // terms chosen for the crossword so far
  ready: boolean; // the DB already holds >= READY_TERMS selected terms
  failedChunks: number; // the model failed on these; the other chunks still count
  cancelled: boolean; // stopped early by the student
};

export type IngestResult = Omit<Progress, 'chunk'> & { ms: number };

/** Set `cancelled` to stop after the chunk in progress; what was read so far is kept. */
export type CancelToken = { cancelled: boolean };

type Candidate = ExtractedTerm & {
  id: string;
  chunkIdx: number;
  vec: Float32Array;
};

/**
 * Text (pasted or from OCR) → chunks with embeddings → validated terms → the
 * crossword selection, all saved as it goes. After each chunk the `selected`
 * flags are updated, so when `ready` is reported the game can already load
 * getSelectedTerms(docId) while the remaining chunks are read.
 *
 * Throws before writing anything if the text has no words. A model error on one
 * chunk is counted in `failedChunks` and the rest still run (the chunk's text is
 * kept for the tutor); if every chunk fails, the first error is thrown. A chunk
 * whose output fails validation just yields no terms.
 */
export async function ingest(
  bridge: AiBridge,
  p: Profile,
  doc: { title: string; source: string; text: string },
  onProgress: (x: Progress) => void = () => {},
  cancel: CancelToken = { cancelled: false },
): Promise<IngestResult> {
  const t0 = Date.now();
  const parts = chunk(doc.text, p.chunkWords, CHUNK_OVERLAP);
  if (!parts.length) throw new Error('No text to read');

  const docId = uid();
  await insertDocument({
    id: docId,
    title: doc.title,
    source: doc.source,
    created_at: t0,
  });

  const cands: Candidate[] = [];
  const seen = new Set<string>(); // overlapping chunks often yield the same term twice
  let progress: Progress = {
    docId,
    chunk: 0,
    total: parts.length,
    found: 0,
    selected: 0,
    ready: false,
    failedChunks: 0,
    cancelled: false,
  };
  let firstError: unknown = null;
  const fail = (e: unknown) => {
    firstError ??= e;
    progress.failedChunks++;
  };

  for (let i = 0; i < parts.length; i++) {
    if (cancel.cancelled) {
      progress.cancelled = true;
      break;
    }
    const chunkId = `${docId}:${i}`;
    const text = parts[i];
    // Always save the chunk: the tutor needs its text even if the model failed on it.
    const embedding = await bridge.embed(text).catch(e => {
      fail(e);
      return null;
    });
    await insertChunk({ id: chunkId, doc_id: docId, idx: i, text, embedding });

    const found = embedding
      ? await extractTerms(bridge, chunkId, text, {
          maxTerms: p.termsPerChunk,
          n_predict: p.extractTokens,
        }).catch(e => {
          fail(e);
          return [];
        })
      : [];
    for (const t of found) {
      if (seen.has(t.answer)) continue;
      seen.add(t.answer);
      const id = uid();
      await insertTerm({
        id,
        doc_id: docId,
        chunk_id: chunkId,
        term: t.term,
        answer: t.answer,
        clue: t.clue,
      });
      cands.push({
        ...t,
        id,
        chunkIdx: i,
        // Only for near-duplicate checks; without it the term is still deduped by answer.
        vec: await bridge
          .embed(`${t.term}: ${t.clue}`)
          .catch(() => new Float32Array(0)),
      });
    }

    const picked = selectTerms(cands, MAX_PUZZLE_TERMS);
    await setSelectedTerms(
      docId,
      picked.map(c => c.id),
    );
    progress = {
      ...progress,
      chunk: i + 1,
      found: cands.length,
      selected: picked.length,
      ready: picked.length >= READY_TERMS,
    };
    onProgress({ ...progress });
  }

  if (progress.failedChunks && progress.failedChunks === progress.chunk) {
    throw firstError; // nothing worked: the model is likely not loaded
  }
  const { total, found, selected, ready, failedChunks, cancelled } = progress;
  return {
    docId,
    total,
    found,
    selected,
    ready,
    failedChunks,
    cancelled,
    ms: Date.now() - t0,
  };
}

export type WhyFiller = {
  /** Resolves with the number of cards saved once the queue is empty. */
  done: Promise<number>;
  /** Moves a term to the front, e.g. when it is solved before its card is ready. */
  bump(termId: string): void;
};

/**
 * Fire and forget after ingest: fills the "why it matters" cards for the
 * crossword's terms. Each call runs at low priority, so tutor requests preempt it.
 * A failed card is skipped; the UI falls back to the clue.
 */
export function fillWhyCards(
  bridge: AiBridge,
  p: Profile,
  docId: string,
): WhyFiller {
  const front: string[] = [];
  const done = (async () => {
    const pending = await getPendingWhy(docId);
    let saved = 0;
    while (pending.length) {
      const bumped = front
        .map(id => pending.findIndex(r => r.id === id))
        .find(i => i >= 0);
      const [next] = pending.splice(bumped ?? 0, 1);
      try {
        await saveWhy(
          next.id,
          await generateWhy(bridge, next, next.text, p.whyTokens),
        );
        saved++;
      } catch {
        // leave description/why null; the card shows the clue instead
      }
    }
    return saved;
  })();
  return {
    done,
    bump(termId) {
      front.unshift(termId);
    },
  };
}
