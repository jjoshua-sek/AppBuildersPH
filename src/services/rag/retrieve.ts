import type { AiBridge } from '../../types';
import { getChunkVectors, keywordChunkIds } from '../db/queries';
import { cosine } from './termSelect';

/**
 * "Ask my notes": finds the passages that answer a question, on the device.
 * Brute-force cosine over the chunk embeddings (2k chunks take milliseconds),
 * plus a small boost for chunks that contain the question's keywords (FTS5), so
 * an exact course term like "COBIT" ranks its passage first.
 */

/** snowflake-arctic-embed: queries get this prefix, documents don't (see its model card). */
export const QUERY_PREFIX =
  'Represent this sentence for searching relevant passages: ';
export const KEYWORD_BOOST = 0.1;

export type NoteHit = {
  chunkId: string;
  docId: string;
  idx: number;
  text: string; // the whole chunk
  snippet: string; // the sentence that best matches the question
  score: number;
  keyword: boolean; // contains a keyword from the question
};

const STOP = new Set(
  'the and for are was were what which who whom whose why how when where does did this that these those with from into about than then there their they them have has had not but can could would should will shall its you your our ang mga ano bakit paano sino saan kailan yung iyong nang para'.split(
    ' ',
  ),
);

/** Content words of a question (3+ letters, no stop words). */
export const keywords = (q: string) =>
  [...new Set(q.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter(
    w => !STOP.has(w),
  );

/** The sentence sharing the most keywords with the question (the first one on a tie). */
export function bestSentence(text: string, words: string[]): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let best = sentences[0] ?? '';
  let bestHits = 0;
  for (const s of sentences) {
    const lower = s.toLowerCase();
    const hits = words.filter(w => lower.includes(w)).length;
    if (hits > bestHits) {
      best = s;
      bestHits = hits;
    }
  }
  return best.trim();
}

/**
 * Top `k` passages for a question, best first. Searches one deck, or all decks
 * when `docId` is omitted. Chunks embedded with a different model (other vector
 * length) are skipped.
 */
export async function searchNotes(
  bridge: AiBridge,
  query: string,
  opts: { docId?: string; k?: number } = {},
): Promise<NoteHit[]> {
  const { docId, k = 3 } = opts;
  const q = query.trim();
  if (!q) return [];

  const words = keywords(q);
  const [qv, chunks, kw] = await Promise.all([
    bridge.embed(QUERY_PREFIX + q),
    getChunkVectors(docId),
    keywordChunkIds(words, docId),
  ]);

  return chunks
    .filter(c => c.embedding.length === qv.length)
    .map(c => {
      const keyword = kw.has(c.id);
      return {
        chunkId: c.id,
        docId: c.doc_id,
        idx: c.idx,
        text: c.text,
        snippet: bestSentence(c.text, words),
        score: cosine(c.embedding, qv) + (keyword ? KEYWORD_BOOST : 0),
        keyword,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
