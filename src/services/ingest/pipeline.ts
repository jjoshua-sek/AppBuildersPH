import type { AiBridge, TermRow } from '../../types';
import { extractTerms } from '../ai/termExtractor';
import { generateWhy } from '../ai/whyItMatters';
import type { Profile } from '../device/deviceProfile';
import { uid, type DeckStore, type DocRow } from '../db/store';
import { cosine } from '../rag/termSelect';
import { chunk, cleanOcr } from './chunker';

/** A full crossword needs this many terms; fewer still plays as the Clue List. */
export const MIN_TERMS_TO_PLAY = 6;
/** Two terms whose "term: clue" embeddings are this close count as the same idea. */
export const DUP_COSINE = 0.9;
export const CHUNK_OVERLAP = 30;
/** Below this, there isn't enough text to find terms in. */
export const MIN_WORDS = 40;

export const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

export type IngestProgress = {
  docId: string;
  chunk: number; // chunks finished
  total: number;
  terms: number; // terms saved so far
  ready: boolean; // enough terms for a full crossword
  done: boolean;
  cancelled: boolean;
  failedChunks: number; // the model call failed; the other chunks still count
};

export type IngestOptions = {
  bridge: AiBridge;
  store: DeckStore;
  profile: Pick<Profile, 'chunkWords' | 'termsPerChunk' | 'extractTokens' | 'whyTokens'>;
  title: string;
  source: DocRow['source'];
  text: string;
  onProgress?(p: IngestProgress): void;
  /** Set `cancelled` to stop after the chunk in progress. */
  cancel?: { cancelled: boolean };
  /** Write the post-solve "why it matters" cards in the background afterwards. */
  whyCards?: boolean;
};

export type IngestResult = {
  progress: IngestProgress;
  /** Settles when the background cards are written (immediately if there are none). */
  cardsDone: Promise<void>;
};

/**
 * Notes -> chunks -> terms, saved as it goes so the student can start playing
 * as soon as `ready` is true. Each chunk is embedded for "Ask my notes", and
 * each term is embedded to drop near-duplicates found in overlapping chunks.
 */
export async function ingest(o: IngestOptions): Promise<IngestResult> {
  if (countWords(o.text) < MIN_WORDS) throw new Error(`Add more notes: at least ${MIN_WORDS} words.`);
  const parts = chunk(cleanOcr(o.text), o.profile.chunkWords, CHUNK_OVERLAP);

  const docId = uid();
  await o.store.saveDoc({
    id: docId,
    title: o.title.trim() || 'Untitled notes',
    source: o.source,
    created_at: Date.now(),
  });

  const p: IngestProgress = {
    docId,
    chunk: 0,
    total: parts.length,
    terms: 0,
    ready: false,
    done: false,
    cancelled: false,
    failedChunks: 0,
  };
  const emit = () => o.onProgress?.({ ...p });
  emit();

  const kept: { answer: string; vec: Float32Array | null }[] = [];
  const saved: { row: TermRow; passage: string }[] = [];
  const tryEmbed = (s: string) => o.bridge.embed(s).catch(() => null);

  for (let i = 0; i < parts.length; i++) {
    if (o.cancel?.cancelled) {
      p.cancelled = true;
      break;
    }
    const chunkId = `${docId}:${i}`;
    await o.store.saveChunk({ id: chunkId, doc_id: docId, idx: i, text: parts[i], embedding: await tryEmbed(parts[i]) });

    const found = await extractTerms(o.bridge, chunkId, parts[i], {
      maxTerms: o.profile.termsPerChunk,
      n_predict: o.profile.extractTokens,
    }).catch(() => {
      p.failedChunks++;
      return [];
    });

    for (const t of found) {
      if (kept.some(k => k.answer === t.answer)) continue;
      const vec = await tryEmbed(`${t.term}: ${t.clue}`);
      if (vec && kept.some(k => k.vec && cosine(k.vec, vec) > DUP_COSINE)) continue;
      const row: TermRow = {
        id: uid(),
        doc_id: docId,
        chunk_id: chunkId,
        term: t.term,
        answer: t.answer,
        clue: t.clue,
        description: null,
        why: null,
      };
      if (await o.store.saveTerms([row])) {
        kept.push({ answer: t.answer, vec });
        saved.push({ row, passage: parts[i] });
        p.terms++;
      }
    }
    p.chunk = i + 1;
    p.ready = p.terms >= MIN_TERMS_TO_PLAY;
    emit();
  }

  p.done = true;
  emit();

  const cardsDone =
    o.whyCards && !p.cancelled ? writeWhyCards(o.bridge, o.store, saved, o.profile.whyTokens) : Promise.resolve();
  return { progress: { ...p }, cardsDone };
}

/** One card at a time, at low priority; a failed card keeps the clue as its description. */
async function writeWhyCards(
  bridge: AiBridge,
  store: DeckStore,
  terms: { row: TermRow; passage: string }[],
  n_predict: number,
) {
  for (const { row, passage } of terms) {
    try {
      await store.updateTermCard(row.id, await generateWhy(bridge, row, passage, n_predict));
    } catch {
      // The game shows the clue when a card is missing.
    }
  }
}
