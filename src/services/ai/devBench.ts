import type { AiBridge } from '../../types';
import { leaks, maskTerm } from './leakGuard';
import { tutorSystem } from './prompts';
import { reviewTerms, termSchema, validateTerms } from './termExtractor';
import { termSystem } from './prompts';
import { askTutor } from './tutor';
import { parseJsonObject } from './modelJson';

export type ExtractionResult = {
  chunks: number;
  parsed: number;
  validTerms: number;
  secondsPerChunk: number;
};

/** Term extraction on fixed chunks: JSON parse rate, valid terms, seconds per chunk. */
export async function benchExtraction(
  bridge: AiBridge,
  chunks: string[],
  opts: { maxTerms: number; n_predict: number },
  log: (s: string) => void = () => {},
): Promise<ExtractionResult> {
  let parsed = 0;
  let validTerms = 0;
  let totalMs = 0;
  for (let i = 0; i < chunks.length; i++) {
    const t0 = Date.now();
    const raw = await bridge.complete({
      messages: [
        { role: 'system', content: termSystem(opts.maxTerms) },
        { role: 'user', content: `Passage:\n${chunks[i]}` },
      ],
      jsonSchema: termSchema(opts.maxTerms),
      n_predict: opts.n_predict,
      temperature: 0.2,
    });
    const ms = Date.now() - t0;
    totalMs += ms;
    const ok = Array.isArray(parseJsonObject(raw)?.terms);
    const terms = validateTerms(raw, chunks[i], `bench:${i}`);
    parsed += ok ? 1 : 0;
    validTerms += terms.length;
    log(`chunk ${i + 1}: ${ok ? 'JSON ok' : 'JSON FAILED'}, ${terms.length} valid terms, ${(ms / 1000).toFixed(1)} s`);
    for (const r of reviewTerms(raw, chunks[i]).filter(x => x.reason)) {
      log(`  rejected "${r.term}": ${r.reason}`);
    }
    if (!ok || !terms.length) {
      // Show what the model actually wrote, so a failure can be diagnosed from the phone.
      const flat = raw.replace(/\s+/g, ' ');
      log(`  raw (${raw.length} chars): ${flat.slice(0, 160)}${flat.length > 160 ? ` … ${flat.slice(-80)}` : ''}`);
    }
  }
  return {
    chunks: chunks.length,
    parsed,
    validTerms,
    secondsPerChunk: chunks.length ? totalMs / chunks.length / 1000 : 0,
  };
}

export type LeakCase = { term: string; clue: string; passage: string };

export type LeakResult = {
  attempts: number;
  rawLeaks: number; // model output, no guard
  visibleLeaks: number; // what the student would see through askTutor (must be 0)
  fallbacks: number; // askTutor gave up and used the template
  avgReplySeconds: number;
};

const silentUi = { setText() {}, setStatus() {}, onSolved() {} };

/**
 * Tutor leak test: each case × each message, once without the guard (raw model
 * behaviour) and once through askTutor (what the student sees).
 */
export async function benchLeaks(
  bridge: AiBridge,
  cases: LeakCase[],
  messages: string[],
  opts: { n_predict: number },
  log: (s: string) => void = () => {},
): Promise<LeakResult> {
  const r: LeakResult = { attempts: 0, rawLeaks: 0, visibleLeaks: 0, fallbacks: 0, avgReplySeconds: 0 };
  let guardedMs = 0;
  for (const c of cases) {
    const masked = maskTerm(c.passage, c.term);
    for (const msg of messages) {
      r.attempts++;
      const raw = await bridge.complete({
        messages: [
          { role: 'system', content: tutorSystem(c.clue, masked) },
          { role: 'user', content: msg },
        ],
        n_predict: opts.n_predict,
        temperature: 0.7,
      });
      if (leaks(raw, c.term)) r.rawLeaks++;

      const t0 = Date.now();
      const shown = await askTutor(
        bridge,
        {
          id: 'bench',
          doc_id: 'bench',
          chunk_id: 'bench',
          term: c.term,
          answer: c.term.toUpperCase().replace(/[^A-Z]/g, ''),
          clue: c.clue,
          description: null,
          why: null,
        },
        c.passage,
        msg,
        [],
        silentUi,
        { n_predict: opts.n_predict },
      );
      guardedMs += Date.now() - t0;
      if (shown && leaks(shown, c.term)) r.visibleLeaks++;
      if (shown?.startsWith("Here's a nudge")) r.fallbacks++;
    }
    log(`${c.term}: ${r.attempts} attempts so far, raw leaks ${r.rawLeaks}, visible ${r.visibleLeaks}`);
  }
  r.avgReplySeconds = r.attempts ? guardedMs / r.attempts / 1000 : 0;
  return r;
}

export type SpeedResult = { threads: number; gpuLayers: number; promptTps: number; genTps: number };

export function formatReport(p: {
  device: string;
  tier: string;
  model: string;
  modelSizeMb: number;
  loadMs: number;
  backend: string;
  speed: SpeedResult[];
  extraction?: ExtractionResult;
  leak?: LeakResult;
}): string {
  const lines = [
    `### ${p.device} (${p.tier})`,
    '',
    `- Model: ${p.model} (${p.modelSizeMb} MB), load ${(p.loadMs / 1000).toFixed(1)} s, backend ${p.backend}`,
  ];
  if (p.speed.length) {
    lines.push('', '| Threads | GPU layers | Prompt tok/s | Generation tok/s |', '|---|---|---|---|');
    for (const s of p.speed) {
      lines.push(`| ${s.threads} | ${s.gpuLayers} | ${s.promptTps.toFixed(1)} | ${s.genTps.toFixed(1)} |`);
    }
  }
  if (p.extraction) {
    const e = p.extraction;
    lines.push(
      '',
      `- Extraction: JSON ${e.parsed}/${e.chunks}, ${(e.validTerms / Math.max(1, e.chunks)).toFixed(1)} valid terms/chunk, ${e.secondsPerChunk.toFixed(1)} s/chunk`,
    );
  }
  if (p.leak) {
    const l = p.leak;
    lines.push(
      `- Tutor: raw leaks ${l.rawLeaks}/${l.attempts}, **visible leaks ${l.visibleLeaks}/${l.attempts}**, fallbacks ${l.fallbacks}/${l.attempts}, ${l.avgReplySeconds.toFixed(1)} s/reply`,
    );
  }
  return lines.join('\n');
}
