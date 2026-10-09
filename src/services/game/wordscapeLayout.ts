export type WheelLayout = {
  size: number;
  letterSize: number;
  positions: { x: number; y: number }[];
};

const PADDING = 8;
const GAP = 6;

/** Fit a single ring first; use separated rings only when letters would become too small. */
export function layoutLetterWheel(count: number, maxSize: number): WheelLayout {
  const limit = Math.max(80, maxSize);
  if (!count) return { size: 0, letterSize: 0, positions: [] };
  const preferred = count <= 6 ? 60 : count <= 10 ? 54 : 48;
  const sine = Math.sin(Math.PI / Math.max(2, count));
  const singleSize = Math.floor(
    (limit - PADDING * 2 - GAP / sine) / (1 + 1 / sine),
  );
  if (singleSize >= 32 || count <= 18) {
    const letterSize = Math.max(1, Math.min(preferred, singleSize));
    const radius = count === 1 ? 0 : (letterSize + GAP) / (2 * sine);
    const size = Math.min(
      limit,
      Math.ceil(2 * radius + letterSize + PADDING * 2),
    );
    const center = size / 2;
    return {
      size,
      letterSize,
      positions: Array.from({ length: count }, (_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
        return {
          x: center + Math.cos(angle) * radius,
          y: center + Math.sin(angle) * radius,
        };
      }),
    };
  }

  // Ring capacities use chord distances, not circumference approximations.
  const ringsFor = (diameter: number) => {
    const rings: { radius: number; capacity: number }[] = [];
    for (
      let radius = limit / 2 - diameter / 2 - PADDING;
      radius >= diameter + GAP;
      radius -= diameter + GAP
    ) {
      const capacity = Math.floor(
        Math.PI / Math.asin((diameter + GAP) / (2 * radius)),
      );
      rings.push({ radius, capacity });
    }
    rings.push({ radius: 0, capacity: 1 });
    return rings;
  };
  let letterSize = preferred;
  while (
    letterSize > 8 &&
    ringsFor(letterSize).reduce((sum, ring) => sum + ring.capacity, 0) < count
  )
    letterSize -= 1;
  const center = limit / 2;
  const positions: { x: number; y: number }[] = [];
  for (const ring of ringsFor(letterSize)) {
    const remaining = count - positions.length;
    if (!remaining) break;
    const take = Math.min(remaining, ring.capacity);
    for (let i = 0; i < take; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / take;
      const radius = take === 1 ? 0 : ring.radius;
      positions.push({
        x: center + Math.cos(angle) * radius,
        y: center + Math.sin(angle) * radius,
      });
    }
  }
  return { size: limit, letterSize, positions };
}

/** Balance rows instead of leaving a short trailing row (14 letters → 7 + 7). */
export function layoutAnswerRows(count: number, width: number) {
  const maxColumns = Math.max(1, Math.floor((width + 5) / 35));
  const rowCount = Math.max(1, Math.ceil(count / maxColumns));
  const base = Math.floor(count / rowCount);
  const extra = count % rowCount;
  let offset = 0;
  return Array.from({ length: rowCount }, (_, row) => {
    const indices = Array.from(
      { length: base + (row < extra ? 1 : 0) },
      (_, i) => offset + i,
    );
    offset += indices.length;
    return indices;
  });
}
