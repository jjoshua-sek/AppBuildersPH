import { chunk, cleanOcr } from '../chunker';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('chunk', () => {
  test('empty text gives no chunks', () => {
    expect(chunk('   \n ')).toEqual([]);
  });

  test('short text is one chunk', () => {
    expect(chunk(words(50))).toHaveLength(1);
  });

  test('windows overlap and cover every word', () => {
    const parts = chunk(words(400), 180, 30);
    expect(parts).toHaveLength(3); // starts at 0, 150, 300
    expect(parts[1].split(' ')[0]).toBe('w150');
    expect(parts[2].split(' ').pop()).toBe('w399');
  });

  test('rejects settings that would loop forever', () => {
    expect(() => chunk('a b', 10, 10)).toThrow();
  });
});

test('cleanOcr re-joins hyphenated line breaks and squeezes spaces', () => {
  expect(cleanOcr('authen-\ntication   is\n\n\n\nkey')).toBe('authentication is\n\nkey');
});
