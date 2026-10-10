import type { Dir, Placed, Puzzle } from './crossword';

/**
 * Play rules for the mini-crossword: a cursor on a cell with a direction,
 * letters typed straight into cells, and the usual mini behaviours (the cursor
 * moves on after each letter, tapping the selected cell flips Across/Down).
 * Pure functions, so they are tested without the screen.
 */

export type Cursor = { r: number; c: number; dir: Dir };
/** Letters typed so far, keyed by "r,c". */
export type Letters = Record<string, string>;

export const cellKey = (r: number, c: number) => `${r},${c}`;

const without = (letters: Letters, k: string): Letters => {
  const out = { ...letters };
  delete out[k];
  return out;
};

export const entryCells = (e: Placed): [number, number][] =>
  Array.from({ length: e.answer.length }, (_, i) => [
    e.r + (e.dir === 'D' ? i : 0),
    e.c + (e.dir === 'A' ? i : 0),
  ]);

export const entriesAt = (p: Puzzle, r: number, c: number): Placed[] =>
  p.entries.filter(e => entryCells(e).some(([er, ec]) => er === r && ec === c));

/** The entry the cursor is in: the one running in the cursor's direction. */
export const entryFor = (p: Puzzle, cur: Cursor | null): Placed | undefined =>
  cur ? entriesAt(p, cur.r, cur.c).find(e => e.dir === cur.dir) : undefined;

/** Clue order: all Across by number, then all Down by number. */
export const clueOrder = (p: Puzzle): Placed[] =>
  [...p.entries].sort(
    (a, b) =>
      (a.dir === b.dir ? 0 : a.dir === 'A' ? -1 : 1) || (a.num ?? 0) - (b.num ?? 0),
  );

/** Cursor at the first cell of the entry that is still empty (or its first cell). */
export function startOf(e: Placed, letters: Letters): Cursor {
  const cells = entryCells(e);
  const free = cells.find(([r, c]) => !letters[cellKey(r, c)]) ?? cells[0];
  return { r: free[0], c: free[1], dir: e.dir };
}

/**
 * A tap on a cell. Tapping the selected cell again flips direction when a word
 * runs the other way through it; otherwise the cursor keeps its direction when
 * it can. A tap on a black cell (no word) changes nothing.
 */
export function tapCell(p: Puzzle, cur: Cursor | null, r: number, c: number): Cursor | null {
  const here = entriesAt(p, r, c);
  if (!here.length) return cur;
  if (cur && cur.r === r && cur.c === c) {
    const other = here.find(e => e.dir !== cur.dir);
    return other ? { r, c, dir: other.dir } : cur;
  }
  const dir = here.some(e => e.dir === cur?.dir) ? (cur as Cursor).dir : here[0].dir;
  return { r, c, dir };
}

/** Flips the direction at the cursor (tapping the clue bar), if a word runs that way. */
export function flipDirection(p: Puzzle, cur: Cursor): Cursor {
  const other = entriesAt(p, cur.r, cur.c).find(e => e.dir !== cur.dir);
  return other ? { ...cur, dir: other.dir } : cur;
}

/** Jump to the next (delta 1) or previous (delta -1) clue, wrapping around. */
export function stepClue(p: Puzzle, cur: Cursor | null, letters: Letters, delta: 1 | -1): Cursor | null {
  const order = clueOrder(p);
  if (!order.length) return cur;
  const now = entryFor(p, cur);
  const i = now ? order.indexOf(now) : -1;
  const next = order[(i + delta + order.length) % order.length];
  return startOf(next, letters);
}

export function typeLetter(
  p: Puzzle,
  letters: Letters,
  locked: ReadonlySet<string>,
  cur: Cursor,
  ch: string,
): { letters: Letters; cur: Cursor } {
  const entry = entryFor(p, cur);
  const k = cellKey(cur.r, cur.c);
  const next = locked.has(k) ? letters : { ...letters, [k]: ch.toUpperCase() };
  if (!entry) return { letters: next, cur };
  const cells = entryCells(entry);
  const at = cells.findIndex(([r, c]) => r === cur.r && c === cur.c);
  // The next cell that is still open; failing that, simply the next one; at the end, stay put.
  const open = (j: number) => !locked.has(cellKey(...cells[j])) && !next[cellKey(...cells[j])];
  let j = at + 1;
  while (j < cells.length && !open(j)) j++;
  if (j >= cells.length) j = at + 1 < cells.length && !locked.has(cellKey(...cells[at + 1])) ? at + 1 : at;
  return { letters: next, cur: { r: cells[j][0], c: cells[j][1], dir: cur.dir } };
}

export function backspace(
  p: Puzzle,
  letters: Letters,
  locked: ReadonlySet<string>,
  cur: Cursor,
): { letters: Letters; cur: Cursor } {
  const k = cellKey(cur.r, cur.c);
  if (letters[k] && !locked.has(k)) {
    return { letters: without(letters, k), cur };
  }
  const entry = entryFor(p, cur);
  if (!entry) return { letters, cur };
  const cells = entryCells(entry);
  const at = cells.findIndex(([r, c]) => r === cur.r && c === cur.c);
  if (at <= 0) return { letters, cur };
  const [pr, pc] = cells[at - 1];
  const pk = cellKey(pr, pc);
  const prev = { r: pr, c: pc, dir: cur.dir };
  if (locked.has(pk)) return { letters, cur: prev };
  return { letters: without(letters, pk), cur: prev };
}

/** What the student has typed in an entry; '' for an empty cell. */
export const typedWord = (letters: Letters, e: Placed) =>
  entryCells(e)
    .map(([r, c]) => letters[cellKey(r, c)] ?? '')
    .join('');

export const isFull = (letters: Letters, e: Placed) =>
  entryCells(e).every(([r, c]) => !!letters[cellKey(r, c)]);

/** Cells that belong to solved entries; they cannot be edited. */
export function lockedCells(p: Puzzle, solved: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const e of p.entries) {
    if (solved.has(e.termId)) for (const [r, c] of entryCells(e)) out.add(cellKey(r, c));
  }
  return out;
}
