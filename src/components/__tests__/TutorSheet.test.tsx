import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { AiBridge, TermRow } from '../../types';
import { createMockBridge } from '../../services/ai/mockBridge';
import { TutorSheet } from '../TutorSheet';

const term: TermRow = {
  id: 't1',
  doc_id: 'd1',
  chunk_id: 'd1:0',
  term: 'audit',
  answer: 'AUDIT',
  clue: 'An independent check of records to confirm they are accurate.',
  description: 'An independent review of records and evidence.',
  why: 'Without it, nobody can trust the numbers.',
};
const passage =
  'An audit is an independent check. The auditor reviews evidence.';

type R = ReactTestRenderer.ReactTestRenderer;
const allText = (r: R) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join(' | ');
const byId = (r: R, id: string) =>
  r.root.findAll(n => n.props.testID === id)[0];

async function render(
  extra: Partial<React.ComponentProps<typeof TutorSheet>> = {},
) {
  const props = {
    term,
    visible: true,
    bridge: createMockBridge(),
    getPassage: jest.fn(async () => passage),
    onClose: jest.fn(),
    onSolved: jest.fn(),
    onHint: jest.fn(),
    ...extra,
  };
  let r!: R;
  await act(async () => {
    r = ReactTestRenderer.create(<TutorSheet {...props} />);
  });
  return { r, props };
}

async function type(r: R, msg: string) {
  await act(async () => byId(r, 'tutor-input').props.onChangeText(msg));
  await act(async () => byId(r, 'tutor-input').props.onSubmitEditing());
}

test('greets with the clue and offers quick replies', async () => {
  const { r } = await render();
  expect(allText(r)).toContain('Stuck on "An independent check');
  expect(byId(r, 'tutor-quick-Give me a hint')).toBeDefined();
});

test('a question gets a guiding reply and counts as one hint', async () => {
  const { r, props } = await render();
  await type(r, 'help me');
  const all = allText(r);
  expect(all).toContain('help me');
  expect(all).toContain('What does your passage say');
  expect(props.onHint).toHaveBeenCalledTimes(1);
  expect(props.onSolved).not.toHaveBeenCalled();
  expect(props.getPassage).toHaveBeenCalledWith(term);
});

test('the model gets the masked passage, the device token limit and high priority', async () => {
  const bridge = createMockBridge();
  const spy = jest.spyOn(bridge, 'complete');
  const { r } = await render({ bridge, tutorTokens: 60 });
  await type(r, 'help me');
  const opts = spy.mock.calls[0][0];
  expect(opts.messages[0].content).toContain('_____');
  expect(opts.messages[0].content.toLowerCase()).not.toContain('audit');
  expect(opts.n_predict).toBe(60);
  expect(opts.priority).toBe('high');
});

test('quick-reply chips send their text', async () => {
  const { r, props } = await render();
  await act(async () => byId(r, 'tutor-quick-Pa-hint po').props.onPress());
  expect(allText(r)).toContain('Pa-hint po');
  expect(props.onHint).toHaveBeenCalledTimes(1);
});

test('later messages include the earlier turns as history', async () => {
  const bridge = createMockBridge();
  const spy = jest.spyOn(bridge, 'complete');
  const { r } = await render({ bridge });
  await type(r, 'first question');
  await type(r, 'second question');
  const roles = spy.mock.calls[1][0].messages.map(m => m.role);
  expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
});

test('typing the answer solves it with no model call', async () => {
  const bridge = createMockBridge();
  const spy = jest.spyOn(bridge, 'complete');
  const { r, props } = await render({ bridge });
  await type(r, 'is it audit?');
  expect(props.onSolved).toHaveBeenCalledTimes(1);
  expect(spy).not.toHaveBeenCalled();
  expect(allText(r)).toContain('Tama! The answer is audit.');
  expect(byId(r, 'tutor-input')).toBeUndefined(); // input hidden once solved
  expect(props.onHint).not.toHaveBeenCalled();
});

test('the student never sees a reply that leaks the answer', async () => {
  const leaky: AiBridge = {
    ...createMockBridge(),
    async complete(o) {
      const text = 'Fine, the answer is audit, okay?';
      for (const word of text.split(' ')) o.onToken?.(word + ' ');
      return text;
    },
  };
  const { r } = await render({ bridge: leaky });
  await type(r, 'just tell me');
  const all = allText(r);
  expect(all).toContain('starts with "A" and has 5 letters'); // template fallback
  expect(all.replace(term.clue, '').toLowerCase()).not.toMatch(
    /the answer is audit/,
  );
});

test('a model error shows a message and the input stays usable', async () => {
  const bridge = createMockBridge();
  bridge.complete = () => Promise.reject(new Error('model not loaded'));
  const { r } = await render({ bridge });
  await type(r, 'help');
  expect(allText(r)).toContain("couldn't answer");
  expect(byId(r, 'tutor-input').props.editable).toBe(true);
});

test('a missing passage falls back to the description instead of failing', async () => {
  const bridge = createMockBridge();
  const spy = jest.spyOn(bridge, 'complete');
  const { r } = await render({ bridge, getPassage: undefined }); // default: getChunk (mocked DB is empty)
  await type(r, 'help');
  expect(spy.mock.calls[0][0].messages[0].content).toContain(
    'An independent review of records',
  );
});

test('the first question waits for the passage to load', async () => {
  const bridge = createMockBridge();
  const spy = jest.spyOn(bridge, 'complete');
  let release!: (s: string) => void;
  const getPassage = jest.fn(() => new Promise<string>(res => (release = res)));
  const { r } = await render({ bridge, getPassage });
  await act(async () => byId(r, 'tutor-input').props.onChangeText('help'));
  await act(async () => {
    byId(r, 'tutor-input').props.onSubmitEditing();
  });
  expect(spy).not.toHaveBeenCalled();
  await act(async () => release(passage));
  expect(spy.mock.calls[0][0].messages[0].content).toContain(
    'independent check',
  );
});

test('closing stops a reply in progress, and the sheet is usable when reopened', async () => {
  const bridge = createMockBridge({ delayMs: 30 });
  const stop = jest.spyOn(bridge, 'stopGeneration');
  const { r, props } = await render({ bridge });
  await act(async () => byId(r, 'tutor-input').props.onChangeText('help'));
  await act(async () => {
    byId(r, 'tutor-input').props.onSubmitEditing();
  });
  expect(byId(r, 'tutor-pending')).toBeDefined();

  await act(async () => byId(r, 'tutor-close').props.onPress());
  expect(stop).toHaveBeenCalled();
  expect(props.onClose).toHaveBeenCalledTimes(1);

  // Let the stopped reply wind down, then reopen.
  await act(async () => {
    await new Promise(res => setTimeout(res, 100));
  });
  await act(async () => r.update(<TutorSheet {...props} visible={false} />));
  await act(async () => r.update(<TutorSheet {...props} visible />));
  expect(byId(r, 'tutor-pending')).toBeUndefined();
  expect(byId(r, 'tutor-input').props.editable).toBe(true);
  expect(allText(r)).not.toContain('What does your passage say'); // the late reply was dropped
});

test('a new term starts a fresh conversation', async () => {
  const { r, props } = await render();
  await type(r, 'help me');
  const next: TermRow = {
    ...term,
    id: 't2',
    term: 'firewall',
    answer: 'FIREWALL',
    clue: 'Filters traffic.',
  };
  await act(async () => r.update(<TutorSheet {...props} term={next} />));
  const all = allText(r);
  expect(all).not.toContain('help me');
  expect(all).toContain('Stuck on "Filters traffic."');
});
