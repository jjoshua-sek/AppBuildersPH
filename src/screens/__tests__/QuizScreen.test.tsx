import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SAMPLE_TERMS } from '../../assets/sample';
import { createMockBridge } from '../../services/ai/mockBridge';
import { connect, getDb } from '../../services/db/client';
import { memoryDb } from '../../services/db/testing/memoryDb';
import { deckStore } from '../../store/useDeckStore';
import { QuizScreen } from '../QuizScreen';

const { act } = ReactTestRenderer;
let root: ReactTestRenderer.ReactTestRenderer;
const all = (id: string) => root.root.findAll(n => n.props.testID === id);
const byId = (id: string): ReactTestInstance => all(id)[0];
const has = (id: string) => all(id).length > 0;
const textIn = (n: ReactTestInstance) =>
  n
    .findAll(x => (x.type as unknown) === 'Text')
    .map(x =>
      [x.props.children]
        .flat()
        .filter(c => typeof c !== 'object')
        .join(''),
    )
    .join(' ');
const flush = async () => {
  for (let k = 0; k < 20; k++) {
    await act(async () => new Promise<void>(r => setTimeout(r, 0)));
  }
};

async function seed(terms = SAMPLE_TERMS) {
  const db = getDb();
  await db.execute('INSERT INTO documents VALUES (?,?,?,?)', [
    'sample',
    'IT Audit',
    'paste',
    0,
  ]);
  for (const t of terms) {
    await db.execute(
      'INSERT INTO terms (id, doc_id, chunk_id, term, answer, clue, description) VALUES (?,?,?,?,?,?,?)',
      [t.id, t.doc_id, t.chunk_id, t.term, t.answer, t.clue, t.description],
    );
  }
}

async function render() {
  await act(async () => {
    root = ReactTestRenderer.create(
      <QuizScreen
        bridge={createMockBridge()}
        docId="sample"
        onBack={() => {}}
      />,
    );
  });
  await flush();
}

/** The option index holding the right term for the clue on screen. */
function rightOption(): number {
  const clue = [byId('clue').props.children].flat().join('');
  const term = SAMPLE_TERMS.find(t => t.clue === clue)!.term;
  for (let k = 0; k < 4; k++)
    if (textIn(byId(`option-${k}`)) === term) return k;
  throw new Error('right answer not among the options');
}
const choose = (k: number) =>
  act(async () => byId(`option-${k}`).props.onPress());
const attempts = async () =>
  (
    await getDb().execute(
      "SELECT term_id, correct FROM attempts WHERE mode = 'quiz' ORDER BY id",
    )
  ).rows;

beforeEach(async () => {
  deckStore.reset();
  await connect(memoryDb());
});

afterEach(() => {
  act(() => root?.unmount());
});

it('asks 10 questions with 4 options, the right term among them', async () => {
  await seed();
  await render();
  expect(textIn(byId('counter'))).toBe('Question 1 of 10');
  for (let k = 0; k < 4; k++) expect(has(`option-${k}`)).toBe(true);
  expect(rightOption()).toBeGreaterThanOrEqual(0);
});

it('marks a right answer, shows the description, and logs it', async () => {
  await seed();
  await render();
  const k = rightOption();
  await choose(k);
  expect(textIn(byId('feedback'))).toContain('Correct!');
  const clue = [byId('clue').props.children].flat().join('');
  expect(textIn(byId('feedback'))).toContain(
    SAMPLE_TERMS.find(t => t.clue === clue)!.description!,
  );
  expect(byId(`option-${(k + 1) % 4}`).props.disabled).toBe(true);
  expect((await attempts()).map(r => Number(r.correct))).toEqual([1]);
});

it('shows the right term after a miss and lists it at the end', async () => {
  await seed();
  await render();
  const clue = [byId('clue').props.children].flat().join('');
  const right = SAMPLE_TERMS.find(t => t.clue === clue)!;
  await choose((rightOption() + 1) % 4);
  expect(textIn(byId('feedback'))).toContain(`It's "${right.term}".`);
  expect((await attempts())[0]).toMatchObject({
    term_id: right.id,
    correct: 0,
  });

  for (let n = 1; n < 10; n++) {
    await act(async () => byId('next').props.onPress());
    await choose(rightOption());
  }
  await act(async () => byId('next').props.onPress());
  expect(textIn(byId('score'))).toBe('9/10');
  expect(textIn(byId('result'))).toContain(right.term);
  expect(await attempts()).toHaveLength(10);
}, 15000);

it('starts over with Play again', async () => {
  await seed(SAMPLE_TERMS.slice(0, 2));
  await render();
  for (let n = 0; n < 2; n++) {
    await choose(rightOption());
    await act(async () => byId('next').props.onPress());
  }
  expect(textIn(byId('score'))).toBe('2/2');
  await act(async () => byId('again').props.onPress());
  await flush();
  expect(textIn(byId('counter'))).toBe('Question 1 of 2');
});

it('explains when the deck is too small', async () => {
  await seed(SAMPLE_TERMS.slice(0, 1));
  await render();
  expect(has('too-few')).toBe(true);
});
