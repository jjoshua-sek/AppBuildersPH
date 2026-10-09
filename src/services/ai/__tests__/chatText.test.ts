import { stripTurnMarkers, turnMarkerFilter } from '../chatText';

test('strips the Gemma turn marker the Infinix printed before its JSON', () => {
  const raw = '<start_of_turn>model\n```json\n{"terms": []}\n```<end_of_turn>';
  expect(stripTurnMarkers(raw)).toBe('```json\n{"terms": []}\n```');
});

test('leaves normal text alone', () => {
  expect(stripTurnMarkers('What does the model in your notes say?')).toBe(
    'What does the model in your notes say?',
  );
});

test('streamed marker tokens never reach the screen', () => {
  const out: string[] = [];
  const push = turnMarkerFilter(t => out.push(t));
  for (const t of [
    '<start_of_turn>',
    'model',
    '\n',
    'Which',
    ' part',
    '<end_of_turn>',
  ])
    push(t);
  expect(out.join('')).toBe('\nWhich part');
});
