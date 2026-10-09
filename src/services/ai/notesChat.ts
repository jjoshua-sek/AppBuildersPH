import type { AiBridge, Msg } from '../../types';
import { searchNotes, type NoteHit } from '../rag/retrieve';
import { stripTurnMarkers, turnMarkerFilter } from './chatText';
import { notesChatSystem } from './prompts';

export const NO_NOTES =
  'There are no notes in this deck yet. Add a photo or file first, then ask me about it.';
const EXCERPT_CHARS = 900; // keeps the prompt inside a small on-device context

export type NotesChatResult = { reply: string; sources: NoteHit[] };

/**
 * Retrieval-augmented answer from one deck: finds the best passages for the
 * question, shows the model only those, and returns them as sources.
 */
export async function askNotes(
  bridge: AiBridge,
  question: string,
  docId: string,
  history: Msg[],
  onText: (s: string) => void,
  settings: { n_predict: number } = { n_predict: 160 },
): Promise<NotesChatResult> {
  const sources = await searchNotes(bridge, question, { docId, k: 3 });
  if (!sources.length) return { reply: NO_NOTES, sources };

  const excerpts = sources
    .map((s, i) => `[${i + 1}] ${s.text.slice(0, EXCERPT_CHARS)}`)
    .join('\n\n');
  let shown = '';
  const push = turnMarkerFilter(t => {
    shown += t;
    onText(shown);
  });
  const text = await bridge.complete({
    messages: [
      { role: 'system', content: notesChatSystem(excerpts) },
      ...history.slice(-4),
      { role: 'user', content: question },
    ],
    n_predict: settings.n_predict,
    temperature: 0.3,
    priority: 'high',
    onToken: push,
  });
  return { reply: stripTurnMarkers(text).trim(), sources };
}
