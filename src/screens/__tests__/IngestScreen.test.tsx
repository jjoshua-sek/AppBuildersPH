import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SAMPLE_TERMS, SAMPLE_TEXT, SAMPLE_TITLE } from '../../assets/sample';
import { termPatterns } from '../../services/ai/leakGuard';
import { createMockBridge } from '../../services/ai/mockBridge';
import { connect } from '../../services/db/client';
import { memoryDb } from '../../services/db/testing/memoryDb';
import { PROFILES } from '../../services/device/deviceProfile';
import type { AiBridge } from '../../types';
import { getTerms } from '../../services/db/queries';
import { deckStore, resetIngest, startIngest } from '../../store/useDeckStore';
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
  expect(textOf('progress-line')).toContain('Embedder not loaded');
  expect(textOf('progress-line')).toContain('Your notes are still here');
  expect(labelOf('generate')).toBe('Try again');
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

it.each([0, 1, 2, 3])(
  'shows feedback for a 400-word ingest with %i usable terms',
  async count => {
    const mock = createMockBridge();
    const terms = SAMPLE_TERMS.slice(0, count);
    const notes = Array.from(
      { length: 400 },
      (_, i) => ['audit', 'trail', 'materiality', 'evidence', 'notes'][i % 5],
    ).join(' ');
    const onPlay = await render({
      bridge: {
        ...mock,
        complete: async o =>
          (o.jsonSchema as any)?.properties?.terms
            ? JSON.stringify({ terms })
            : mock.complete(o),
      },
    });
    await act(async () => byId('notes').props.onChangeText(notes));
    await act(async () => byId('review-done').props.onPress());
    await act(async () => {
      byId('generate').props.onPress();
    });
    await until(() => deckStore.getState().status === 'done');
    expect(deckStore.getState().progress?.found).toBe(count);
    expect(textOf('progress-line')).toContain(
      count < 3 ? 'At least 3 terms are needed to play' : 'ready for Wordscape',
    );
    expect(disabled('play')).toBe(count < 3);
    if (count === 3) {
      await act(async () => byId('play').props.onPress());
      expect(onPlay).toHaveBeenCalledWith(deckStore.getState().currentDocId);
    }
    expect(byId('review').props.disabled).not.toBe(true);
  },
);

it('shows a status immediately while a 400-word ingest is waiting for the model', async () => {
  const mock = createMockBridge();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => {
    release = resolve;
  });
  await render({
    bridge: {
      ...mock,
      embed: async text => {
        await waiting;
        return mock.embed(text);
      },
      complete: async () => JSON.stringify({ terms: [] }),
    },
  });
  await act(async () => byId('notes').props.onChangeText('notes '.repeat(400)));
  await act(async () => byId('review-done').props.onPress());
  await act(async () => {
    byId('generate').props.onPress();
  });
  expect(textOf('progress-line')).toBe('Reading chunk 1…');
  expect(disabled('play')).toBe(true);
  release();
  await until(() => deckStore.getState().status === 'done');
  expect(textOf('progress-line')).toContain('0 usable terms');
});

it('keeps 400 words editable and offers retry when extraction fails', async () => {
  const mock = createMockBridge();
  const notes = 'notes '.repeat(400);
  let failing = true;
  await render({
    bridge: {
      ...mock,
      complete: async () => {
        if (failing) throw new Error('Model could not read this passage');
        return JSON.stringify({ terms: [] });
      },
    },
  });
  await act(async () => byId('notes').props.onChangeText(notes));
  await act(async () => byId('review-done').props.onPress());
  await act(async () => {
    byId('generate').props.onPress();
  });
  await until(() => deckStore.getState().status === 'error');
  expect(textOf('progress-line')).toContain(
    'Model could not read this passage',
  );
  expect(has('error')).toBe(true);
  expect(labelOf('generate')).toBe('Try again');
  expect(disabled('generate')).toBe(false);
  expect(disabled('play')).toBe(true);
  await act(async () => byId('review').props.onPress());
  expect(byId('notes').props.value).toBe(notes);
  expect(byId('notes').props.editable).toBe(true);
  await act(async () => byId('review-done').props.onPress());
  failing = false;
  await act(async () => {
    byId('generate').props.onPress();
  });
  await until(() => deckStore.getState().status === 'done');
  expect(has('error')).toBe(false);
  expect(textOf('progress-line')).toContain('0 usable terms');
});

describe('adding pages to a deck', () => {
  const words = SAMPLE_TEXT.split(/\s+/);
  const PAGE1 = words.slice(0, 170).join(' ');
  const PAGE2 = words.slice(170).join(' ');

  it('after a deck is read, adds the next page to the same deck', async () => {
    await render();
    await act(async () => byId('notes').props.onChangeText(PAGE1));
    await act(async () => byId('title').props.onChangeText('Chapter 1'));
    await act(async () => {
      byId('generate').props.onPress();
    });
    await until(() => deckStore.getState().status === 'done');
    const docId = deckStore.getState().currentDocId!;
    const firstCount = (await getTerms(docId)).length;

    await act(async () => byId('add-page').props.onPress());
    expect(byId('notes').props.value).toBe('');
    expect(textOf('append-target')).toMatch(
      /^to Chapter 1 · \d+ terms? so far$/,
    );

    await act(async () => byId('notes').props.onChangeText(PAGE2));
    await act(async () => {
      byId('generate').props.onPress();
    });
    await until(() => deckStore.getState().status === 'done');
    expect(deckStore.getState().currentDocId).toBe(docId);
    expect(deckStore.getState().decks).toHaveLength(1);
    expect((await getTerms(docId)).length).toBeGreaterThan(firstCount);
  }, 15000);

  it('opens in add-a-page mode with Play available, and can switch to a new deck', async () => {
    await startIngest(bridge(), P, {
      title: 'Ch 1',
      source: 'paste',
      text: SAMPLE_TEXT,
    });
    const docId = deckStore.getState().currentDocId!;
    resetIngest(); // a freshly opened screen starts from idle
    const onPlay = await render({ appendTo: docId }, false);
    expect(textOf('append-target')).toMatch(/^to Ch 1 · /);
    expect(disabled('play')).toBe(false);
    await act(async () => byId('play').props.onPress());
    expect(onPlay).toHaveBeenCalledWith(docId);
    await act(async () => byId('new-deck').props.onPress());
    expect(has('append-target')).toBe(false);
  });

  it('offers Review terms once the deck is read', async () => {
    const onReview = jest.fn();
    await render({ onReview });
    expect(has('review-terms')).toBe(false);
    await act(async () => byId('sample').props.onPress());
    await act(async () => {
      byId('generate').props.onPress();
    });
    await until(() => deckStore.getState().status === 'done');
    await act(async () => byId('review-terms').props.onPress());
    expect(onReview).toHaveBeenCalledWith(deckStore.getState().currentDocId);
  });
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
      'Done · 1 usable term found. At least 3 terms are needed to play. Add more notes or snap another page, then generate again.',
    );
    expect(progressLine('done', { ...p, found: 2, selected: 2 })).toBe(
      'Done · 2 usable terms found. At least 3 terms are needed to play. Add more notes or snap another page, then generate again.',
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
