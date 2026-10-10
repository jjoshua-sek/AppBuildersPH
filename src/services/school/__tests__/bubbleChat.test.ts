import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import type { SchoolItem } from '../agent';
import {
  answerBubbleQuestion,
  startBubbleChat,
  type BubbleDeps,
} from '../bubbleChat';

jest.mock('../agent', () => ({
  schoolAgent: {
    getState: jest.fn(async () => ({
      items: [
        {
          id: 'e',
          kind: 'assignment',
          title: 'Essay',
          body: '',
          course: 'English',
          due: new Date(2026, 9, 1).getTime(),
          url: '',
          done: false,
          remote: true,
          modified: '',
        },
      ],
    })),
  },
}));

const NOW = new Date(2026, 9, 14, 10, 0).getTime();
const item = (title: string, due: number | null): SchoolItem => ({
  id: title,
  kind: 'assignment',
  title,
  body: '',
  course: 'Math',
  due,
  url: '',
  done: false,
  remote: true,
  modified: '',
});

const deps = (over: Partial<BubbleDeps> = {}): BubbleDeps => ({
  items: async () => [item('Lab report', new Date(2026, 9, 12, 17).getTime())],
  notes: jest.fn(async () => 'from the notes'),
  now: () => NOW,
  ...over,
});

describe('answerBubbleQuestion', () => {
  it('answers a deadline question from the saved tasks, without the notes path', async () => {
    const d = deps();
    const a = await answerBubbleQuestion('what deadlines have we missed?', d);
    expect(a).toContain('Lab report');
    expect(a).toContain('2 days ago');
    expect(d.notes).not.toHaveBeenCalled();
  });

  it('answers a priority question', async () => {
    expect(await answerBubbleQuestion('what should I prioritize?', deps())).toContain(
      'Start with "Lab report"',
    );
  });

  it('sends a study question to the notes', async () => {
    const d = deps();
    expect(await answerBubbleQuestion('What is COBIT used for?', d)).toBe('from the notes');
    expect(d.notes).toHaveBeenCalledWith('What is COBIT used for?');
  });

  it('still answers study questions if the task list cannot be read', async () => {
    const d = deps({ items: () => Promise.reject(new Error('no native module')) });
    expect(await answerBubbleQuestion('What is COBIT used for?', d)).toBe('from the notes');
  });

  it('an empty message gets a prompt, not an error', async () => {
    expect(await answerBubbleQuestion('   ', deps())).toContain('Ask me about');
  });
});

describe('startBubbleChat', () => {
  const native = {
    bubbleReady: jest.fn(),
    bubbleReply: jest.fn(),
  };
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    Object.values(native).forEach(f => f.mockClear());
    (NativeModules as Record<string, unknown>).SchoolAgent = native;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete (NativeModules as Record<string, unknown>).SchoolAgent;
  });

  it('does nothing when the native module is missing', () => {
    delete (NativeModules as Record<string, unknown>).SchoolAgent;
    expect(() => startBubbleChat()()).not.toThrow();
  });

  it('tells native it is ready, and replies to each question with its id', async () => {
    const stop = startBubbleChat();
    expect(native.bubbleReady).toHaveBeenCalledTimes(1);
    DeviceEventEmitter.emit('BubbleChatQuestion', { id: 'q1', text: 'what did I miss?' });
    await new Promise(r => setTimeout(r, 20));
    expect(native.bubbleReply).toHaveBeenCalledTimes(1);
    const [id, text] = native.bubbleReply.mock.calls[0];
    expect(id).toBe('q1');
    expect(text).toContain('Essay');
    stop();
  });
});
