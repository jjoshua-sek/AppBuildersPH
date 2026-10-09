import type { AiBridge, Msg } from '../../types';
import { keywords, type NoteHit } from './retrieve';

/**
 * "Ask my notes", second step: the on-device LLM writes a short answer from the
 * passages searchNotes() found, and says which passage it used.
 *
 * Small models drift into outside knowledge, so the answer is checked against
 * the passages (most of its content words must appear in them). It must also be
 * about the question: when the question's distinctive words (e.g. "COBIT") are
 * in the passages, the answer has to use one of them. An answer that fails gets
 * one retry; after that the student sees the passage that best fits instead.
 */

const NOT_IN_NOTES = 'NOT_IN_NOTES';
/** Share of the answer's content words that must appear in the passages. */
export const MIN_SUPPORT = 0.6;
const MAX_PASSAGES = 2;

export const answerSystem = (passages: string[]) =>
  `You answer a student's question using only their class notes below.
Rules:
- Use only facts from the notes. Do not add outside knowledge.
- Answer in 1 to 3 short sentences, in plain words.
- End with the number of the note you used, like [1].
- If the notes do not answer the question, reply exactly: ${NOT_IN_NOTES}

Notes:
${passages.map((p, i) => `[${i + 1}] ${p}`).join('\n')}`;

export type NotesAnswer = {
  kind: 'answer' | 'not-in-notes' | 'fallback';
  text: string;
  sources: NoteHit[]; // the passages the text comes from
};

const stripCitations = (s: string) =>
  s
    .replace(/\s*\[\d+\]/g, '')
    .replace(/\s+([.,;!?])/g, '$1')
    .trim();

/** True when the text contains the word or a form of it (prefix match tolerates plurals). */
const mentions = (text: string, word: string) =>
  text.toLowerCase().includes(word.slice(0, Math.max(4, word.length - 2)));

/** Share of the text's content words found in the passages. */
export function support(text: string, passages: string[]): number {
  const words = keywords(stripCitations(text)).filter(w => w.length >= 4);
  if (!words.length) return 1;
  const notes = passages.join(' ');
  return words.filter(w => mentions(notes, w)).length / words.length;
}

// Question words that say what is asked, not what it is about.
const GENERIC = new Set(
  'used use uses mean means meaning define definition describe explain example examples purpose role function important called work works must give tell list'.split(
    ' ',
  ),
);

/**
 * The question's distinctive words that appear in the passages, e.g. ["cobit"]
 * for "What is COBIT used for?". Empty when the passages share none of them.
 */
export function focusWords(question: string, passages: string[]): string[] {
  const notes = passages.join(' ');
  return keywords(question).filter(
    w => w.length >= 3 && !GENERIC.has(w) && mentions(notes, w),
  );
}

/** True when the answer is about the question: it uses at least one focus word. */
export const onTopic = (text: string, focus: string[]) =>
  !focus.length || focus.some(w => mentions(text, w));

/** The passages the answer cites as [n]; the top passage when it cites none. */
function cited(text: string, used: NoteHit[]): NoteHit[] {
  const ns = [...text.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]) - 1);
  const hits = [...new Set(ns)]
    .filter(i => i >= 0 && i < used.length)
    .map(i => used[i]);
  return hits.length ? hits : used.slice(0, 1);
}

export async function answerFromNotes(
  bridge: AiBridge,
  question: string,
  hits: NoteHit[],
  opts: { n_predict?: number; onText?: (text: string) => void } = {},
): Promise<NotesAnswer> {
  const { n_predict = 120, onText = () => {} } = opts;
  if (!hits.length) {
    return {
      kind: 'not-in-notes',
      text: 'Nothing in your notes yet.',
      sources: [],
    };
  }
  const used = hits.slice(0, MAX_PASSAGES);
  const passages = used.map(h => h.text);
  const focus = focusWords(question, passages);
  const messages: Msg[] = [
    { role: 'system', content: answerSystem(passages) },
    { role: 'user', content: question.trim() },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    let streamed = '';
    const raw = await bridge.complete({
      messages,
      n_predict,
      temperature: attempt ? 0.1 : 0.3,
      priority: 'high', // the student is waiting; background cards can wait
      onToken: t => {
        streamed += t;
        if (
          !NOT_IN_NOTES.startsWith(
            streamed.trim().slice(0, NOT_IN_NOTES.length),
          )
        ) {
          onText(stripCitations(streamed));
        }
      },
    });
    // The notes do mention what was asked, so "not in notes" is wrong: retry, then quote them.
    if (raw.includes(NOT_IN_NOTES) && focus.length) {
      onText('');
      continue;
    }
    if (raw.includes(NOT_IN_NOTES)) {
      const text =
        "Your notes don't seem to cover that. This is the closest part:";
      onText(text);
      return { kind: 'not-in-notes', text, sources: used.slice(0, 1) };
    }
    const text = stripCitations(raw);
    if (text && support(raw, passages) >= MIN_SUPPORT && onTopic(text, focus)) {
      onText(text);
      return { kind: 'answer', text, sources: cited(raw, used) };
    }
    onText('');
  }

  // Quote the passage that mentions what was asked, not just the top one.
  const best = used.find(h => onTopic(h.text, focus)) ?? used[0];
  const text = `Your notes say: "${best.snippet}"`;
  onText(text);
  return { kind: 'fallback', text, sources: [best] };
}
