/**
 * Detects and masks the hidden answer so the tutor can never show it.
 *
 * Matching rules (all case-insensitive):
 * - Whole-word start: the term must begin at a word boundary, so "ROI" does not
 *   match "heroic" and "risk" does not match "brisk". Suffixes are allowed for
 *   terms of 4+ letters ("audit" also catches "auditor", "audits").
 * - Terms of 3 letters or fewer must match as a whole word (plural "s" allowed),
 *   so "IAM" does not match "iambic".
 * - Multi-word terms match with spaces, hyphens or nothing between the words
 *   ("access control", "access-control", "accesscontrol").
 * - Spelled-out answers are caught: "A-U-D-I-T", "a u d i t", "a. u. d. i. t".
 * - Single-word terms of 7+ letters also match on their stem, so
 *   "authentication" catches "authenticate".
 * - OCR typos: words of 6+ letters match with one wrong/missing/extra letter
 *   (10+ letters: two), so "thylakoid" matches the photo's "thylakolds".
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsOf = (term: string) => term.toLowerCase().match(/[a-z]+/g) ?? [];

export const stemOf = (word: string) =>
  word.length >= 7 ? word.slice(0, Math.max(6, Math.ceil(word.length * 0.75))) : word;

/** The patterns that count as the term appearing in a text. */
export function termPatterns(term: string): RegExp[] {
  const words = wordsOf(term);
  const letters = words.join('');
  if (!letters) return [];

  const joined = words.map(escape).join('[\\s\\-]*');
  const tail = letters.length <= 3 ? 's?(?![a-z])' : '[a-z]*';
  const patterns = [new RegExp(`(?<![a-z])${joined}${tail}`, 'gi')];

  if (words.length === 1 && letters.length >= 7) {
    patterns.push(new RegExp(`(?<![a-z])${escape(stemOf(letters))}[a-z]*`, 'gi'));
  }
  if (letters.length >= 3) {
    const spelled = letters.split('').join('[^a-z0-9]+');
    patterns.push(new RegExp(`(?<![a-z])${spelled}(?![a-z])`, 'gi'));
  }
  return patterns;
}

/** Edit distance, stopping early once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for a term word: none under 6 letters (so "audit" ≠ "audio"). */
const typoBudget = (w: string) => (w.length >= 10 ? 2 : w.length >= 6 ? 1 : 0);

/** A text word matches a term word exactly, with a suffix, or within the typo budget. */
function wordMatches(token: string, w: string): boolean {
  if (token === w || (w.length >= 4 && token.startsWith(w))) return true;
  const k = typoBudget(w);
  if (!k) return false;
  // Compare whole words and also the word's start, so "thylakolds" (plural + typo) matches "thylakoid".
  return editDistance(w, token, k) <= k || editDistance(w, token.slice(0, w.length), k) <= k;
}

/** Character ranges where the term appears with OCR-style typos. */
export function fuzzySpans(text: string, term: string): [number, number][] {
  const words = wordsOf(term);
  if (!words.length || !words.some(w => typoBudget(w) > 0)) return [];
  const tokens = [...text.matchAll(/[a-z]+/gi)].map(m => ({
    w: m[0].toLowerCase(),
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  const spans: [number, number][] = [];
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (words.every((w, j) => wordMatches(tokens[i + j].w, w))) {
      spans.push([tokens[i].start, tokens[i + words.length - 1].end]);
      i += words.length - 1;
    }
  }
  return spans;
}

export function leaks(text: string, term: string): boolean {
  return (
    termPatterns(term).some(p => {
      p.lastIndex = 0;
      return p.test(text);
    }) || fuzzySpans(text, term).length > 0
  );
}

export const MASK = '_____';

export function maskTerm(passage: string, term: string): string {
  const exact = termPatterns(term).reduce((out, p) => out.replace(p, MASK), passage);
  // Then the OCR-typo forms, right to left so earlier ranges stay valid.
  return fuzzySpans(exact, term)
    .reverse()
    .reduce((out, [a, b]) => out.slice(0, a) + MASK + out.slice(b), exact);
}

/**
 * Shows streamed text only once it is `holdback` characters behind the stream,
 * so a leak is caught before any part of it renders.
 */
export class StreamGuard {
  private raw = '';
  private shown = 0;
  leaked = false;

  constructor(
    private term: string,
    private emit: (visible: string) => void,
    private holdback = Math.max(24, term.length * 3),
  ) {}

  push(token: string) {
    if (this.leaked) return;
    this.raw += token;
    if (leaks(this.raw, this.term)) {
      this.leaked = true;
      return;
    }
    const end = this.raw.length - this.holdback;
    if (end > this.shown) {
      this.shown = end;
      this.emit(this.raw.slice(0, end));
    }
  }

  get text() {
    return this.raw;
  }
}
