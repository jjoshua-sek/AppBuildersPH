import { layoutAnswerRows, layoutLetterWheel } from '../wordscapeLayout';

it.each([180, 220, 270, 320])(
  'fits and separates letters within a %i-point wheel',
  maxSize => {
    for (let count = 1; count <= 64; count++) {
      const layout = layoutLetterWheel(count, maxSize);
      expect(layout.positions).toHaveLength(count);
      expect(layout.size).toBeLessThanOrEqual(maxSize);
      for (const point of layout.positions) {
        expect(point.x - layout.letterSize / 2).toBeGreaterThanOrEqual(-0.01);
        expect(point.y - layout.letterSize / 2).toBeGreaterThanOrEqual(-0.01);
        expect(point.x + layout.letterSize / 2).toBeLessThanOrEqual(
          layout.size + 0.01,
        );
        expect(point.y + layout.letterSize / 2).toBeLessThanOrEqual(
          layout.size + 0.01,
        );
      }
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count; j++) {
          expect(
            Math.hypot(
              layout.positions[i].x - layout.positions[j].x,
              layout.positions[i].y - layout.positions[j].y,
            ),
          ).toBeGreaterThanOrEqual(layout.letterSize + 5.99);
        }
    }
  },
);

it('keeps fourteen letters on a single ring at phone width', () => {
  const layout = layoutLetterWheel(14, 300);
  const radii = layout.positions.map(point =>
    Math.hypot(point.x - layout.size / 2, point.y - layout.size / 2),
  );
  expect(layout.letterSize).toBeGreaterThanOrEqual(44);
  expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.01);
});

it('balances answer rows and preserves every letter in order', () => {
  expect(layoutAnswerRows(14, 328).map(row => row.length)).toEqual([7, 7]);
  for (const width of [240, 328, 400, 700])
    for (let count = 1; count <= 64; count++) {
      const rows = layoutAnswerRows(count, width);
      expect(rows.flat()).toEqual(Array.from({ length: count }, (_, i) => i));
      expect(
        Math.max(...rows.map(row => row.length)) -
          Math.min(...rows.map(row => row.length)),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.max(...rows.map(row => row.length)) * 35 - 5,
      ).toBeLessThanOrEqual(width);
    }
});
