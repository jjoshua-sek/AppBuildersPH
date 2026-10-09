import type { Attempt, TermRow } from '../../types';
import { todayKey } from '../game/dailyTerm';

export type DocRow = {
  id: string;
  title: string;
  source: 'paste' | 'camera' | 'sample';
  created_at: number;
};

export type ChunkRow = {
  id: string; // `${doc_id}:${idx}`
  doc_id: string;
  idx: number;
  text: string;
  embedding: Float32Array | null;
};

/**
 * Every read and write of decks goes through this, so lanes C and D never write
 * SQL. The in-memory version runs now; an op-sqlite version can replace it later
 * behind the same interface.
 */
export interface DeckStore {
  saveDoc(doc: DocRow): Promise<void>;
  saveChunk(chunk: ChunkRow): Promise<void>;
  /** Skips terms whose answer already exists in the same doc. Returns how many were added. */
  saveTerms(terms: TermRow[]): Promise<number>;
  /** Fills the "why it matters" card after the model writes it. */
  updateTermCard(termId: string, card: { description: string; why: string | null }): Promise<void>;
  listDocs(): Promise<DocRow[]>;
  getTerms(docId: string): Promise<TermRow[]>;
  getTerm(termId: string): Promise<TermRow | null>;
  getChunk(chunkId: string): Promise<ChunkRow | null>;
  logAttempt(attempt: Attempt): Promise<void>;
  /** The day's term for a deck. Picked once per day, then kept. */
  getDailyTerm(docId: string, now?: number): Promise<TermRow | null>;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Same rule as PICK_DAILY_SQL: answers of 4–10 letters, most misses in the last
 * 7 days first, then the term seen least recently (never-seen first).
 * Ties keep the deck's order.
 */
export function pickDailyTerm(terms: TermRow[], attempts: Attempt[], now: number): TermRow | null {
  const since = now - WEEK_MS;
  const ranked = terms
    .filter(t => t.answer.length >= 4 && t.answer.length <= 10)
    .map((t, order) => {
      const recent = attempts.filter(a => a.term_id === t.id && a.ts > since);
      const misses = recent.filter(a => a.correct === 0).length;
      const lastSeen = recent.length ? Math.max(...recent.map(a => a.ts)) : -Infinity;
      return { t, order, misses, lastSeen };
    })
    .sort((a, b) => b.misses - a.misses || a.lastSeen - b.lastSeen || a.order - b.order);
  return ranked[0]?.t ?? null;
}

export function createMemoryStore(): DeckStore {
  const docs = new Map<string, DocRow>();
  const chunks = new Map<string, ChunkRow>();
  const terms = new Map<string, TermRow>();
  const attempts: Attempt[] = [];
  const daily = new Map<string, string>(); // `${day}|${docId}` -> term id

  const termsOf = (docId: string) => [...terms.values()].filter(t => t.doc_id === docId);

  return {
    async saveDoc(doc) {
      docs.set(doc.id, { ...doc });
    },
    async saveChunk(chunk) {
      chunks.set(chunk.id, { ...chunk });
    },
    async saveTerms(rows) {
      let added = 0;
      for (const row of rows) {
        const taken = termsOf(row.doc_id).some(t => t.answer === row.answer);
        if (taken || terms.has(row.id)) continue;
        terms.set(row.id, { ...row });
        added++;
      }
      return added;
    },
    async updateTermCard(termId, card) {
      const t = terms.get(termId);
      if (t) terms.set(termId, { ...t, description: card.description, why: card.why });
    },
    async listDocs() {
      return [...docs.values()].sort((a, b) => b.created_at - a.created_at);
    },
    async getTerms(docId) {
      return termsOf(docId).map(t => ({ ...t }));
    },
    async getTerm(termId) {
      const t = terms.get(termId);
      return t ? { ...t } : null;
    },
    async getChunk(chunkId) {
      const c = chunks.get(chunkId);
      return c ? { ...c } : null;
    },
    async logAttempt(attempt) {
      attempts.push({ ...attempt });
    },
    async getDailyTerm(docId, now = Date.now()) {
      const key = `${todayKey(new Date(now))}|${docId}`;
      const saved = daily.get(key);
      if (saved && terms.has(saved)) return { ...terms.get(saved)! };
      const pick = pickDailyTerm(termsOf(docId), attempts, now);
      if (pick) daily.set(key, pick.id);
      return pick ? { ...pick } : null;
    },
  };
}

/** The app's one store. Lanes C and D import this. */
export const store: DeckStore = createMemoryStore();
