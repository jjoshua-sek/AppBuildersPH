import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SAMPLE_TERMS } from '../../assets/sample';
import { connect, getDb } from '../../services/db/client';
import {
  getSelectedTerms,
  getTerm,
  setSelectedTerms,
} from '../../services/db/queries';
import { memoryDb } from '../../services/db/testing/memoryDb';
import { deckStore } from '../../store/useDeckStore';
import { ReviewTermsScreen } from '../ReviewTermsScreen';

const { act } = ReactTestRenderer;
let root: ReactTestRenderer.ReactTestRenderer;
const all = (id: string) => root.root.findAll(n => n.props.testID === id);
const byId = (id: string): ReactTestInstance => all(id)[0];
const has = (id: string) => all(id).length > 0;
const label = (id: string) =>
  byId(id)
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => [n.props.children].flat().join(''))
    .join('');
const textOf = (id: string) =>
  byId(id)
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n =>
      [n.props.children]
        .flat()
        .filter(x => typeof x !== 'object')
        .join(''),
    )
    .join('');
const press = (id: string) => act(async () => byId(id).props.onPress());
const type = (id: string, v: string) =>
  act(async () => byId(id).props.onChangeText(v));
const flush = () => act(async () => new Promise<void>(r => setTimeout(r, 0)));

const T = (answer: string) => SAMPLE_TERMS.find(t => t.answer === answer)!;

async function render(
  selected: number,
  props: Partial<React.ComponentProps<typeof ReviewTermsScreen>> = {},
) {
  const db = getDb();
  await db.execute('INSERT INTO documents VALUES (?,?,?,?)', [
    'sample',
    'IT Audit',
    'paste',
    0,
  ]);
  for (const t of SAMPLE_TERMS) {
    await db.execute(
      'INSERT INTO terms (id, doc_id, chunk_id, term, answer, clue) VALUES (?,?,?,?,?,?)',
      [t.id, t.doc_id, t.chunk_id, t.term, t.answer, t.clue],
    );
  }
  await setSelectedTerms(
    'sample',
    SAMPLE_TERMS.slice(0, selected).map(t => t.id),
  );
  await act(async () => {
    root = ReactTestRenderer.create(
      <ReviewTermsScreen docId="sample" onBack={() => {}} {...props} />,
    );
  });
  await flush();
}

beforeEach(async () => {
  deckStore.reset();
  await connect(memoryDb());
});

afterEach(() => {
  act(() => root?.unmount());
});

it('lists puzzle terms and the others separately', async () => {
  await render(6);
  expect(textOf('puzzle-heading')).toBe('In your puzzle (6/10)');
  expect(textOf('others-heading')).toBe('Other terms found (4)');
  expect(has(`term-${SAMPLE_TERMS[0].id}`)).toBe(true);
  expect(has(`add-${SAMPLE_TERMS[0].id}`)).toBe(false); // already in the puzzle
  expect(has(`add-${SAMPLE_TERMS[9].id}`)).toBe(true);
});

it('fixes a misread term, checking it live before saving', async () => {
  await render(6);
  const t = T('ASSURANCE');
  await press(`edit-btn-${t.id}`);
  expect(byId('edit-term').props.value).toBe('assurance');

  await type('edit-clue', 'Assurance means confidence in the systems.');
  expect(textOf('edit-problem')).toBe('The clue gives the answer away.');
  expect(byId('save').props.disabled).toBe(true);

  await type('edit-term', 'assurance level');
  await type(
    'edit-clue',
    'Confidence an audit gives that systems are reliable, though not a guarantee.',
  );
  expect(has('edit-problem')).toBe(false);
  await press('save');
  await flush();

  expect(has('edit-term')).toBe(false);
  expect((await getTerm(t.id))!.answer).toBe('ASSURANCELEVEL');
}, 10000);

it('shows a save error from the database rules, such as a duplicate answer', async () => {
  await render(6);
  await press(`edit-btn-${T('EVIDENCE').id}`);
  await type('edit-term', 'sampling');
  await press('save');
  await flush();
  expect(textOf('error')).toContain('already has that answer');
  expect(has('edit-term')).toBe(true); // still editing
});

it('deletes only on the second tap, and refills the puzzle', async () => {
  await render(6);
  const id = SAMPLE_TERMS[0].id;
  await press(`delete-${id}`);
  expect(label(`delete-${id}`)).toBe('Tap again to delete');
  expect(await getTerm(id)).not.toBeNull();
  await press(`delete-${id}`);
  await flush();
  expect(await getTerm(id)).toBeNull();
  expect(textOf('puzzle-heading')).toBe('In your puzzle (6/10)');
  expect(textOf('others-heading')).toBe('Other terms found (3)');
});

it('adds a left-out term to the puzzle', async () => {
  await render(6);
  await press(`add-${SAMPLE_TERMS[9].id}`);
  await flush();
  expect(textOf('puzzle-heading')).toBe('In your puzzle (7/10)');
  expect((await getSelectedTerms('sample')).map(t => t.id)).toContain(
    SAMPLE_TERMS[9].id,
  );
});

it('enables Play from 3 puzzle terms', async () => {
  const onPlay = jest.fn();
  await render(2, { onPlay });
  expect(byId('play').props.disabled).toBe(true);
  await press(`add-${SAMPLE_TERMS[5].id}`);
  await flush();
  expect(byId('play').props.disabled).toBe(false);
  await press('play');
  expect(onPlay).toHaveBeenCalledWith('sample');
});
