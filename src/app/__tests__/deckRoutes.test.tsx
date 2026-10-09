import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import App from '../App';
import { useAiStore } from '../../store/useAiStore';
import { deckStore } from '../../store/useDeckStore';

/** One saved deck; every other query returns no rows. */
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => ({
    execute: jest.fn(async (sql: string) => ({
      rows: /FROM documents d/.test(sql)
        ? [
            {
              id: 'd1',
              title: 'IT Audit',
              source: 'paste',
              created_at: 1,
              terms: 6,
            },
          ]
        : [],
    })),
  }),
}));

const { act } = ReactTestRenderer;
let root: ReactTestRenderer.ReactTestRenderer;
const all = (id: string) => root.root.findAll(n => n.props.testID === id);
const has = (id: string) => all(id).length > 0;
const text = () => JSON.stringify(root.toJSON());
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await act(async () => new Promise<void>(r => setTimeout(r, 0)));
  }
};

beforeEach(async () => {
  deckStore.reset();
  useAiStore.setState({ status: 'ready', load: async () => {} });
  await act(async () => {
    root = ReactTestRenderer.create(<App />);
  });
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
});

it('Home → Add a page opens Scan Notes for the current deck', async () => {
  expect(text()).toContain('IT Audit');
  await act(async () => all('add-page')[0].props.onPress());
  await flush();
  expect(has('append-target')).toBe(true);
  expect([all('append-target')[0].props.children].flat().join('')).toBe(
    'to IT Audit · 6 terms so far',
  );
});

it('Home → Review terms opens the review screen for the current deck', async () => {
  await act(async () => all('review-terms')[0].props.onPress());
  await flush();
  expect(has('puzzle-heading')).toBe(true);
  expect(text()).toContain('Fix anything the camera misread');
  const back = all('back')[0] as ReactTestInstance;
  await act(async () => back.props.onPress());
  await flush();
  expect(has('puzzle-heading')).toBe(false);
});
