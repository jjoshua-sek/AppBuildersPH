/**
 * Reads JSON written by a small on-device model, which sometimes:
 * - wraps it in a ```json code fence or adds a sentence before/after it, or
 * - stops mid-object when it hits the token limit.
 */

/** The outermost {...} in the text, with code fences and surrounding prose removed. */
export function parseJsonObject(raw: string): any | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

const STR = '"((?:[^"\\\\]|\\\\.)*)"';
const PAIR = new RegExp(`\\{\\s*"term"\\s*:\\s*${STR}\\s*,\\s*"clue"\\s*:\\s*${STR}\\s*\\}`, 'g');

const unescape = (s: string) => {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
};

/**
 * Every complete {"term": ..., "clue": ...} object in the text. Recovers the
 * finished terms when the model was cut off before closing the JSON.
 */
export function salvageTermObjects(raw: string): { term: string; clue: string }[] {
  return [...raw.matchAll(PAIR)].map(m => ({ term: unescape(m[1]), clue: unescape(m[2]) }));
}
