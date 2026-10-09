import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SAMPLE_TERMS, SAMPLE_TEXT, SAMPLE_TITLE } from '../../assets/sample';
import { termPatterns } from '../../services/ai/leakGuard';
import { createMockBridge } from '../../services/ai/mockBridge';
import { connect } from '../../services/db/client';
import { memoryDb } from '../../services/db/testing/memoryDb';
import { PROFILES } from '../../services/device/deviceProfile';
import type { AiBridge } from '../../types';
import { deckStore } from '../../store/useDeckStore';
import { IngestScreen, MIN_WORDS, progressLine } from '../IngestScreen';

const { act } = ReactTestRenderer;
const P = PROFILES['ios-metal'];

/** Extraction returns the sample terms found in the passage. */
function bridge(): AiBridge {
  const mock = createMockBridge();
  return {
    ...mock,
    async complete(o) {
      if (!(o.jsonSchema as any)?.properties?.terms) return mock.complete(o);
      const passage = o.messages[1].content;
      const terms = SAMPLE_TERMS.filter(t =>
        termPatterns(t.term).some(p => {
          p.lastIndex = 0;
          return p.test(passage);
        }),
      ).map(t => ({ term: t.term, clue: t.clue }));
      return JSON.stringify({ terms: terms.slice(0, 5) });
    },
  };
}

let root: ReactTestRenderer.ReactTestRenderer;
const byId = (id: string): ReactTestInstance =>
  root.root.findAll(n => n.props.testID === id)[0];
const has = (id: string) =>
  root.root.findAll(n => n.props.testID === id).length > 0;
const disabled = (id: string) => !!byId(id).props.disabled;
const textOf = (id: string) => [byId(id).props.children].flat().join('');

async function render(
  props: Partial<React.ComponentProps<typeof IngestScreen>> = {},
) {
  const onPlay = jest.fn();
  await act(async () => {
    root = ReactTestRenderer.create(
      <IngestScreen bridge={bridge()} profile={P} onPlay={onPlay} {...props} />,
    );
  });
  return onPlay;
}

async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) {
    await act(async () => {
      await new Promise<void>(r => setTimeout(r, 0));
    });
  }
  expect(cond()).toBe(true);
}

beforeEach(async () => {
  deckStore.reset();
  await connect(memoryDb());
});

afterEach(() => {
  act(() => root?.unmount());
});

it('starts with Generate and Play disabled and no camera button without OCR', async () => {
  await render();
  expect(disabled('generate')).toBe(true);
  expect(disabled('play')).toBe(true);
  expect(has('snap')).toBe(false);
});

it('needs MIN_WORDS words before Generate is enabled', async () => {
  await render();
  await act(async () =>
    byId('notes').props.onChangeText('word '.repeat(MIN_WORDS - 1)),
  );
  expect(disabled('generate')).toBe(true);
  await act(async () =>
    byId('notes').props.onChangeText('word '.repeat(MIN_WORDS)),
  );
  expect(disabled('generate')).toBe(false);
});

it('ingests the sample handout and plays the new deck', async () => {
  const onPlay = await render();
  await act(async () => byId('sample').props.onPress());
  expect(byId('notes').props.value).toBe(SAMPLE_TEXT);
  expect(byId('title').props.value).toBe(SAMPLE_TITLE);

  await act(async () => {
    byId('generate').props.onPress();
  });
  await until(() => deckStore.getState().status === 'done');
  expect(textOf('progress-line')).toMatch(
    /^Done · \d+ terms found, \d+ in your puzzle$/,
  );
  expect(deckStore.getState().decks[0]).toMatchObject({
    title: SAMPLE_TITLE,
    source: 'sample',
  });

  expect(disabled('play')).toBe(false);
  await act(async () => byId('play').props.onPress());
  expect(onPlay).toHaveBeenCalledWith(deckStore.getState().currentDocId);
});

it('puts snapped text in the box for checking, and adds pages together', async () => {
  const snapPage = jest
    .fn()
    .mockResolvedValueOnce('Page one text.')
    .mockResolvedValueOnce('Page two text.');
  await render({ snapPage });
  await act(async () => byId('snap').props.onPress());
  await act(async () => byId('snap').props.onPress());
  expect(byId('notes').props.value).toBe('Page one text.\n\nPage two text.');
});

it('reads a picked photo, and ignores a cancelled camera', async () => {
  const cancel = Object.assign(new Error('Cancelled'), {
    name: 'OcrCancelled',
  });
  await render({
    snapPage: jest.fn().mockRejectedValue(cancel),
    pickPage: jest.fn().mockResolvedValue('Picked page text.'),
  });
  await act(async () => byId('snap').props.onPress());
  expect(root.root.findAll(n => n.props.children === 'Cancelled')).toHaveLength(
    0,
  );
  await act(async () => byId('pick').props.onPress());
  expect(byId('notes').props.value).toBe('Picked page text.');
});

it('shows a camera error without losing the typed text', async () => {
  await render({
    snapPage: jest.fn().mockRejectedValue(new Error('No photo')),
  });
  await act(async () => byId('notes').props.onChangeText('my notes'));
  await act(async () => byId('snap').props.onPress());
  expect(byId('notes').props.value).toBe('my notes');
  expect(
    root.root.findAll(n => n.props.children === 'No photo').length,
  ).toBeGreaterThan(0);
});

it('shows an ingest error', async () => {
  const b = bridge();
  await render({
    bridge: {
      ...b,
      embed: async () => {
        throw new Error('Embedder not loaded');
      },
    },
  });
  await act(async () => byId('sample').props.onPress());
  await act(async () => {
    byId('generate').props.onPress();
  });
  await until(() => has('error'));
  expect(textOf('error')).toContain('Embedder not loaded');
  expect(disabled('play')).toBe(true);
});

describe('progressLine', () => {
  const p = { chunk: 1, total: 3, found: 4, selected: 4 };
  it('names the chunk being read', () => {
    expect(progressLine('reading', null)).toBe('Reading chunk 1…');
    expect(progressLine('reading', p)).toBe(
      'Reading chunk 2/3 · 4 terms found',
    );
    expect(progressLine('reading', { ...p, chunk: 3 })).toBe(
      'Reading chunk 3/3 · 4 terms found',
    );
  });
  it('summarizes the result', () => {
    expect(
      progressLine('done', { ...p, chunk: 3, found: 9, selected: 8 }),
    ).toBe('Done · 9 terms found, 8 in your puzzle');
    expect(progressLine('done', { ...p, found: 1, selected: 1 })).toMatch(
      /^Only 1 term found/,
    );
  });
});
