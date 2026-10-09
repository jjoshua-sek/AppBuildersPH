export type Mark = 'G' | 'Y' | 'X';

/** Green/yellow/gray marks with correct handling of repeated letters. */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const res: Mark[] = Array(answer.length).fill('X');
  const left: Record<string, number> = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) res[i] = 'G';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < answer.length; i++) {
    if (res[i] !== 'G' && left[guess[i]]) {
      res[i] = 'Y';
      left[guess[i]]--;
    }
  }
  return res;
}

/** Any A–Z guess of the right length counts; course terms are not in word lists. */
export const isValidGuess = (g: string, len: number) => new RegExp(`^[A-Z]{${len}}$`).test(g);

export const MAX_GUESSES = 6;
export const MISSES_BEFORE_TUTOR = 3;

/**
 * Picks the day's term: most misses in the last 7 days first, then the term seen
 * least recently (never-seen first). Params: [sinceTs, docId].
 * Look up `daily` for (today, doc) first and save the pick, so it doesn't change.
 */
export const PICK_DAILY_SQL = `
SELECT t.*, SUM(CASE WHEN a.correct = 0 THEN 1 ELSE 0 END) AS misses, MAX(a.ts) AS last_seen
FROM terms t LEFT JOIN attempts a ON a.term_id = t.id AND a.ts > ?
WHERE t.doc_id = ? AND length(t.answer) BETWEEN 4 AND 10
GROUP BY t.id ORDER BY misses DESC, last_seen ASC NULLS FIRST LIMIT 1`;

/** Local date key, e.g. "2026-10-09". */
export const todayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
