import type { TermRow } from '../../types';
import { SAMPLE_DOC_ID, SAMPLE_HANDOUT, SAMPLE_TITLE } from '../../assets/sample/itAuditCh1';
import sampleTerms from '../../assets/sample/sample_terms.json';
import type { DeckStore } from '../db/store';
import { chunk } from './chunker';

// The chunk ids in sample_terms.json were assigned with these settings.
export const SAMPLE_CHUNK_WORDS = 180;
export const SAMPLE_CHUNK_OVERLAP = 30;

export const SAMPLE_TERMS: TermRow[] = sampleTerms;

/**
 * Loads the pre-made IT Audit deck (handout, chunks and 10 terms), so the demo
 * never depends on live extraction. Safe to call more than once.
 */
export async function loadSampleDeck(store: DeckStore): Promise<string> {
  await store.saveDoc({ id: SAMPLE_DOC_ID, title: SAMPLE_TITLE, source: 'sample', created_at: 0 });
  const parts = chunk(SAMPLE_HANDOUT, SAMPLE_CHUNK_WORDS, SAMPLE_CHUNK_OVERLAP);
  for (let i = 0; i < parts.length; i++) {
    await store.saveChunk({ id: `${SAMPLE_DOC_ID}:${i}`, doc_id: SAMPLE_DOC_ID, idx: i, text: parts[i], embedding: null });
  }
  await store.saveTerms(SAMPLE_TERMS);
  return SAMPLE_DOC_ID;
}
