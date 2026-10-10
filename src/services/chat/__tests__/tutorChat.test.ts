import { createMockBridge } from '../../ai/mockBridge';
import * as retrieve from '../../rag/retrieve';
import * as answer from '../../rag/answer';
import { isQuizRequest, replyToChat, NO_NOTES } from '../tutorChat';

const hit = (text: string): retrieve.NoteHit => ({
  chunkId: 'c',
  docId: 'd',
  idx: 0,
  text,
  snippet: text,
  score: 1,
  keyword: true,
});

afterEach(() => jest.restoreAllMocks());

test('recognises quiz requests', () => {
  for (const q of ['quiz', 'Quiz me on this', 'can you test me?', 'pa-quiz po'])
    expect(isQuizRequest(q)).toBe(true);
  expect(isQuizRequest('What is COBIT?')).toBe(false);
});

test('quiz opens the quiz without searching or calling the model', async () => {
  const search = jest.spyOn(retrieve, 'searchNotes');
  const bridge = createMockBridge();
  const spy = jest.spyOn(bridge, 'complete');
  expect(await replyToChat(bridge, 'd', 'quiz me', () => {})).toEqual({ kind: 'quiz' });
  expect(search).not.toHaveBeenCalled();
  expect(spy).not.toHaveBeenCalled();
});

test('questions are answered through answerFromNotes with the retrieved passages', async () => {
  const hits = [hit('COBIT is a framework for IT governance.')];
  jest.spyOn(retrieve, 'searchNotes').mockResolvedValue(hits);
  const spy = jest.spyOn(answer, 'answerFromNotes').mockResolvedValue({
    kind: 'answer',
    text: 'COBIT is an IT governance framework.',
    sources: hits,
  });
  const r = await replyToChat(createMockBridge(), 'd', 'What is COBIT?', () => {});
  expect(spy.mock.calls[0][2]).toBe(hits);
  expect(r).toMatchObject({
    kind: 'notes',
    answer: { kind: 'answer', text: 'COBIT is an IT governance framework.' },
  });
});

test('a question the notes do not cover keeps answerFromNotes\' not-in-notes result', async () => {
  jest.spyOn(retrieve, 'searchNotes').mockResolvedValue([hit('Audits check records.')]);
  jest.spyOn(answer, 'answerFromNotes').mockResolvedValue({
    kind: 'not-in-notes',
    text: "Your notes don't seem to cover that.",
    sources: [],
  });
  const r = await replyToChat(createMockBridge(), 'd', 'Who won the 1998 World Cup?', () => {});
  expect(r).toMatchObject({
    kind: 'notes',
    answer: { kind: 'not-in-notes', text: expect.stringContaining("don't seem") },
  });
});

test('an empty deck says so and makes no model call', async () => {
  jest.spyOn(retrieve, 'searchNotes').mockResolvedValue([]);
  const spy = jest.spyOn(answer, 'answerFromNotes');
  expect(await replyToChat(createMockBridge(), 'd', 'hello', () => {})).toEqual({
    kind: 'no-notes',
    text: NO_NOTES,
  });
  expect(spy).not.toHaveBeenCalled();
});
