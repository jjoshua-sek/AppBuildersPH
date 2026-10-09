/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { useAiStore } from '../src/store/useAiStore';

test('shows the model setup help when the model files are missing', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  expect(useAiStore.getState().status).toBe('error');
  expect(useAiStore.getState().error).toMatch(/Missing LLM/);
  expect(JSON.stringify(tree!.toJSON())).toContain('Choose LLM file');
});
