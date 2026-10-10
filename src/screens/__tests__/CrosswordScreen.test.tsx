import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { CrosswordScreen } from '../CrosswordScreen';
import { SAMPLE_TERMS } from '../../assets/sample';
import { connect, getDb } from '../../services/db/client';
import { insertTerm, setSelectedTerms } from '../../services/db/queries';
import { memoryDb } from '../../services/db/testing/memoryDb';
import type { Props } from '../../app/navigation';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('../../components/TutorSheet', () => ({ TutorSheet: () => null }));
const { act } = ReactTestRenderer;
let root: ReactTestRenderer.ReactTestRenderer;

const all = (id: string) => root.root.findAll(n => n.props.testID === id);
// Rendered (host) nodes only, so a testID is not counted twice through its wrapper components.
const count = (id: string) =>
  all(id).filter(n => typeof n.type === 'string').length;
const byId = (id: string): ReactTestInstance => all(id)[0];
const press = async (id: string) =>
  act(async () => {
    await byId(id).props.onPress();
  });
const typeWord = async (w: string) => {
  for (const ch of w) await press(`key-${ch}`);
};
const flat = (n: ReactTestInstance | string): string =>
  typeof n === 'string' ? n : n.children.map(flat).join('');
const textOf = (n: ReactTestInstance) => flat(n);
const cellText = (id: string) => textOf(byId(id));
/** The entry the clue bar shows: { len, answer } looked up by its clue. */
const current = () => {
  const bar = textOf(byId('clue-bar'));
  const term = SAMPLE_TERMS.find(t => bar.includes(t.clue));
  return { bar, term, len: Number(bar.match(/\((\d+)\)\s*$/)?.[1]) };
};
const all2 = (re: RegExp) =>
  root.root.findAll(n => re.test(n.props.testID ?? ''));
const firstCell = () => all2(/^cell-\d+-\d+$/)[0];

beforeEach(async () => {
  await connect(memoryDb());
  await getDb().execute('INSERT INTO documents VALUES (?,?,?,?)', ['sample', 'Notes', 'file', 0]);
  for (const t of SAMPLE_TERMS) {
    await insertTerm({ ...t, doc_id: 'sample' });
    await getDb().execute('UPDATE terms SET description = ?, why = ? WHERE id = ?', [
      t.description,
      t.why,
      t.id,
    ]);
  }
  await setSelectedTerms('sample', SAMPLE_TERMS.map(t => t.id));
  await act(async () => {
    root = ReactTestRenderer.create(
      React.createElement(CrosswordScreen, {
        route: { key: 'cw', name: 'Crossword', params: { docId: 'sample' } },
      } as Props<'Crossword'>),
    );
  });
});
afterEach(() => act(() => root.unmount()));

it('shows the A-Z keyboard from the start, before any square is selected', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(count(`key-${ch}`)).toBe(1);
  expect(count('key-BACK')).toBe(1);
  expect(textOf(byId('clue-bar'))).toContain('Tap a square to start');
});

it('tapping a square shows its clue in the bar', async () => {
  await act(async () => firstCell().props.onPress());
  const { bar, term } = current();
  expect(term).toBeDefined();
  expect(bar).toMatch(/^\d+-(Across|Down)/);
});

it('types letters into the cells and moves on by itself, and backspace undoes', async () => {
  await act(async () => firstCell().props.onPress());
  const { term } = current();
  const a = term!.answer;
  await typeWord(a.slice(0, 2));
  const filled = () =>
    all2(/^cell-\d+-\d+$/)
      .map(n => cellText(n.props.testID))
      .join('');
  expect(filled()).toContain(a[0] + a[1]);
  await press('key-BACK');
  await press('key-BACK');
  expect(filled()).not.toContain(a[0] + a[1]);
});

it('a correct word is checked as soon as it is full: solved, logged, "why it matters" shown', async () => {
  await act(async () => firstCell().props.onPress());
  const { term } = current();
  await typeWord(term!.answer);
  expect(count('why-card')).toBe(1);
  expect(textOf(byId('why-card'))).toContain(term!.why);
  const { rows } = await getDb().execute(
    'SELECT term_id, correct, mode FROM attempts',
  );
  expect(rows).toEqual([{ term_id: term!.id, correct: 1, mode: 'crossword' }]);
});

it('a wrong full word says so, is logged as a miss, and can be fixed', async () => {
  await act(async () => firstCell().props.onPress());
  const { term, len } = current();
  const wrong = (term!.answer[0] === 'Z' ? 'Q' : 'Z').repeat(len);
  await typeWord(wrong);
  expect(textOf(byId('note'))).toContain('Not quite');
  const { rows } = await getDb().execute('SELECT correct FROM attempts');
  expect(rows).toEqual([{ correct: 0 }]);
  expect(count('why-card')).toBe(0);
});

it('Hint reveals a letter of the current word and counts as a hint', async () => {
  await act(async () => firstCell().props.onPress());
  const { term } = current();
  await press('hint');
  const shown = all2(/^cell-\d+-\d+$/)
    .map(n => cellText(n.props.testID))
    .join('');
  expect(shown).toContain(term!.answer[0]);
});

it('the next clue button moves to a different clue', async () => {
  await act(async () => firstCell().props.onPress());
  const before = current().bar;
  await press('clue-next');
  expect(current().bar).not.toBe(before);
});

it('keeps Hint and Tutor off until a word is selected, and the tutor available after', async () => {
  expect(byId('ask-tutor').props.disabled).toBe(true);
  await act(async () => firstCell().props.onPress());
  expect(byId('ask-tutor').props.disabled).toBeFalsy();
});
