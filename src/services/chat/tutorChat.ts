import type { AiBridge } from '../../types';
import { answerFromNotes, type NotesAnswer } from '../rag/answer';
import { searchNotes } from '../rag/retrieve';

/** "quiz me", "give me a quiz", "test me", "pa-quiz": opens the quiz instead of answering. */
const QUIZ = /\b(quiz|pa-?quiz|test me|subukin ako)\b/i;
export const isQuizRequest = (text: string) => QUIZ.test(text);

export const NO_NOTES = 'There are no notes in this deck yet. Add a photo or file first.';

export type ChatReply =
  | { kind: 'quiz' }
  | { kind: 'no-notes'; text: string }
  | { kind: 'notes'; answer: NotesAnswer };

/**
 * One chat turn over one deck. Every answer comes from answerFromNotes(), so it
 * is grounded in the retrieved passages and checked against them.
 */
export async function replyToChat(
  bridge: AiBridge,
  docId: string,
  question: string,
  onText: (text: string) => void,
): Promise<ChatReply> {
  if (isQuizRequest(question)) return { kind: 'quiz' };
  const hits = await searchNotes(bridge, question, { docId, k: 3 });
  if (!hits.length) return { kind: 'no-notes', text: NO_NOTES };
  const answer = await answerFromNotes(bridge, question, hits, { onText });
  return { kind: 'notes', answer };
}
