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

export function fallbackHint(term: Pick<TermRow, 'answer' | 'clue'>, masked: string) {
  const sentence = masked.split(/(?<=[.!?])\s+/).find(s => s.includes(MASK));
  return (
    `Here's a nudge: it starts with "${term.answer[0]}" and has ${term.answer.length} letters.` +
    (sentence ? ` Your notes say: "${sentence.trim()}"` : ` Re-read the clue: ${term.clue}`)
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
  const messages: Msg[] = [
    { role: 'system', content: tutorSystem(term.clue, masked) },
    ...history.slice(-4),
    { role: 'user', content: studentMsg },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    ui.setStatus(attempt ? 'Let me rephrase that…' : 'Thinking…');
    const guard = new StreamGuard(term.term, ui.setText);
    const text = await bridge.complete({
      messages,
      n_predict: settings.n_predict,
      temperature: attempt ? 0.3 : 0.7,
      priority: 'high',
      onToken: t => {
        guard.push(t);
        if (guard.leaked) bridge.stopGeneration();
      },
    });
    if (!guard.leaked && !leaks(text, term.term)) {
      ui.setText(text);
      ui.setStatus('');
      return text;
    }
    ui.setText('');
  }

  const fb = fallbackHint(term, masked);
  ui.setText(fb);
  ui.setStatus('');
  return fb;
}
