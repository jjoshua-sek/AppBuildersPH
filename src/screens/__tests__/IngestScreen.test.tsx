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
const labelOf = (id: string) =>
  byId(id)
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => [n.props.children].flat().join(''))
    .join('');

/** The title and notes fields live in the "Check the text" dialog, so open it unless told not to. */
async function render(
  props: Partial<React.ComponentProps<typeof IngestScreen>> = {},
  openReview = true,
) {
  const onPlay = jest.fn();
  await act(async () => {
    root = ReactTestRenderer.create(
      <IngestScreen
        bridge={bridge()}
        profile={P}
        onPlay={onPlay}
        onBack={() => {}}
        {...props}
      />,
    );
  });
  if (openReview) await act(async () => byId('review').props.onPress());
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
    /^Done · \d+ terms ready for Wordscape$/,
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

it('shows Stop while reading, and stops after the current chunk', async () => {
  const fast = bridge();
  const slow: AiBridge = {
    ...fast,
    // a real model takes seconds per chunk; here, one timer tick per embedding
    embed: t => new Promise(r => setTimeout(() => r(fast.embed(t)), 1)),
  };
  await render({ bridge: slow });
  await act(async () => byId('sample').props.onPress());
  await act(async () => {
    byId('generate').props.onPress();
  });
  expect(has('generate')).toBe(false);
  await act(async () => byId('stop').props.onPress());
  expect(labelOf('stop')).toBe('Stopping after this chunk…');
  expect(disabled('stop')).toBe(true);
  await until(() => deckStore.getState().status === 'done');
  expect(has('stop')).toBe(false);
  expect(textOf('progress-line')).toMatch(/^Stopped after 1\/\d chunks/);
});

it('goes back', async () => {
  const onBack = jest.fn();
  await render({ onBack });
  await act(async () => byId('back').props.onPress());
  expect(onBack).toHaveBeenCalled();
});

describe('progressLine', () => {
  const p = {
    chunk: 1,
    total: 3,
    found: 4,
    selected: 4,
    failedChunks: 0,
    cancelled: false,
  };
  it('names the chunk being read', () => {
    expect(progressLine('reading', null)).toBe('Reading chunk 1…');
    expect(progressLine('reading', p)).toBe(
      'Reading chunk 2/3 · 4 terms found',
    );
    expect(progressLine('reading', { ...p, chunk: 3, found: 1 })).toBe(
      'Reading chunk 3/3 · 1 term found',
    );
  });
  it('summarizes the result', () => {
    expect(
      progressLine('done', { ...p, chunk: 3, found: 9, selected: 8 }),
    ).toBe('Done · 9 terms ready for Wordscape');
    expect(progressLine('done', { ...p, found: 1, selected: 1 })).toBe(
      'Done · 1 term ready for Wordscape',
    );
    expect(progressLine('done', { ...p, found: 2, selected: 2 })).toBe(
      'Done · 2 terms ready for Wordscape',
    );
    expect(progressLine('done', { ...p, found: 3, selected: 3 })).toBe(
      'Done · 3 terms ready for Wordscape',
    );
  });
  it('says when it was stopped or skipped chunks', () => {
    expect(progressLine('done', { ...p, cancelled: true })).toBe(
      'Stopped after 1/3 chunks · 4 terms ready for Wordscape',
    );
    expect(
      progressLine('done', { ...p, chunk: 3, failedChunks: 1, selected: 6 }),
    ).toBe('Done · 4 terms ready for Wordscape · 1 chunk skipped');
  });
});

it('keeps the editor out of the screen until Check the text is tapped', async () => {
  await render({}, false);
  expect(has('notes')).toBe(false);
  expect(has('title')).toBe(false);
  await act(async () => byId('review').props.onPress());
  expect(has('notes')).toBe(true);
  expect(has('title')).toBe(true);
});

it('keeps typed text when the dialog is closed and reopened, and shows the word count', async () => {
  await render({}, false);
  await act(async () => byId('review').props.onPress());
  await act(async () => byId('notes').props.onChangeText('one two three'));
  await act(async () => byId('review-done').props.onPress());
  await act(async () => byId('review').props.onPress());
  expect(byId('notes').props.value).toBe('one two three');
  expect(textOf('word-count')).toBe('3 words');
});

it('makes the fields read-only while reading', async () => {
  const fast = bridge();
  const slow: AiBridge = {
    ...fast,
    embed: t => new Promise(r => setTimeout(() => r(fast.embed(t)), 1)),
  };
  await render({ bridge: slow });
  await act(async () => byId('sample').props.onPress());
  await act(async () => {
    byId('generate').props.onPress();
  });
  expect(byId('notes').props.editable).toBe(false);
  expect(byId('title').props.editable).toBe(false);
  await act(async () => byId('stop').props.onPress());
  await until(() => deckStore.getState().status === 'done');
});
