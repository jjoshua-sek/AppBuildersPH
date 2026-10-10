import type { Placed, Puzzle } from '../crossword';
import {
  backspace,
  cellKey,
  clueOrder,
  entriesAt,
  entryFor,
  flipDirection,
  isFull,
  lockedCells,
  startOf,
  stepClue,
  tapCell,
  typedWord,
  typeLetter,
  type Cursor,
  type Letters,
} from '../crosswordPlay';

/*
 *   0 1 2 3
 * 0 C A T .      1-Across CAT, 1-Down COW
 * 1 O . . .      2-Down TEN starts at (0,2)
 * 2 W . . .
 */
const e = (p: Partial<Placed> & Pick<Placed, 'termId' | 'answer' | 'r' | 'c' | 'dir'>): Placed => ({
  clue: `clue ${p.termId}`,
  ...p,
});
const puzzle: Puzzle = {
  rows: 3,
  cols: 3,
  entries: [
    e({ termId: 'cat', answer: 'CAT', r: 0, c: 0, dir: 'A', num: 1 }),
    e({ termId: 'cow', answer: 'COW', r: 0, c: 0, dir: 'D', num: 1 }),
    e({ termId: 'ten', answer: 'TEN', r: 0, c: 2, dir: 'D', num: 2 }),
  ],
};
const NONE = new Set<string>();
const at = (r: number, c: number, dir: 'A' | 'D'): Cursor => ({ r, c, dir });

describe('finding words', () => {
  it('finds the words through a cell and the one in the cursor direction', () => {
    expect(entriesAt(puzzle, 0, 0).map(x => x.termId)).toEqual(['cat', 'cow']);
    expect(entryFor(puzzle, at(0, 0, 'D'))?.termId).toBe('cow');
    expect(entryFor(puzzle, at(0, 1, 'D'))).toBeUndefined();
    expect(entryFor(puzzle, null)).toBeUndefined();
  });

  it('orders clues Across first, then Down, by number', () => {
    expect(clueOrder(puzzle).map(x => x.termId)).toEqual(['cat', 'cow', 'ten']);
  });
});

describe('tapping cells', () => {
  it('selects a cell and keeps the direction when a word runs that way', () => {
    expect(tapCell(puzzle, at(0, 0, 'D'), 0, 2)).toEqual(at(0, 2, 'D'));
    expect(tapCell(puzzle, at(0, 0, 'A'), 0, 1)).toEqual(at(0, 1, 'A'));
  });

  it('switches to the only direction available', () => {
    expect(tapCell(puzzle, at(0, 0, 'A'), 1, 0)).toEqual(at(1, 0, 'D'));
  });

  it('tapping the selected cell flips Across/Down, but only where both exist', () => {
    expect(tapCell(puzzle, at(0, 0, 'A'), 0, 0)).toEqual(at(0, 0, 'D'));
    expect(tapCell(puzzle, at(0, 0, 'D'), 0, 0)).toEqual(at(0, 0, 'A'));
    expect(tapCell(puzzle, at(0, 1, 'A'), 0, 1)).toEqual(at(0, 1, 'A'));
  });

  it('ignores a black cell', () => {
    const cur = at(0, 0, 'A');
    expect(tapCell(puzzle, cur, 1, 1)).toBe(cur);
  });

  it('flips from the clue bar', () => {
    expect(flipDirection(puzzle, at(0, 0, 'A'))).toEqual(at(0, 0, 'D'));
    expect(flipDirection(puzzle, at(0, 1, 'A'))).toEqual(at(0, 1, 'A'));
  });
});

