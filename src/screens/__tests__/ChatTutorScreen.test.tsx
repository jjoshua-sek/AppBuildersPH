import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SAMPLE_TEXT } from '../../assets/sample';
import { createMockBridge } from '../../services/ai/mockBridge';
import { connect } from '../../services/db/client';
import { memoryDb } from '../../services/db/testing/memoryDb';
import { PROFILES } from '../../services/device/deviceProfile';
import type { AiBridge } from '../../types';
import { deckStore, startIngest } from '../../store/useDeckStore';
import { ChatTutorScreen } from '../ChatTutorScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const { act } = ReactTestRenderer;
let root: ReactTestRenderer.ReactTestRenderer;
const byId = (id: string): ReactTestInstance =>
  root.root.findAll(n => n.props.testID === id)[0];
const texts = () =>
  root.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => [n.props.children].flat().join(''));
const aiBubbles = () =>
  root.root
    .findAll(n => n.props.testID === 'bubble-ai')
    .map(n =>
      n
        .findAll(c => (c.type as unknown) === 'Text')
        .map(t => [t.props.children].flat().join(''))
        .join(' '),
    );

/** Answers with the first sentence of note [1] (cited), or NOT_IN_NOTES when told to. */
function bridgeFor(reply?: string): AiBridge {
  const mock = createMockBridge();
  return {
    ...mock,
    async complete(o) {
      const text =
        reply ?? `${o.messages[0].content.match(/\[1\] ([^.]*\.)/)![1]} [1]`;
      for (const t of text.match(/\S+\s*/g) ?? []) o.onToken?.(t);
      return text;
    },
  };
}

async function setup(bridge: AiBridge) {
  await startIngest(bridge, PROFILES['android-cpu'], {
    title: 'IT Audit',
    source: 'paste',
    text: SAMPLE_TEXT,
  });
  await act(async () => {
    root = ReactTestRenderer.create(<ChatTutorScreen bridge={bridge} />);
  });
}

async function say(q: string) {
  await act(async () => byId('chat-input').props.onChangeText(q));
  await act(async () => {
    await byId('chat-send').props.onPress();
  });
}

beforeEach(async () => {
  deckStore.reset();
  mockNavigate.mockClear();
  await connect(memoryDb());
});
afterEach(() => act(() => root?.unmount()));

it('answers a question about COBIT from the notes and cites the part', async () => {
  await setup(bridgeFor());
  await say('What is COBIT used for?');
  const [answer] = aiBubbles().slice(-1);
  expect(answer).toMatch(/cobit/i);
  expect(answer).toContain('From your notes, part');
  expect(answer).not.toContain('[1]');
});

it('says so when the notes do not cover the question', async () => {
  await setup(bridgeFor('NOT_IN_NOTES'));
  await say('Who won the 1998 World Cup?');
  const [answer] = aiBubbles().slice(-1);
  expect(answer).toContain("Your notes don't seem to cover that");
});

it('"quiz" opens the Quiz screen for the deck without calling the model', async () => {
  const bridge = bridgeFor();
  await setup(bridge);
  const spy = jest.spyOn(bridge, 'complete');
  const docId = deckStore.getState().currentDocId;
  await say('quiz me');
  expect(mockNavigate).toHaveBeenCalledWith('Quiz', { docId });
  expect(spy).not.toHaveBeenCalled();
});

it('without a deck it asks for notes and sending is disabled', async () => {
  await act(async () => {
    root = ReactTestRenderer.create(
      <ChatTutorScreen bridge={createMockBridge()} />,
    );
  });
  expect(texts().some(t => t.startsWith('Add your notes'))).toBe(true);
  expect(byId('chat-send').props.disabled).toBe(true);
  await act(async () => byId('attach-notes').props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('Ingest');
});
