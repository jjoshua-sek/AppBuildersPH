import type { AiBridge, Msg, TermRow } from '../../types';
import { leaks, maskTerm, MASK, StreamGuard } from './leakGuard';
import { tutorSystem } from './prompts';

export type TutorUI = {
  setText(s: string): void;
  setStatus(s: string): void;
  onSolved(): void;
};

/**
 * True when the student's message contains the answer as a run of whole words,
 * e.g. "is it access control?" for ACCESSCONTROL. "heroic" does not solve ROI.
 */
export function messageSolves(msg: string, answer: string): boolean {
  const words = msg.toUpperCase().match(/[A-Z]+/g) ?? [];
  for (let i = 0; i < words.length; i++) {
    let joined = '';
    for (let j = i; j < words.length && joined.length < answer.length; j++) {
      joined += words[j];
      if (joined === answer) return true;
    }
  }
  return false;
}

// Words that make a message a question or request rather than a guess.
const NOT_A_GUESS =
  /\b(what|why|how|who|where|when|which|hint|help|stuck|explain|tell|give|clue|mean|ano|paano|bakit|sino|saan|tulong|pahint|hindi|alam|ok|okay|thanks|thank|salamat|yes|no|oo|sige|hi|hello)\b/i;
// Filler around a guess: "is it ATP?", "ATP ba?", "ATP yata po".
const FILLER = new Set([
  'IS',
  'IT',
  'BA',
  'YATA',
  'PO',
  'MAYBE',
  'SIGURO',
  'KAYA',
  'ITO',
  'THE',
  'A',
  'AN',
  'OR',
]);

/**
 * The student's guess, when the message is a short guess ("ATP?", "is it NADH")
 * that isn't the answer. The model never sees the answer, so the app tells it
 * the guess is wrong; otherwise it may praise a wrong guess.
 */
export function wrongGuess(msg: string, answer: string): string | null {
  if (NOT_A_GUESS.test(msg.replace(/-/g, ''))) return null;
  const words = (msg.toUpperCase().match(/[A-Z]+/g) ?? []).filter(
    w => !FILLER.has(w),
  );
  if (words.length < 1 || words.length > 3) return null;
  if (messageSolves(msg, answer)) return null;
  return words.join(' ');
}

// A reply that presents something as "the answer" (even a wrong one) reads as giving it away.
const ANSWER_CLAIM =
  /\b(?:the|correct|right|final)\s+answer\s+is\b|\banswer\s*\**\s*:|\bsagot\s*(?:ay\b|:)/i;
export const claimsAnswer = (text: string) => ANSWER_CLAIM.test(text);

/** Small models add markdown; the chat shows plain text. */
export const plainText = (text: string) =>
  text
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/^\s*[*-]\s+/gm, '')
    .replace(/\*/g, '');

export function fallbackHint(
  term: Pick<TermRow, 'answer' | 'clue'>,
  masked: string,
) {
  const sentence = masked.split(/(?<=[.!?])\s+/).find(s => s.includes(MASK));
  return (
    `Here's a nudge: it starts with "${term.answer[0]}" and has ${term.answer.length} letters.` +
    (sentence
      ? ` Your notes say: "${sentence.trim()}"`
      : ` Re-read the clue: ${term.clue}`)
  );
}

export type TutorSettings = { n_predict: number };

/**
 * Three layers keep the answer hidden:
 * 0. If the student typed the answer, the game marks it solved; no model call.
 * 1. The model only sees the passage with the term masked.
 * 2. StreamGuard holds text back and stops generation on a leak.
 * 3. One retry, then a template hint.
 */
export async function askTutor(
  bridge: AiBridge,
  term: TermRow,
  passage: string,
  studentMsg: string,
  history: Msg[],
  ui: TutorUI,
  settings: TutorSettings = { n_predict: 90 },
): Promise<string | null> {
  if (messageSolves(studentMsg, term.answer)) {
    ui.onSolved();
    return null;
  }

  const masked = maskTerm(passage, term.term);
  const guess = wrongGuess(studentMsg, term.answer);
  const messages: Msg[] = [
    {
      role: 'system',
      content: tutorSystem(term.clue, masked, guess ?? undefined),
    },
    ...history.slice(-4),
    { role: 'user', content: studentMsg },
  ];
  const show = (s: string) => ui.setText(plainText(s));

  for (let attempt = 0; attempt < 2; attempt++) {
    ui.setStatus(attempt ? 'Let me rephrase that…' : 'Thinking…');
    const guard = new StreamGuard(term.term, show);
    let raw = '';
    let claimed = false;
    const text = await bridge.complete({
      messages,
      n_predict: settings.n_predict,
      temperature: attempt ? 0.3 : 0.7,
      priority: 'high',
      onToken: t => {
        if (claimed || guard.leaked) return;
        raw += t;
        if (claimsAnswer(raw)) {
          claimed = true;
          bridge.stopGeneration();
          return;
        }
        guard.push(t);
        if (guard.leaked) bridge.stopGeneration();
      },
    });
    const reply = plainText(text).trim();
    if (
      reply &&
      !claimed &&
      !claimsAnswer(text) &&
      !guard.leaked &&
      !leaks(text, term.term)
    ) {
      ui.setText(reply);
      ui.setStatus('');
      return reply;
    }
    ui.setText('');
  }

  const fb =
    (guess ? `Not quite, "${guess}" isn't it. ` : '') +
    fallbackHint(term, masked);
  ui.setText(fb);
  ui.setStatus('');
  return fb;
}