describe('typing', () => {
  it('puts the letter in the cell and moves to the next one', () => {
    const r = typeLetter(puzzle, {}, NONE, at(0, 0, 'A'), 'c');
    expect(r.letters).toEqual({ [cellKey(0, 0)]: 'C' });
    expect(r.cur).toEqual(at(0, 1, 'A'));
  });

  it('skips cells that already have a letter', () => {
    const letters: Letters = { [cellKey(0, 1)]: 'A' };
    expect(typeLetter(puzzle, letters, NONE, at(0, 0, 'A'), 'C').cur).toEqual(at(0, 2, 'A'));
  });

  it('stays on the last cell at the end of the word', () => {
    const r = typeLetter(puzzle, { [cellKey(0, 0)]: 'C', [cellKey(0, 1)]: 'A' }, NONE, at(0, 2, 'A'), 'T');
    expect(r.cur).toEqual(at(0, 2, 'A'));
    expect(typedWord(r.letters, puzzle.entries[0])).toBe('CAT');
  });

  it('overwrites a letter in an unlocked cell', () => {
    const r = typeLetter(puzzle, { [cellKey(0, 0)]: 'X' }, NONE, at(0, 0, 'A'), 'C');
    expect(r.letters[cellKey(0, 0)]).toBe('C');
  });

  it('never changes a locked cell, and moves past it', () => {
    const locked = new Set([cellKey(0, 0)]);
    const r = typeLetter(puzzle, { [cellKey(0, 0)]: 'C' }, locked, at(0, 0, 'A'), 'Z');
    expect(r.letters[cellKey(0, 0)]).toBe('C');
    expect(r.cur).toEqual(at(0, 1, 'A'));
  });

  it('a letter at a crossing shows in both words', () => {
    const r = typeLetter(puzzle, {}, NONE, at(0, 0, 'D'), 'C');
    expect(typedWord(r.letters, puzzle.entries[0])).toBe('C');
    expect(typedWord(r.letters, puzzle.entries[1])).toBe('C');
  });
});

describe('backspace', () => {
  it('clears the current letter first', () => {
    const r = backspace(puzzle, { [cellKey(0, 1)]: 'A' }, NONE, at(0, 1, 'A'));
    expect(r.letters).toEqual({});
    expect(r.cur).toEqual(at(0, 1, 'A'));
  });

  it('on an empty cell, steps back and clears the previous letter', () => {
    const r = backspace(puzzle, { [cellKey(0, 0)]: 'C' }, NONE, at(0, 1, 'A'));
    expect(r.letters).toEqual({});
    expect(r.cur).toEqual(at(0, 0, 'A'));
  });

  it('does nothing at the start of an empty word', () => {
    const r = backspace(puzzle, {}, NONE, at(0, 0, 'A'));
    expect(r.cur).toEqual(at(0, 0, 'A'));
  });

  it('does not erase a locked letter, but steps over it', () => {
    const locked = new Set([cellKey(0, 0)]);
    const r = backspace(puzzle, { [cellKey(0, 0)]: 'C' }, locked, at(0, 1, 'A'));
    expect(r.letters[cellKey(0, 0)]).toBe('C');
    expect(r.cur).toEqual(at(0, 0, 'A'));
  });
});

describe('words and clues', () => {
  it('knows when a word is full and what was typed', () => {
    const letters: Letters = { [cellKey(0, 0)]: 'C', [cellKey(0, 1)]: 'A' };
    expect(isFull(letters, puzzle.entries[0])).toBe(false);
    expect(typedWord(letters, puzzle.entries[0])).toBe('CA');
    expect(isFull({ ...letters, [cellKey(0, 2)]: 'T' }, puzzle.entries[0])).toBe(true);
  });

  it('starts a clue at its first empty cell', () => {
    expect(startOf(puzzle.entries[0], {})).toEqual(at(0, 0, 'A'));
    expect(startOf(puzzle.entries[0], { [cellKey(0, 0)]: 'C' })).toEqual(at(0, 1, 'A'));
  });

  it('steps to the next and previous clue, wrapping around', () => {
    expect(stepClue(puzzle, at(0, 1, 'A'), {}, 1)).toEqual(at(0, 0, 'D'));
    expect(stepClue(puzzle, at(0, 0, 'D'), {}, 1)).toEqual(at(0, 2, 'D'));
    expect(stepClue(puzzle, at(0, 2, 'D'), {}, 1)).toEqual(at(0, 0, 'A'));
    expect(stepClue(puzzle, at(0, 0, 'A'), {}, -1)).toEqual(at(0, 2, 'D'));
  });

  it('locks the cells of solved words', () => {
    const l = lockedCells(puzzle, new Set(['cow']));
    expect([...l].sort()).toEqual([cellKey(0, 0), cellKey(1, 0), cellKey(2, 0)].sort());
  });
});
