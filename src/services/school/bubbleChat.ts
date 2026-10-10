import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { bridge } from '../ai/llamaBridge';
import { answerFromNotes } from '../rag/answer';
import { searchNotes } from '../rag/retrieve';
import { deckStore } from '../../store/useDeckStore';
import { schoolAgent, type SchoolItem } from './agent';
import { answerSchool } from './assistant';

/**
 * Chat inside the floating bubble. The bubble is native Android UI, so each
 * question comes here as an event, is answered, and goes back with bubbleReply().
 *
 * Questions about deadlines and priorities are answered from the saved school
 * tasks (assistant.ts), so they work without the model and in airplane mode.
 * Anything else is a question about the student's notes and goes to the same
 * retrieval-and-answer path as "Ask my notes".
 */

export const NOTES_NOT_READY =
  'Open Backpack Tutor once so your notes and the tutor can load, then ask me again.';
export const NO_DECK = 'Add your notes in Backpack Tutor first, then ask me about them.';

export type BubbleDeps = {
  items(): Promise<SchoolItem[]>;
  notes(question: string): Promise<string>;
  now(): number;
};

async function answerFromDeck(question: string): Promise<string> {
  const docId = deckStore.getState().currentDocId;
  if (!docId) return NO_DECK;
  try {
    const hits = await searchNotes(bridge, question, { docId, k: 3 });
    if (!hits.length) return NO_DECK;
    const a = await answerFromNotes(bridge, question, hits);
    const parts = a.sources.map(s => s.idx + 1).join(', ');
    return a.sources.length ? `${a.text}\n\n(From your notes, part ${parts})` : a.text;
  } catch {
    // The database or the model is not loaded yet (the app was never opened).
    return NOTES_NOT_READY;
  }
}

const defaults: BubbleDeps = {
  items: async () => (await schoolAgent.getState()).items,
  notes: answerFromDeck,
  now: () => Date.now(),
};

export async function answerBubbleQuestion(
  text: string,
  deps: BubbleDeps = defaults,
): Promise<string> {
  const q = text.trim();
  if (!q) return 'Ask me about your deadlines, what to do first, or your notes.';
  const school = answerSchool(q, await deps.items().catch(() => []), deps.now());
  return school ?? deps.notes(q);
}

type BubbleNative = {
  bubbleReady(): void;
  bubbleReply(id: string, text: string): void;
};

/**
 * Starts listening for questions from the bubble. Call it once at app start
 * (index.js), so it also works when the bubble wakes the app with no screen open.
 */
export function startBubbleChat(): () => void {
  const native = NativeModules.SchoolAgent as BubbleNative | undefined;
  if (Platform.OS !== 'android' || !native?.bubbleReady) return () => {};
  // Native module events arrive on the device event bus on Android.
  const sub = DeviceEventEmitter.addListener(
    'BubbleChatQuestion',
    async (event: object) => {
      const e = event as { id: string; text: string };
      let reply: string;
      try {
        reply = await answerBubbleQuestion(e.text);
      } catch {
        reply = "Sorry, I couldn't answer that. Please try again.";
      }
      native.bubbleReply(e.id, reply);
    },
  );
  native.bubbleReady(); // anything asked before this point is delivered now
  return () => sub.remove();
}
