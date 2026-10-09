import { createMockBridge } from '../mockBridge';
import { askNotes, NO_NOTES } from '../notesChat';
import * as rag from '../../rag/retrieve';

const hit = (text: string): rag.NoteHit => ({
  chunkId: 'c1',
  docId: 'd1',
  idx: 0,
  text,
  snippet: text,
  score: 1,
  keyword: true,
});

afterEach(() => jest.restoreAllMocks());

test('answers from the retrieved passages and returns them as sources', async () => {
  jest.spyOn(rag, 'searchNotes').mockResolvedValue([hit('COBIT governs IT.')]);
  const bridge = createMockBridge();
  const spy = jest.spyOn(bridge, 'complete');
  const out = await askNotes(bridge, 'What is COBIT?', 'd1', [], () => {});
  const sys = spy.mock.calls[0][0].messages[0].content;
  expect(sys).toContain('[1] COBIT governs IT.');
  expect(out.sources).toHaveLength(1);
  expect(out.reply.length).toBeGreaterThan(0);
});

test('an empty deck gets a message and no model call', async () => {
  jest.spyOn(rag, 'searchNotes').mockResolvedValue([]);
  const bridge = createMockBridge();
  const spy = jest.spyOn(bridge, 'complete');
  const out = await askNotes(bridge, 'hi', 'd1', [], () => {});
  expect(out.reply).toBe(NO_NOTES);
  expect(spy).not.toHaveBeenCalled();
});

test('strips turn markers and keeps recent history', async () => {
  jest.spyOn(rag, 'searchNotes').mockResolvedValue([hit('x')]);
  const bridge = createMockBridge();
  bridge.complete = jest.fn(async () => '<start_of_turn>model Hello<end_of_turn>');
  const out = await askNotes(
    bridge,
    'q',
    'd1',
    [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ],
    () => {},
  );
  expect(out.reply).toBe('Hello');
  const roles = (bridge.complete as jest.Mock).mock.calls[0][0].messages.map(
    (m: { role: string }) => m.role,
  );
  expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
});
