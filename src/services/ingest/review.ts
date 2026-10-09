import type { TermRow } from '../../types';
import { leaks } from '../ai/leakGuard';
import { MAX_ANSWER, toAnswer } from '../ai/termExtractor';
import {
  answerTaken,
  deleteTerm,
  getSelectedTerms,
  getTerm,
  getTerms,
  setSelectedTerms,
  updateTerm,
} from '../db/queries';
import { MAX_PUZZLE_TERMS } from './pipeline';

/**
 * The student's review of extracted terms before playing: fix what OCR misread
 * ("NADPt" -> "NADP"), rewrite a weak clue, drop a junk term, or pull in a term
 * the selection left out.
 *
 * Edits use the extractor's rules except "appears in the notes": the point of an
 * edit is often to correct what the photo got wrong.
 */

export type TermEdit = { term: string; clue: string };

/** Why an edit can't be saved, in words for the student; null when it's fine. */
export function editProblem({ term, clue }: TermEdit): string | null {
  const t = term.trim();
  const c = clue.trim();
  const answer = toAnswer(t);
  const words = c.split(/\s+/).filter(Boolean).length;
  if (!/^[A-Za-z][A-Za-z -]*$/.test(t)) {
    return 'Use letters only (spaces and hyphens are fine).';
  }
  if (answer.length < 3) return 'The answer needs at least 3 letters.';
  if (answer.length > MAX_ANSWER) {
    return `The answer can have at most ${MAX_ANSWER} letters.`;
  }
  if (words < 4) return 'Write a clue of at least 4 words.';
  if (words > 22) return 'Keep the clue to 22 words or fewer.';
  if (leaks(c, t)) return 'The clue gives the answer away.';
  return null;
}

export class ReviewError extends Error {}

/** Saves an edit, or throws a ReviewError with a message for the student. */
export async function editTerm(id: string, edit: TermEdit): Promise<TermRow> {
  const problem = editProblem(edit);
  if (problem) throw new ReviewError(problem);
  const current = await getTerm(id);
  if (!current) throw new ReviewError('This term no longer exists.');
  const term = edit.term.trim().replace(/\s+/g, ' ');
  const answer = toAnswer(term);
  if (await answerTaken(current.doc_id, answer, id)) {
    throw new ReviewError('Another term in this deck already has that answer.');
  }
  await updateTerm(id, { term, answer, clue: edit.clue.trim() });
  return (await getTerm(id))!;
}

/**
 * Deletes a term. If it was in the puzzle, the next extracted term not yet in
 * the puzzle takes its place, so the crossword keeps its size.
 */
export async function removeTerm(id: string): Promise<void> {
  const current = await getTerm(id);
  if (!current) return;
  const selected = (await getSelectedTerms(current.doc_id)).map(t => t.id);
  await deleteTerm(id);
  if (!selected.includes(id)) return;
  const keep = selected.filter(x => x !== id);
  const replacement = (await getTerms(current.doc_id)).find(
    t => !selected.includes(t.id),
  );
  await setSelectedTerms(
    current.doc_id,
    replacement ? [...keep, replacement.id] : keep,
  );
}

/** Adds a left-out term to the puzzle. Throws a ReviewError when the puzzle is full. */
export async function addToPuzzle(id: string): Promise<void> {
  const current = await getTerm(id);
  if (!current) throw new ReviewError('This term no longer exists.');
  const selected = (await getSelectedTerms(current.doc_id)).map(t => t.id);
  if (selected.includes(id)) return;
  if (selected.length >= MAX_PUZZLE_TERMS) {
    throw new ReviewError(
      `The puzzle already has ${MAX_PUZZLE_TERMS} terms. Delete one first.`,
    );
  }
  await setSelectedTerms(current.doc_id, [...selected, id]);
}
