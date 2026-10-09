/// <reference types="node" />
/**
 * Term-extraction benchmark against a llama-server on the laptop, using the
 * app's own prompt, schema, chunker and validator. See scripts/bench/README.md.
 *
 *   LLAMA_URL=http://127.0.0.1:8089 RUNS=3 LABEL="v1 prompt" npx jest -c jest.bench.config.js
 */
import fs from 'fs';
import path from 'path';
import type { AiBridge, DeviceTier } from '../../src/types';
import { extractTerms, reviewTerms } from '../../src/services/ai/termExtractor';
import { parseJsonObject } from '../../src/services/ai/modelJson';
import { chunk, cleanOcr } from '../../src/services/ingest/chunker';
import { PROFILES } from '../../src/services/device/deviceProfile';

const URL = process.env.LLAMA_URL ?? 'http://127.0.0.1:8089';
const RUNS = Number(process.env.RUNS ?? 3);
const LABEL = process.env.LABEL ?? 'current prompt';
const profile = PROFILES[(process.env.TIER ?? 'android-cpu') as DeviceTier];
const OVERLAP = 30;

const PAGES_DIR = path.join(__dirname, 'pages');
const OUT_DIR = path.join(__dirname, 'out');
const REPORT = path.join(__dirname, '..', '..', 'docs', 'bench', 'extraction-laptop.md');

type Call = { raw: string; ms: number; tps: number; truncated: boolean };

