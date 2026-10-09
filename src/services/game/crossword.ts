export type Dir = 'A' | 'D';
export type Entry = { termId: string; answer: string; clue: string };
export type Placed = Entry & { r: number; c: number; dir: Dir; num?: number };
export type Puzzle = { rows: number; cols: number; entries: Placed[] };

const key = (r: number, c: number) => `${r},${c}`;
const step = (d: Dir): [number, number] => (d === 'A' ? [0, 1] : [1, 0]);

function tryBuild(words: Entry[], maxWords: number): Placed[] {
  const cells = new Map<string, { ch: string; dirs: Set<Dir> }>();
  const placed: Placed[] = [];

  /** Number of crossings if the word fits here, or -1 if it doesn't. */
  const fit = (a: string, r: number, c: number, d: Dir): number => {
    const [dr, dc] = step(d);
    if (cells.has(key(r - dr, c - dc)) || cells.has(key(r + dr * a.length, c + dc * a.length))) {
      return -1;
    }
    let crosses = 0;
    for (let i = 0; i < a.length; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const cell = cells.get(key(rr, cc));
      if (cell) {
        if (cell.ch !== a[i] || cell.dirs.has(d)) return -1; // letter clash or same-direction overlap
        crosses++;
      } else if (cells.has(key(rr + dc, cc + dr)) || cells.has(key(rr - dc, cc - dr))) {
        return -1; // would sit side by side with another word
      }
    }
    return crosses;
  };

  const place = (w: Entry, r: number, c: number, d: Dir) => {
    const [dr, dc] = step(d);
    for (let i = 0; i < w.answer.length; i++) {
      const k = key(r + dr * i, c + dc * i);
      const cell = cells.get(k) ?? { ch: w.answer[i], dirs: new Set<Dir>() };
      cell.dirs.add(d);
      cells.set(k, cell);
    }
    placed.push({ ...w, r, c, dir: d });
  };

  if (!words.length) return placed;
  place(words[0], 0, 0, 'A');
  let pending = words.slice(1);
  for (let pass = 0; pass < 2 && pending.length && placed.length < maxWords; pass++) {
    const skipped: Entry[] = [];
    for (const w of pending) {
      if (placed.length >= maxWords) break;
      let best: { r: number; c: number; d: Dir; s: number } | null = null;
      for (const p of placed) {
        for (let i = 0; i < p.answer.length; i++) {
          for (let j = 0; j < w.answer.length; j++) {
            if (p.answer[i] !== w.answer[j]) continue;
            const d: Dir = p.dir === 'A' ? 'D' : 'A';
            const r = p.dir === 'A' ? p.r - j : p.r + i;
            const c = p.dir === 'A' ? p.c + i : p.c - j;
            const s = fit(w.answer, r, c, d);
            if (s > 0 && (!best || s > best.s)) best = { r, c, d, s };
          }
        }
      }
      if (best) place(w, best.r, best.c, best.d);
      else skipped.push(w);
    }
    pending = skipped; // the second pass retries words that fit once others are placed
  }
  return placed;
}

const area = (ps: Placed[]) => {
  const rs = ps.flatMap(p => [p.r, p.r + (p.dir === 'D' ? p.answer.length - 1 : 0)]);
  const cs = ps.flatMap(p => [p.c, p.c + (p.dir === 'A' ? p.answer.length - 1 : 0)]);
  return (Math.max(...rs) - Math.min(...rs) + 1) * (Math.max(...cs) - Math.min(...cs) + 1);
};

function shuffle<T>(a: T[], rand: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function finalize(ps: Placed[]): Puzzle {
  const minR = Math.min(...ps.map(p => p.r));
  const minC = Math.min(...ps.map(p => p.c));
  const entries = ps.map(p => ({ ...p, r: p.r - minR, c: p.c - minC }));
  const rows = Math.max(...entries.map(e => e.r + (e.dir === 'D' ? e.answer.length : 1)));
  const cols = Math.max(...entries.map(e => e.c + (e.dir === 'A' ? e.answer.length : 1)));
  const nums = new Map<string, number>();
  let n = 0;
  [...entries]
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .forEach(e => {
      const k = key(e.r, e.c);
      if (!nums.has(k)) nums.set(k, ++n);
      e.num = nums.get(k); // across and down from the same cell share a number
    });
  return { rows, cols, entries };
}

export const MIN_PLACED_FOR_GRID = 5;

/**
 * Builds the most compact crossword with the most words. Returns null when fewer
 * than 2 words can be placed; callers show the Clue List when it has fewer than
 * MIN_PLACED_FOR_GRID entries.
 */
export function buildCrossword(
  words: Entry[],
  maxWords = 10,
  attempts = 12,
  rand: () => number = Math.random,
): Puzzle | null {
  const uniq = [...new Map(words.map(w => [w.answer, w])).values()]
    .filter(w => /^[A-Z]{3,12}$/.test(w.answer))
    .slice(0, 20);
  if (uniq.length < 2) return null;
  let best: Placed[] = [];
  for (let a = 0; a < attempts; a++) {
    const order =
      a === 0 ? [...uniq].sort((x, y) => y.answer.length - x.answer.length) : shuffle(uniq, rand);
    const ps = tryBuild(order, maxWords);
    if (ps.length > best.length || (ps.length === best.length && ps.length > 1 && area(ps) < area(best))) {
      best = ps;
    }
  }
  return best.length >= 2 ? finalize(best) : null;
}

/** Letter grid for rendering: null marks a black cell. */
export function toGrid(p: Puzzle): (string | null)[][] {
  const g: (string | null)[][] = Array.from({ length: p.rows }, () => Array(p.cols).fill(null));
  for (const e of p.entries) {
    const [dr, dc] = step(e.dir);
    for (let i = 0; i < e.answer.length; i++) g[e.r + dr * i][e.c + dc * i] = e.answer[i];
  }
  return g;
}
