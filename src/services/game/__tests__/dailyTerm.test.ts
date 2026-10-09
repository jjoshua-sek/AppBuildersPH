import { scoreGuess, isValidGuess } from '../dailyTerm';

describe('scoreGuess', () => {
  test.each([
    ['AUDIT', 'AUDIT', 'GGGGG'],
    ['LEVEL', 'EAGLE', 'YYXYX'],
    ['EAGLE', 'LEVEL', 'YXXYY'],
    ['SPEED', 'ABIDE', 'XXYXY'],
    ['ERASE', 'SPEED', 'YXXYY'],
    ['ROBOT', 'TOKEN', 'XGXXY'],
    ['OOOOO', 'TOKEN', 'XGXXX'],
  ])('%s vs answer %s -> %s', (guess, answer, marks) => {
    expect(scoreGuess(guess, answer).join('')).toBe(marks);
  });
});

describe('isValidGuess', () => {
  test('accepts any A–Z word of the right length, including acronyms', () => {
    expect(isValidGuess('ISACA', 5)).toBe(true);
    expect(isValidGuess('COBIT', 5)).toBe(true);
    expect(isValidGuess('COBI', 5)).toBe(false);
    expect(isValidGuess('COB1T', 5)).toBe(false);
  });
});
