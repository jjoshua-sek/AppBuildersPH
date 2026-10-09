module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // llama.rn's Jest mock loads its TypeScript source, which needs transforming.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|llama\\.rn|@react-navigation|react-native-screens|react-native-svg)/)',
  ],
};
