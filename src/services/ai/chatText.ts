/**
 * Chat-template markers a model can print as text when the prompt didn't end
 * with its own turn marker (Gemma: "<start_of_turn>model"). They must never
 * reach the student or the JSON parser.
 */
const MARKERS =
  /<\/?(start_of_turn|end_of_turn|bos|eos|s)>|<\|(im_start|im_end|eot_id|endoftext|start_header_id|end_header_id)\|>/g;

/** Removes turn markers and the role name that follows a start marker. */
export const stripTurnMarkers = (s: string) =>
  s
    .replace(/(<start_of_turn>|<\|im_start\|>)\s*(model|assistant)\b\s*/g, '')
    .replace(MARKERS, '');

/** Filters streamed tokens the same way; feed every token through `push`. */
export function turnMarkerFilter(emit: (token: string) => void) {
  let afterStart = false;
  return (token: string) => {
    if (/^(<start_of_turn>|<\|im_start\|>)$/.test(token.trim())) {
      afterStart = true;
      return;
    }
    if (afterStart && /^\s*(model|assistant)\s*$/.test(token)) {
      afterStart = false;
      return;
    }
    afterStart = false;
    const clean = token.replace(MARKERS, '');
    if (clean) emit(clean);
  };
}
