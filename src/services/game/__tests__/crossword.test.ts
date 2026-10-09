import { buildCrossword, toGrid, Entry, Puzzle, MIN_PLACED_FOR_GRID } from '../crossword';

const VOCAB = [
  'AUDIT', 'CONTROL', 'RISK', 'COBIT', 'ISACA', 'MATERIALITY', 'SAMPLING', 'EVIDENCE',
  'ASSURANCE', 'COMPLIANCE', 'GOVERNANCE', 'FIREWALL', 'ENCRYPTION', 'BACKUP', 'INTEGRITY',
  'PRIVACY', 'PASSWORD', 'TOKEN', 'LOGGING', 'INCIDENT', 'POLICY', 'VENDOR', 'PATCH',
  'ACCESS', 'IDENTITY', 'THREAT', 'MALWARE', 'SECURITY', 'NETWORK', 'SERVER',
];

/** Small deterministic PRNG so failures are reproducible. */
/* eslint-disable no-bitwise */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

const toEntries = (answers: string[]): Entry[] =>
  answers.map((a, i) => ({ termId: `t${i}`, answer: a, clue: `clue ${i}` }));

/** Every horizontal and vertical run of 2+ letters must be exactly one placed entry. */
function assertValid(p: Puzzle) {
  const g = toGrid(p);
  for (const e of p.entries) {
    const read =
      e.dir === 'A'
        ? g[e.r].slice(e.c, e.c + e.answer.length).join('')
        : g.slice(e.r, e.r + e.answer.length).map(row => row[e.c]).join('');
    expect(read).toBe(e.answer);
  }
  const starts = new Set(p.entries.map(e => `${e.dir}${e.r},${e.c},${e.answer.length}`));
  const runs = (dir: 'A' | 'D') => {
    const outer = dir === 'A' ? p.rows : p.cols;
    const inner = dir === 'A' ? p.cols : p.rows;
    for (let o = 0; o < outer; o++) {
      let start = -1;
      for (let i = 0; i <= inner; i++) {
        const ch = i < inner ? (dir === 'A' ? g[o][i] : g[i][o]) : null;
        if (ch && start < 0) start = i;
        if (!ch && start >= 0) {
          const len = i - start;
          if (len >= 2) {
            const [r, c] = dir === 'A' ? [o, start] : [start, o];
            expect(starts.has(`${dir}${r},${c},${len}`)).toBe(true);
          }
          start = -1;
        }
      }
    }
  };
  runs('A');
  runs('D');
}

describe('buildCrossword', () => {
  test('returns null for fewer than 2 usable words', () => {
    expect(buildCrossword([])).toBeNull();
    expect(buildCrossword(toEntries(['AUDIT']))).toBeNull();
    expect(buildCrossword(toEntries(['AB', 'X1Y']))).toBeNull();
  });

  test('builds valid grids and places 5+ words in at least 90% of 20 random sets', () => {
    const rand = mulberry32(42);
    let good = 0;
    for (let s = 0; s < 20; s++) {
      const picked = [...VOCAB].sort(() => rand() - 0.5).slice(0, 10);
      const p = buildCrossword(toEntries(picked), 10, 12, rand);
      expect(p).not.toBeNull();
      assertValid(p!);
      if (p!.entries.length >= MIN_PLACED_FOR_GRID) good++;
    }
    expect(good).toBeGreaterThanOrEqual(18);
  });

  test('numbers entries in reading order, sharing numbers on shared cells', () => {
    const p = buildCrossword(toEntries(['AUDIT', 'RISK', 'CONTROL', 'TOKEN']), 10, 12, mulberry32(1))!;
    const byCell = new Map<string, number>();
    for (const e of p.entries) {
      const k = `${e.r},${e.c}`;
      if (byCell.has(k)) expect(e.num).toBe(byCell.get(k));
      byCell.set(k, e.num!);
    }
    const order = [...p.entries].sort((a, b) => a.r - b.r || a.c - b.c).map(e => e.num!);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
