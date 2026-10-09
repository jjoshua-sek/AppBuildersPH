import type { TermRow } from '../../types';
import terms from './sample_terms.json';

/**
 * Hand-written terms from `it_audit_ch1.txt` (doc_id "sample"). Lane C builds the
 * crossword from these until real ingested terms are in the DB. `chunk_id` is
 * "sample:<n>", where n is the chunk() index (180-word chunks) holding the term.
 */
export const SAMPLE_TERMS: TermRow[] = terms;
