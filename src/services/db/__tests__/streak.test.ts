import { streakFrom } from '../queries';

const now = new Date(2026, 9, 9, 12); // 9 Oct 2026, local

it('counts consecutive days ending today', () => {
  expect(streakFrom(['2026-10-09', '2026-10-08', '2026-10-07'], now)).toBe(3);
});

it('still counts a streak that ended yesterday', () => {
  expect(streakFrom(['2026-10-08', '2026-10-07'], now)).toBe(2);
});

it('stops at a gap and is 0 with no recent play', () => {
  expect(streakFrom(['2026-10-09', '2026-10-07'], now)).toBe(1);
  expect(streakFrom(['2026-10-01'], now)).toBe(0);
  expect(streakFrom([], now)).toBe(0);
});
