export type Candidate = {
  answer: string;
  chunkIdx: number; // position of the source chunk in the document
  vec: Float32Array; // unit-length embedding of "term: clue"
};

export const cosine = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * Picks the crossword's terms with the embedding model:
 * 1. Drops near-duplicates (same answer, or cosine above `dupThreshold`), e.g.
 *    "audit trail" vs "audit log" from overlapping chunks.
 * 2. Takes terms round-robin across chunks, so the puzzle covers the whole
 *    handout instead of only its first paragraph.
 */
export function selectTerms<T extends Candidate>(
  candidates: T[],
  max = 10,
  dupThreshold = 0.9,
): T[] {
  const kept: T[] = [];
  for (const c of candidates) {
    if (kept.some(k => k.answer === c.answer || cosine(k.vec, c.vec) > dupThreshold)) continue;
    kept.push(c);
  }

  const byChunk = new Map<number, T[]>();
  for (const c of kept) byChunk.set(c.chunkIdx, [...(byChunk.get(c.chunkIdx) ?? []), c]);
  const queues = [...byChunk.entries()].sort((a, b) => a[0] - b[0]).map(([, q]) => q);

  const out: T[] = [];
  while (out.length < max && queues.some(q => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < max) out.push(next);
    }
  }
  return out;
}