function serverBridge(calls: Call[]): AiBridge {
  return {
    async complete(o) {
      const t0 = Date.now();
      const res = await fetch(`${URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: o.messages,
          max_tokens: o.n_predict,
          temperature: o.temperature,
          ...(o.jsonSchema
            ? { response_format: { type: 'json_schema', json_schema: { name: 'out', schema: o.jsonSchema } } }
            : {}),
        }),
      });
      if (!res.ok) throw new Error(`llama-server ${res.status}: ${await res.text()}`);
      const j: any = await res.json();
      const raw: string = j.choices?.[0]?.message?.content ?? '';
      calls.push({
        raw,
        ms: Date.now() - t0,
        tps: j.timings?.predicted_per_second ?? 0,
        truncated: j.choices?.[0]?.finish_reason === 'length',
      });
      return raw;
    },
    stopGeneration() {},
    async embed() {
      throw new Error('not used by this benchmark');
    },
  };
}

type PageResult = {
  page: string;
  chunks: number;
  calls: number;
  parsed: number; // complete JSON object with a terms list
  salvaged: number; // cut off mid-JSON, finished terms recovered
  truncated: number;
  rawTerms: number;
  keptUnique: string[][]; // per run
  reasons: Record<string, number>;
  rejected: { term: string; clue: string; reason: string }[];
  kept: { term: string; clue: string }[]; // first run, for reading quality
  secPerChunk: number;
  tps: number;
};

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-');
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

test(`term extraction: ${LABEL}`, async () => {
  const health = await fetch(`${URL}/health`).catch(() => null);
  if (!health?.ok) throw new Error(`llama-server is not reachable at ${URL}`);
  const models: any = await (await fetch(`${URL}/v1/models`)).json();
  const modelName = path.basename(String(models?.data?.[0]?.id ?? 'unknown'));

  const pages = fs.readdirSync(PAGES_DIR).filter((f: string) => f.endsWith('.txt')).sort();
  const results: PageResult[] = [];
  const rawLog: unknown[] = [];

  for (const page of pages) {
    const text = cleanOcr(fs.readFileSync(path.join(PAGES_DIR, page), 'utf8'));
    const parts = chunk(text, profile.chunkWords, OVERLAP);
    const calls: Call[] = [];
    const bridge = serverBridge(calls);
    const r: PageResult = {
      page,
      chunks: parts.length,
      calls: 0,
      parsed: 0,
      salvaged: 0,
      truncated: 0,
      rawTerms: 0,
      keptUnique: [],
      reasons: {},
      rejected: [],
      kept: [],
      secPerChunk: 0,
      tps: 0,
    };

    for (let run = 0; run < RUNS; run++) {
      const answers = new Set<string>();
      for (let i = 0; i < parts.length; i++) {
        const kept = await extractTerms(bridge, `${page}:${i}`, parts[i], {
          maxTerms: profile.termsPerChunk,
          n_predict: profile.extractTokens,
        });
        const call = calls[calls.length - 1];
        const reviewed = reviewTerms(call.raw, parts[i]); // the app's own validator
        rawLog.push({ page, run, chunk: i, ...call });
        r.calls++;
        if (call.truncated) r.truncated++;
        if (Array.isArray(parseJsonObject(call.raw)?.terms)) r.parsed++;
        else if (reviewed.length) r.salvaged++;
        for (const x of reviewed) {
          r.rawTerms++;
          if (x.reason) {
            r.reasons[x.reason] = (r.reasons[x.reason] ?? 0) + 1;
            if (run === 0) r.rejected.push({ term: x.term, clue: x.clue, reason: x.reason });
          }
        }
        for (const t of kept) {
          if (!answers.has(t.answer) && run === 0) r.kept.push({ term: t.term, clue: t.clue });
          answers.add(t.answer);
        }
      }
      r.keptUnique.push([...answers]);
    }
    r.secPerChunk = avg(calls.map(c => c.ms)) / 1000;
    r.tps = avg(calls.map(c => c.tps));
    results.push(r);
    console.log(`${page}: ${r.keptUnique.map(a => a.length).join('/')} terms per run`);
  }

  // Raw outputs, for reading what the model actually wrote. Not committed.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}.json`), JSON.stringify({ LABEL, modelName, profile, rawLog }, null, 2));

  // Report, appended so prompt versions can be compared.
  const all = (f: (r: PageResult) => number) => results.reduce((s, r) => s + f(r), 0);
  const perPage = results.flatMap(r => r.keptUnique.map(a => a.length));
  const reasons: Record<string, number> = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r.reasons)) reasons[k] = (reasons[k] ?? 0) + v;
  }
  const lines = [
    `## ${LABEL}`,
    '',
    `${new Date().toLocaleString('en-PH')} · model \`${modelName}\` · laptop CPU via llama-server · ` +
      `profile \`${profile.tier}\` (${profile.chunkWords}-word chunks, ${profile.termsPerChunk} terms/chunk, ` +
      `${profile.extractTokens} max tokens) · ${RUNS} runs per page`,
    '',
    '| Page | Chunks | JSON parsed | Salvaged | Cut off at max tokens | Valid unique terms per run | Sec/chunk | Tok/s |',
    '|---|---|---|---|---|---|---|---|',
    ...results.map(
      r =>
        `| ${r.page} | ${r.chunks} | ${pct(r.parsed, r.calls)} | ${r.salvaged} | ${r.truncated}/${r.calls} | ` +
        `${r.keptUnique.map(a => a.length).join(', ')} | ${r.secPerChunk.toFixed(1)} | ${r.tps.toFixed(1)} |`,
    ),
    '',
    `**Totals:** JSON parsed ${pct(all(r => r.parsed), all(r => r.calls))} · ` +
      `${perPage.filter(n => n >= 6).length}/${perPage.length} page-runs reached 6+ terms ` +
      `(min ${Math.min(...perPage)}, mean ${avg(perPage).toFixed(1)}) · ` +
      `${all(r => r.rawTerms)} terms proposed, rejected: ${JSON.stringify(reasons)}`,
    '',
    '<details><summary>Kept and rejected terms (run 1)</summary>',
    '',
    ...results.flatMap(r => [
      `**${r.page}**`,
      '',
      ...r.kept.map(k => `- ✅ **${k.term}**: ${k.clue}`),
      ...r.rejected.map(k => `- ❌ ${k.reason}: **${k.term}**: ${k.clue}`),
      '',
    ]),
    '</details>',
    '',
  ];
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  if (!fs.existsSync(REPORT)) {
    fs.writeFileSync(
      REPORT,
      '# Term extraction on the laptop\n\nPrompt-tuning numbers from llama-server on a laptop CPU. ' +
        'Quality numbers (parse rate, terms per page) carry over to the phones; speed does not. ' +
        'Phone speed comes from DevBench.\n\n',
    );
  }
  fs.appendFileSync(REPORT, lines.join('\n') + '\n');
  console.log(lines.slice(0, 12).join('\n'));
});
