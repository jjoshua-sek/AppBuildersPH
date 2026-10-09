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

export function leaks(text: string, term: string): boolean {
  return termPatterns(term).some(p => {
    p.lastIndex = 0;
    return p.test(text);
  });
}

export const MASK = '_____';

export function maskTerm(passage: string, term: string): string {
  return termPatterns(term).reduce((out, p) => out.replace(p, MASK), passage);
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
