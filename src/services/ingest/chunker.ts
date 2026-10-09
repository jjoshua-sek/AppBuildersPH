/** Splits text into overlapping word windows. */
export function chunk(text: string, target = 180, overlap = 30): string[] {
  if (target <= 0 || overlap < 0 || overlap >= target) {
    throw new Error(`Bad chunk settings: target=${target}, overlap=${overlap}`);
  }
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const out: string[] = [];
  for (let i = 0; ; i += target - overlap) {
    out.push(words.slice(i, i + target).join(' '));
    if (i + target >= words.length) break;
  }
  return out;
}

/** Cleans common OCR noise from phone photos of printed pages. */
export const cleanOcr = (s: string) =>
  s
    .replace(/-\n(?=[a-z])/g, '') // re-join words hyphenated across lines
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
