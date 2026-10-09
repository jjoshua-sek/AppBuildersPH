/* eslint-env jest */
/* Native modules don't exist under Jest; use the libraries' own mocks where they ship one. */
jest.mock('llama.rn', () => require('llama.rn/jest/mock'));
jest.mock('react-native-device-info', () =>
  require('react-native-device-info/jest/react-native-device-info-mock'),
);
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/docs',
  ExternalDirectoryPath: '/external',
  exists: jest.fn(async () => false),
  mkdir: jest.fn(async () => {}),
  stat: jest.fn(async () => ({ size: 0 })),
}));
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => ({ execute: jest.fn(async () => ({ rows: [] })) }),
}));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
// Ships untranspiled TypeScript and needs the native camera; tests stub it.
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));
