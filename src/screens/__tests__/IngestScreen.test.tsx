import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { IngestScreen } from '../IngestScreen';
import { useDeckStore } from '../../store/useDeckStore';

// The first render compiles React Native, which can pass Jest's 5 s default on a cold CI run.
jest.setTimeout(20000);

const render = async (onPlay = jest.fn()) => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<IngestScreen onBack={jest.fn()} onPlay={onPlay} />);
  });
  return r;
};
const button = (r: ReactTestRenderer.ReactTestRenderer, label: string) =>
  r.root.findAll(n => n.props.accessibilityRole === 'button' && n.findAllByType(Text).some(t => t.props.children === label))[0];

test('the generate button stays disabled until there are enough words', async () => {
  const r = await render();
  expect(button(r, 'Make my puzzle').props.disabled).toBe(true);
  const notes = r.root.findAllByType(TextInput)[1];
  await act(async () => notes.props.onChangeText('word '.repeat(60)));
  expect(button(r, 'Make my puzzle').props.disabled).toBe(false);
});

test('the sample handout loads a deck and opens it', async () => {
  const onPlay = jest.fn();
  const r = await render(onPlay);
  await act(async () => button(r, 'Use the sample IT Audit handout').props.onPress());
  expect(useDeckStore.getState().currentDocId).toBe('sample-it-audit');
  expect(onPlay).toHaveBeenCalledWith('sample-it-audit');
});
