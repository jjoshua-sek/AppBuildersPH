import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DailyTermScreen } from '../DailyTermScreen';
import { connect, getDb } from '../../services/db/client';
import { memoryDb } from '../../services/db/testing/memoryDb';
import type { Props } from '../../app/navigation';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../components/TutorSheet', () => ({ TutorSheet: () => null }));
const { act } = ReactTestRenderer;
let root: ReactTestRenderer.ReactTestRenderer;
const button = (id: string) =>
  root.root.findAll(node => node.props.testID === id)[0];
const press = async (id: string) => {
  await act(async () => {
    await button(id).props.onPress();
  });
};
const render = async (docId?: string) => {
  await act(async () => {
    root = ReactTestRenderer.create(
      React.createElement(DailyTermScreen, {
        route: { key: 'daily', name: 'DailyTerm', params: { docId } },
      } as Props<'DailyTerm'>),
    );
  });
};

beforeEach(async () => {
  await connect(memoryDb());
  await getDb().execute('INSERT INTO documents VALUES (?,?,?,?)', [
    'sample',
    'Notes',
    'file',
    0,
  ]);
  await getDb().execute('INSERT INTO terms VALUES (?,?,?,?,?,?,?,?,?)', [
    'term',
    'sample',
    'chunk',
    'Audit',
    'AUDIT',
    'An examination of records and processes',
    null,
    null,
    1,
  ]);
  mockNavigate.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
});

it('accepts a correct answer, logs it, and restores the completed game when reopened', async () => {
  await render('sample');
  for (const key of 'AUDIT') await press(`key-${key}`);
  await press('key-ENTER');
  expect(JSON.stringify(root.toJSON())).toContain('Solved!');
  expect(button('key-ENTER').props.disabled).toBe(true);
  const { rows } = await getDb().execute('SELECT correct, mode FROM attempts');
  expect(rows).toEqual([{ correct: 1, mode: 'daily' }]);
  act(() => root.unmount());
  await render('sample');
  expect(JSON.stringify(root.toJSON())).toContain('Solved!');
  expect(button('key-ENTER').props.disabled).toBe(true);
});

it('offers a real note import path instead of a dead keyboard when no deck is selected', async () => {
  await render();
  expect(
    root.root.findAll(node => node.props.testID === 'key-ENTER'),
  ).toHaveLength(0);
  await press('daily-add-notes');
  expect(mockNavigate).toHaveBeenCalledWith('Ingest');
});
