import { fuzzySpans, leaks, maskTerm, MASK } from '../leakGuard';
import { rejectReason } from '../termExtractor';

// Real ML Kit output from a phone photo of a biology handout (Infinix test of #11).
const OCR = `Chloroplast: Contains thylakolds saclike photosynthetic membranes
Thylakolds: Arranged in stacks known as grana, singular stack is called granum
The Light-Dependent Reactions: Takes place within the thylakotd membrane
The Light-Independent Reaction/ Calvin Cycle: Takes plaoe in the stroma
Blectron Carriers: When electrons in chlorophyll absorb sunlight
o Bxample of Carrier Moleoules is NADP
These oompounds provide the energy to build energy-oontaining sugars`;

describe('terms the model spells correctly but OCR got wrong', () => {
  test.each([
    ['thylakoid', 'Flattened sacs inside the chloroplast where light is captured.'],
    ['molecules', 'Small units of matter that carry electrons in the cell.'],
    ['compounds', 'Substances that provide energy to build sugars in the cell.'],
  ])('%s is accepted as in the notes', (term, clue) => {
    expect(rejectReason(term, clue, OCR)).toBeNull();
  });

  test('words that are really absent are still rejected', () => {
    expect(rejectReason('mitochondria', 'The organelle that releases energy from food.', OCR)).toBe(
      'not in the notes',
    );
  });
});

describe('the tutor never sees or shows the misspelled answer', () => {
  test('masks the OCR variants of the term', () => {
    const masked = maskTerm(OCR, 'thylakoid');
    expect(masked).not.toMatch(/thylak/i);
    expect(masked.split(MASK).length - 1).toBe(3);
  });

  test('a reply containing the OCR spelling counts as a leak', () => {
    expect(leaks('Look at the thylakold membrane in your notes.', 'thylakoid')).toBe(true);
  });
});

describe('typo matching stays strict for short and unrelated words', () => {
  test.each([
    ['audit', 'listen to the audio', false], // under 6 letters: exact only
    ['control', 'the patrol came by', false],
    ['stroma', 'the strma opened', true], // one missing letter in a 6-letter word
    ['photosynthesis', 'photosyntesis happens here', true],
  ])('%s in "%s" -> %s', (term, text, expected) => {
    expect(fuzzySpans(text, term).length > 0).toBe(expected);
  });
});
