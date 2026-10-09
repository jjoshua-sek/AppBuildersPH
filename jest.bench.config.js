// Benchmarks that need a running llama-server. Not part of `npm test`.
module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/scripts/bench/**/*.bench.ts'],
  testTimeout: 60 * 60 * 1000,
};
