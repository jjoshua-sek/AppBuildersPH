import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SAMPLE_TEXT } from '../../assets/sample';
import { createMockBridge } from '../../services/ai/mockBridge';
import { connect } from '../../services/db/client';
import { memoryDb } from '../../services/db/testing/memoryDb';
import { PROFILES } from '../../services/device/deviceProfile';
import type { AiBridge } from '../../types';
import { deckStore, startIngest } from '../../store/useDeckStore';
import { AskNotesScreen } from '../AskNotesScreen';

const { act } = ReactTestRenderer;
let root: ReactTestRenderer.ReactTestRenderer;
const byId = (id: string): ReactTestInstance =>
  root.root.findAll(n => n.props.testID === id)[0];
const has = (id: string) =>
  root.root.findAll(n => n.props.testID === id).length > 0;
const texts = () =>
  root.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => [n.props.children].flat().join(''));

async function render(bridge: AiBridge, docId?: string) {
  await act(async () => {
    root = ReactTestRenderer.create(
      <AskNotesScreen bridge={bridge} docId={docId} onBack={() => {}} />,
    );
  });
}

async function ask(q: string) {
  await act(async () => byId('query').props.onChangeText(q));
  await act(async () => {
    await byId('search').props.onPress();
  });
}

beforeEach(async () => {
  deckStore.reset();
  await connect(memoryDb());
});

afterEach(() => {
  act(() => root?.unmount());
});

it('disables Search until there is a question', async () => {
  await render(createMockBridge());
  expect(byId('search').props.disabled).toBe(true);
  await act(async () => byId('query').props.onChangeText('what is cobit'));
  expect(byId('search').props.disabled).toBe(false);
});

it('says when there are no notes yet', async () => {
  await render(createMockBridge());
  await ask('what is cobit');
  expect(has('empty')).toBe(true);
});

it('shows up to 3 passages with deck titles, and expands one', async () => {
  const bridge = createMockBridge();
  await startIngest(bridge, PROFILES['android-cpu'], {
    title: 'IT Audit',
    source: 'paste',
    text: SAMPLE_TEXT,
  });
  await render(bridge);
  await ask('What is COBIT used for?');
  expect(has('hit-0')).toBe(true);
  expect(has('hit-3')).toBe(false);
  expect(texts().some(t => t.startsWith('IT Audit · part '))).toBe(true);

  const before = texts().length;
  await act(async () => byId('hit-0').props.onPress());
  expect(texts()).toContain('Show less');
  expect(texts().length).toBe(before);
});

it('shows a model error', async () => {
  const b = createMockBridge();
  await render({
    ...b,
    embed: async () => {
      throw new Error('Embedder not loaded');
    },
  });
  await ask('what is cobit');
  expect([byId('error').props.children].flat().join('')).toBe(
    'Embedder not loaded',
  );
});

describe('written answer', () => {
  /** Answers with the first sentence of note [1], citing it. */
  function answeringBridge(): AiBridge {
    const mock = createMockBridge();
    return {
      ...mock,
      async complete(o) {
        const sys = o.messages[0].content;
        const note1 = sys.match(/\[1\] ([^.]*\.)/)![1];
        const reply = `${note1} [1]`;
        for (const tok of reply.match(/\S+\s*/g) ?? []) o.onToken?.(tok);
        return reply;
      },
    };
  }

  it('streams an answer from the notes and links the cited passage', async () => {
    const bridge = answeringBridge();
    await startIngest(bridge, PROFILES['android-cpu'], {
      title: 'IT Audit',
      source: 'paste',
      text: SAMPLE_TEXT,
    });
    await render(bridge);
    await ask('What is COBIT used for?');
    const answer = [byId('answer-text').props.children].flat().join('');
    expect(answer.length).toBeGreaterThan(10);
    expect(answer).not.toContain('[1]');
    expect(texts().some(t => t.startsWith('From: IT Audit · part '))).toBe(
      true,
    );

    const source = root.root.findAll(n =>
      /^source-/.test(n.props.testID ?? ''),
    )[0];
    await act(async () => source.props.onPress());
    expect(texts()).toContain('Show less'); // the cited passage is expanded
  });

  it('keeps the passages when the answer fails', async () => {
    const good = answeringBridge();
    await startIngest(good, PROFILES['android-cpu'], {
      title: 'IT Audit',
      source: 'paste',
      text: SAMPLE_TEXT,
    });
    await render({
      ...good,
      complete: async () => {
        throw new Error('LLM not loaded');
      },
    });
    await ask('What is COBIT used for?');
    expect(has('hit-0')).toBe(true);
    expect([byId('answer-error').props.children].flat().join('')).toContain(
      'LLM not loaded',
    );
  });
});
