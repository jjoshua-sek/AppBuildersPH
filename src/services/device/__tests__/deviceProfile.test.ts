import { detectTier, profileFor } from '../deviceProfile';

test.each([
  ['ios', 'iPhone14,3', 'ios-metal'], // iPhone 13 Pro Max (A15)
  ['ios', 'iPhone12,1', 'ios-cpu'], // iPhone 11 (A13)
  ['ios', 'iPhone13,2', 'ios-metal'], // iPhone 12 (A14), first Apple7 GPU
  ['android', 'X6880', 'android-cpu'], // Infinix Hot 50 Pro+
  ['android', 'LG7n', 'android-cpu'], // Tecno Pova 4
  ['ios', 'unknown', 'ios-cpu'],
])('%s %s -> %s', (os, id, tier) => {
  expect(detectTier(os, id)).toBe(tier);
});

test('only the Metal tier offloads layers to the GPU', () => {
  expect(profileFor('ios', 'iPhone14,3').n_gpu_layers).toBe(99);
  expect(profileFor('ios', 'iPhone12,1').n_gpu_layers).toBe(0);
  expect(profileFor('android', 'X6880').n_gpu_layers).toBe(0);
});
