import type { TermRow } from '../../types';
import terms from './sample_terms.json';

export { SAMPLE_TEXT, SAMPLE_TITLE } from './it_audit_ch1';

/**
 * Hand-written terms from SAMPLE_TEXT (doc_id "sample"). Lane C builds the
 * crossword from these until real ingested terms are in the DB. `chunk_id` is
 * "sample:<n>", where n is the chunk() index (180-word chunks) holding the term.
 */
export const SAMPLE_TERMS: TermRow[] = terms;
