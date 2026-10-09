import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import App from '../App';
import { useAiStore } from '../../store/useAiStore';
import { deckStore } from '../../store/useDeckStore';
import { open } from '@op-engineering/op-sqlite';

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({ execute: jest.fn(async () => ({ rows: [] })) })),
}));

const { act } = ReactTestRenderer;
let root: ReactTestRenderer.ReactTestRenderer;
const all = (id: string) => root.root.findAll(n => n.props.testID === id);
const byId = (id: string): ReactTestInstance => all(id)[0];
/** The pressable that wraps the given label. */
const tile = (label: string) =>
  root.root.find(
    n =>
      typeof n.props.onPress === 'function' &&
      n.findAll(t => t.props.children === label).length > 0,
  );

beforeEach(async () => {
  deckStore.reset();
  // Skip model loading: pretend the splash screen finished.
  useAiStore.setState({ status: 'ready', load: async () => {} });
  await act(async () => {
    root = ReactTestRenderer.create(<App />);
  });
});

afterEach(() => {
  act(() => root.unmount());
});

it('opens the decks database at start', () => {
  // op-sqlite is mocked in jest.setup.js and returns no rows
  expect(open).toHaveBeenCalledWith({ name: 'backpack.sqlite' });
  expect(deckStore.getState().dbError).toBeNull();
  expect(all('deck').length).toBeGreaterThan(0);
  expect(JSON.stringify(root.toJSON())).toContain('No notes yet');
});

it('goes Home → Scan Notes → Back', async () => {
  await act(async () => tile('Scan Notes').props.onPress());
  expect(all('review').length).toBeGreaterThan(0);
  expect(all('snap')).toHaveLength(0); // no OCR native module under Jest
  await act(async () => byId('back').props.onPress());
  expect(all('review')).toHaveLength(0);
  expect(all('deck').length).toBeGreaterThan(0);
});

it('keeps Ask my notes disabled until a deck exists', async () => {
  await act(async () => tile('Ask my notes').props.onPress());
  expect(all('review')).toHaveLength(0);
  expect(JSON.stringify(root.toJSON())).not.toContain('Finds the part of your notes');
});
