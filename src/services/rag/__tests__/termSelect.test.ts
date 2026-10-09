import { selectTerms, Candidate } from '../termSelect';

const unit = (...xs: number[]) => {
  const v = Float32Array.from(xs);
  const n = Math.hypot(...v);
  return v.map(x => x / n);
};
const c = (answer: string, chunkIdx: number, vec: Float32Array): Candidate => ({
  answer,
  chunkIdx,
  vec,
});

test('drops same answers and near-duplicate meanings', () => {
  const out = selectTerms([
    c('AUDITTRAIL', 0, unit(1, 0, 0)),
    c('AUDITLOG', 1, unit(0.99, 0.1, 0)), // same idea, different words
    c('AUDITTRAIL', 2, unit(0, 1, 0)),
    c('FIREWALL', 2, unit(0, 0, 1)),
  ]);
  expect(out.map(x => x.answer)).toEqual(['AUDITTRAIL', 'FIREWALL']);
});

test('covers every chunk before taking seconds from any one chunk', () => {
  const v = (i: number) =>
    unit(...Array.from({ length: 12 }, (_, j) => (j === i ? 1 : 0)));
  const cands = [
    c('A0', 0, v(0)),
    c('B0', 0, v(1)),
    c('C0', 0, v(2)),
    c('D0', 0, v(3)),
    c('A1', 1, v(4)),
    c('B1', 1, v(5)),
    c('A2', 2, v(6)),
  ];
  expect(selectTerms(cands, 5).map(x => x.answer)).toEqual([
    'A0',
    'A1',
    'A2',
    'B0',
    'B1',
  ]);
});
