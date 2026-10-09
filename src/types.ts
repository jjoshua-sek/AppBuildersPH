/**
 * Shared contract between the four lanes. Change it only with the whole team's
 * agreement, in its own pull request.
 */

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * 'high' work (tutor replies) preempts 'low' work (background "why it matters"
 * generation). Ingest runs at 'normal'.
 */
export type Priority = 'high' | 'normal' | 'low';

export type CompleteOptions = {
  messages: Msg[];
  n_predict?: number;
  temperature?: number;
  jsonSchema?: object;
  priority?: Priority;
  onToken?: (token: string) => void;
};

/** Lane A provides it; lanes B and D call it. A mock exists for development. */
export interface AiBridge {
  complete(opts: CompleteOptions): Promise<string>;
  stopGeneration(): void;
  embed(text: string): Promise<Float32Array>;
}

/** Which phone class the app is running on; decides model and thread settings. */
export type DeviceTier =
  | 'ios-metal' // iPhone 13 Pro Max (A15): Metal GPU
  | 'ios-cpu' // iPhone 11 (A13): CPU only, 4 GB RAM
  | 'android-cpu'; // Infinix Hot 50 Pro+ (Helio G100): CPU only

/** Lane B writes these; lanes C and D read them. */
export type TermRow = {
  id: string;
  doc_id: string;
  chunk_id: string;
  term: string;
  answer: string; // A–Z only, e.g. "ACCESS CONTROL" -> "ACCESSCONTROL"
  clue: string; // never contains the term
  description: string | null; // shown after solving; may contain the term
  why: string | null; // "why it matters", shown after solving
};

/** Lane C opens the tutor with these props; lane D implements the component. */
export type TutorSheetProps = {
  term: TermRow;
  visible: boolean;
  onClose(): void;
  onSolved(): void;
};

/** Lane C writes attempts through lane B's helper. */
export type Attempt = {
  term_id: string;
  mode: 'crossword' | 'daily';
  correct: 0 | 1;
  hints_used: number;
  ts: number;
};
