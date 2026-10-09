# Backpack Tutor — Build Spec (v3, corrected)

> An offline study app for students. **On-device AI reads your own handouts, turns them into crossword puzzles, and coaches you with a Socratic tutor that never gives the answer away.** Everything works in airplane mode.

| | |
|---|---|
| Repo | `github.com/jjoshua-sek/AppBuildersPH` |
| Platform | Android (arm64), bare React Native CLI, New Architecture |
| Hackathon theme | Local AI: "useful when the cloud disappears" |
| Status | **This is the build spec.** Every error found in the original Gemini spec and in the v2 review is fixed below (§0). Start coding from §8. |

---

## 0. Changelog — every error fixed

### 0.1 The four score-critical problems
| # | Problem | Criterion hit | Fix (where) |
|---|---|---|---|
| **P1** | Local AI wasn't fundamental: the games ran on word lists and anagram search, and the LLM only gave hints | Local AI 25% | The LLM now **creates all puzzle content** from the student's notes: terms, clues, and the daily term. Three on-device models run in the core loop. (§3) |
| **P2** | The anagram-wheel mode taught dictionary words, not the subject | Problem & Usefulness 25% | Replaced with a **Notes Crossword** whose clues are generated from the notes (active recall). Daily mode is now variable-length and adaptive. (§4) |
| **P3** | The tutor would leak the answer (a prompt-only "NEVER reveal" rule on a 1–2B model, with the raw term in its context) | Innovation / Demo 30% | **Three layers:** the term is masked in the model's context (including word variants), a streaming guard holds back text and stops generation on a leak, then a retry and a template fallback. Correct answers typed to the tutor are intercepted. (§8.8) |
| **P4** | Outdated or wrong stack | Technical Execution 20% | New model shortlist **in Q4_0** (the only 4-bit format the Android GPU path runs), ML Kit bundled OCR, op-sqlite + FTS5, arctic-embed GGUF, prebuilt llama.rn binaries. (§5, §6) |

### 0.2 Errors in the original Gemini spec
| # | Original | Problem | Fixed to |
|---|---|---|---|
| 1 | Mode 1 term extraction: "local LLM **or** a rule-based parser" | Makes AI optional | LLM-only, JSON-schema-constrained, validated in code (§8.5) |
| 2 | Anagram permutations from a 7–9-letter root | Generic words, no learning | Notes Crossword (§4.1) |
| 3 | Fixed 5-letter targets from a hand-curated `it_audit_5letter.json` | Few course terms are 5 letters; can't use the student's material | Daily Term: 4–10 letters, picked from the student's missed terms (§4.2) |
| 4 | Guesses validated against a 10,657-word English list | Rejects valid course terms (e.g., ISACA, COBIT) | Accept any A–Z guess of the right length (§8.7) |
| 5 | Tutor prompt receives `{PUZZLE_KEYWORD}` and the raw chunk | The model sees the answer twice, so it leaks | Masked context, no raw term (§8.8) |
| 6 | "NEVER reveal" enforced only by the prompt | Small models ignore it | Code-level StreamGuard (§8.8) |
| 7 | Llama-3.2-1B Q4_K_M | Two generations old; **K-quants don't run on the Android GPU path** | Q4_0 shortlist benchmarked in hour 1 (§5) |
| 8 | "Offloads to mobile NPUs/GPUs" via OpenCL/Vulkan | OpenCL is the GPU path (Adreno only); NPU support is experimental | "GPU via OpenCL on Snapdragon/Adreno 7xx, CPU fallback", shown live (§8.9) |
| 9 | GGUFs in `android/.../assets/models` and `metro.config.js` bundling `.gguf` | Metro is a JS bundler; APK assets are compressed and can't be memory-mapped; first-run copy doubles storage | `adb push` to the app's external files dir (§10.4) |
| 10 | `build.gradle` "configured for NDK & CMake" + `CMakeLists.txt` | Unneeded: llama.rn downloads prebuilt native libraries on install | Removed (§10) |
| 11 | iOS: Podfile, Metal, symlinked weights | Second toolchain, Mac + real device needed | Android only; iOS listed as future work |
| 12 | `react-native-quick-sqlite` | Deprecated by its maintainers | `@op-engineering/op-sqlite` with `fts5` (§8.6) |
| 13 | `bge-micro-v2.gguf` | No well-known official GGUF | `snowflake-arctic-embed-xs` GGUF (§5) |
| 14 | `react-native-pdf-extractor` | Pattern/regex matcher, not general text extraction | Camera OCR + paste text (P0); PDF is a stretch goal |
| 15 | Tesseract OCR | Heavy; weaker on phone photos | ML Kit Text Recognition v2, **bundled** artifact (§8.3) |
| 16 | Demo step 4: upload a raw document live | Slow and fragile on stage | Snap one tested page live, with a pre-ingested backup deck (§12) |
| 17 | `[cite: 1]`, "JPG", "PNG + 1" in the text | Unedited AI-output artifacts | Removed; never copy them into README or slides |
| 18 | No disclosures | Required by the rules | `DISCLOSURES.md` (§13) |
| 19 | "Wordle", "Wordscapes" names | Trademarks of NYT and PeopleFun | In-app names: **Notes Crossword**, **Daily Term** |

### 0.3 Errors in my own v2 draft (also fixed)
| # | v2 said | Fixed to |
|---|---|---|
| a | Q4_K_M models with `n_gpu_layers: 99` | **Q4_0** (Android OpenCL supports only Q4_0 / Q6_K weights) |
| b | Crossword placer could overlap two words in the same direction; `normalizeOrigin` was never written; crashed on an empty list | Per-cell direction tracking, normalization, numbering, empty guards (§8.7) |
| c | Tutor stream guard displayed partial words before detecting a leak, didn't stop generation, didn't reset the UI | Hold-back buffer, `stopCompletion()`, UI reset, then retry (§8.8) |
| d | Masked only the exact term ("authentication" left "authenticate" visible) | Stem-based masking (§8.8) |
| e | FTS5 external-content table with no sync triggers; FTS5 not enabled in op-sqlite | Standalone FTS5 table + `"op-sqlite": { "fts5": true }` (§8.6, §10) |
| f | `react-native-mlkit-ocr` (bundled vs. Play-Services artifact unverified) | ~30-line Kotlin module on the bundled `com.google.mlkit:text-recognition` artifact (§8.3) |
| g | `react-native-fs` (unmaintained) | `@dr.pogodin/react-native-fs` |
| h | Embedder on GPU | Embedder on CPU (`n_gpu_layers: 0`): it's tiny, and its Q8_0 format isn't on the GPU path |
| i | "Bare RN or Expo" | **Bare RN CLI** (the custom Kotlin OCR module is simpler there) |
| j | No proguard rule; no arm64 note; demo in a debug build | Proguard rule, `abiFilters arm64-v8a`, **release build for the demo** (§10) |
| k | Qwen thinking: strip `<think>` only | `chat_template_kwargs: { enable_thinking: false }`, with the strip kept as a backup (§8.2) |

---

## 1. Rules compliance

| Rule | Status | How we satisfy it |
|---|---|---|
| Substantially built during the hackathon | ✅ | Repo starts empty; commit at every milestone |
| Meaningful AI inference runs locally | ✅ | LLM, embeddings, and OCR are all on-device |
| Working product, demonstrated | ✅ | One core loop, hardened for a live airplane-mode demo |
| Models, APIs, frameworks, tools disclosed | ✅ | `DISCLOSURES.md` (§13) |
| Core local AI doesn't depend on a cloud API | ✅ | **Zero cloud calls at runtime** (counted on screen) |

---

## 2. Product

### 2.1 Problem and user
**User:** Filipino college students and board/certification reviewees who study from printed handouts and PDFs, often on commutes, in provinces, or during brownouts, where mobile data is slow, absent, or expensive.
**Demo persona:** Maria, a BSIT student reviewing an IT Audit chapter on a two-hour commute.

**Problem:** the best AI study tools need the cloud. With no signal or no load, they're gone. They also require uploading handouts (often proprietary review-center material) to someone else's servers.

> Pitch-lane TODO: find one current, citable stat on PH mobile data cost or connectivity gaps for students for the problem slide.

### 2.2 Why local AI is the point (say all four)
1. **Offline:** works with zero signal.
2. **Free at scale:** unlimited puzzle generation at ₱0 per puzzle; a cloud version pays per call, per student, per day.
3. **Private:** notes never leave the phone.
4. **Instant:** answer checking takes milliseconds; hints stream with no network round-trip.

### 2.3 Competitors
| Product | Strength | Our edge |
|---|---|---|
| Google NotebookLM (mobile) | Flashcards and quizzes grounded in uploaded sources | Cloud-only; no offline; uploads your material |
| Khanmigo | Strong Socratic tutor | Cloud, paid, not built on your notes |
| Quizlet / Anki | Flashcards and spaced repetition | Cards are made by hand; no tutor |
| PocketPal AI, ChatterUI | Local LLM chat via llama.rn | Generic chat, no pedagogy |
| EdSparkAI, Airgap (open source) | On-device models in React Native, offline-first | Closest technical peers; study their READMEs. We differ on gamified recall from *your* notes plus an enforced Socratic tutor. |

**One-liner:** *"NotebookLM-style studying that runs entirely on your phone: works on the jeep, during a brownout, with zero load, and your notes never leave the device."*

---

## 3. Core loop — AI is in every step (fix for P1)

```
 📸 Snap handout / paste notes
        │  ML Kit OCR ............................ local vision model #1
        ▼
 ✂️ Chunk (≈180 words)  →  🔢 Embed each chunk ... local embedding model #2
        │
        ▼
 🧠 Extract terms + write clues (JSON) ........... local LLM #3
        │
        ├──► 🧩 Notes Crossword (built from those terms)
        │          │ stuck / 2 wrong fills
        │          ▼
        │      🦉 Socratic Tutor (masked context, stream-guarded) ... local LLM #3
        │
        └──► 📅 Daily Term (picked from missed terms, AI clue)
                    │ 3 misses → Tutor
```

**Judge test:** remove the AI and nothing works. There are no puzzles, no clues, and no tutor. That is what "local inference is fundamental" means.

### Scope tiers
| Tier | Features |
|---|---|
| **P0 — must demo** | Paste + camera OCR ingest · LLM term/clue extraction · Notes Crossword · Socratic tutor with guard · Proof panel · release build in airplane mode |
| **P1 — should** | Daily Term · "Ask my notes" (embedding search) · missed-term tracking |
| **P2 — nice** | PDF import · streaks · Taglish tutor replies · TTS hint read-aloud · Hexagon NPU experiment |
| **Cut** | Anagram wheel · iOS · curated 10k word list · accounts/sync |

---

## 4. Game design (fix for P2)

### 4.1 Notes Crossword (primary)
- Built from 6–10 terms the LLM extracted from **this student's** notes.
- Clues are the LLM-written definitions (validated so they never contain the term).
- Tap a clue → type the answer → instant check, with correct cells locking green.
- **2 wrong submissions on one entry** or a tap on 🦉 opens the tutor for that entry.
- Each submission is logged to `attempts`, which feeds the Daily Term.

### 4.2 Daily Term (P1)
- One term per day per deck, **4–10 letters**, chosen from the student's most-missed terms in the last 7 days (falling back to the least-recently-seen term). The pick is saved for the day so it doesn't change.
- Board: 6 rows × term length, with the AI clue shown above.
- Any A–Z guess of the right length is accepted; scoring is green/yellow/gray with correct duplicate-letter handling.
- **3 misses** → tutor.

### 4.3 Why this teaches
Clue → term recall is active recall. Re-surfacing missed terms is spaced repetition. A guiding question instead of the answer is the Socratic method. Anagrams did none of these.

---

## 5. Models (fix for P4)

**Hard constraint:** llama.rn's Android GPU (OpenCL) path runs only on Qualcomm Adreno GPUs and only supports **Q4_0 and Q6_K** weights, on arm64-v8a devices. Q4_K_M files load, but their layers fall back to the CPU.

| Role | Candidates (benchmark all in hour 1) | Format | Approx. size | Notes |
|---|---|---|---|---|
| **LLM** | 1. **Qwen3.5-2B-Instruct** | Q4_0 | ≈1.2–1.3 GB | Best quality if it hits speed. Hybrid architecture: confirm the GPU actually speeds it up. Disable thinking. |
| | 2. **Gemma 3 1B IT, QAT Q4_0** (Google's official QAT GGUF) | Q4_0 | ≈1 GB | **Safe default:** trained for Q4_0, small, fast. |
| | 3. **Qwen3.5-0.8B-Instruct** | Q4_0 | ≈0.5 GB | For a 4–6 GB backup phone |
| | 4. Llama 3.2 1B Instruct | Q4_0 | ≈0.7 GB | Last resort |
| **Embeddings** | **snowflake-arctic-embed-xs** | Q8_0 or F16 | ≈25–50 MB | CPU only; 384-d; check the model card for the query prefix |
| **OCR** | **ML Kit Text Recognition v2 (Latin), bundled** | — | ≈4 MB/arch | Must be the bundled artifact or it fails offline |

If a model only ships as K-quants, convert it on a laptop: `llama-quantize model-f16.gguf model-q4_0.gguf Q4_0`.

### 5.1 Hour-1 smoke test (Lane A, before any UI)
A throwaway `DevBench` screen. For each candidate:
1. `initLlama({ n_gpu_layers: 99 })` → log `gpu`, `reasonNoGPU`, `devices`, load time.
2. Run the term-extraction prompt (§9.1) on 3 sample chunks → JSON parse rate, valid-term count, TTFT, tok/s.
3. Run the tutor prompt (§9.2) 20× **without the guard** → raw leak rate.
4. Repeat 1–2 with `n_gpu_layers: 0` to get the CPU baseline.

**Pick rule:** the largest model with ≥10 tok/s on the demo phone, ≥9/10 JSON parse, load time <8 s, and the lowest raw leak rate. Write everything to `docs/benchmarks.md`; those numbers go in the pitch.

### 5.2 Devices
- **Demo phone:** Snapdragon 8 Gen 2 or newer (Adreno 7xx), 8 GB+ RAM, arm64.
- **Backup phone:** same build, models pre-pushed.
- Record a backup demo video the night before.

---

## 6. Architecture

### 6.1 Diagram
```
┌──────────────── React Native 0.7x (TS, New Architecture), release build ────────────────┐
│ Screens: Home · Ingest · Crossword · DailyTerm · TutorSheet · ProofPanel · DevBench     │
│ State: zustand                                                                          │
└──────┬─────────────────────────┬───────────────────────────┬───────────────────────────┘
       │                         │                           │
┌──────▼───────┐        ┌────────▼────────┐         ┌────────▼─────────┐
│ ingest/      │        │ game/           │         │ ai/tutor         │
│ ocr (Kotlin) │        │ crossword       │         │ mask → prompt →  │
│ chunker      │        │ dailyTerm       │         │ StreamGuard →    │
│ pipeline ────┼──┐     │ scheduler       │         │ retry → fallback │
└──────┬───────┘  │     └────────┬────────┘         └────────┬─────────┘
       │          │     ┌────────▼───────────────────────────▼────────┐
       │          └────►│ ai/llamaBridge (serialized queue)           │
       │                │  gen: LLM Q4_0 (OpenCL GPU / CPU fallback)  │
       │                │  emb: arctic-embed-xs (CPU)                 │
       │                └─────────────────────────────────────────────┘
┌──────▼──────────────────────────────────────────────┐
│ op-sqlite: documents · chunks(+embedding BLOB) ·    │
│ chunks_fts (FTS5) · terms · attempts · daily        │
└─────────────────────────────────────────────────────┘
               🚫 zero runtime network calls (counted)
```

### 6.2 Stack
| Layer | Choice |
|---|---|
| App | React Native CLI 0.7x+, TypeScript, New Architecture (default; required by llama.rn ≥0.10) |
| LLM runtime | `llama.rn`: completion + streaming, `response_format` JSON schema (compiled to a grammar), embeddings, `stopCompletion` |
| GPU | OpenCL on Adreno; manifest `uses-native-library libOpenCL.so` |
| OCR | Custom Kotlin module on `com.google.mlkit:text-recognition` (bundled) + `react-native-image-picker` |
| DB | `@op-engineering/op-sqlite` with `fts5: true` |
| Vector search | Brute-force cosine in JS (≤2k chunks takes milliseconds) + FTS5 keyword boost |
| Files | `@dr.pogodin/react-native-fs` |
| State / anim | `zustand`, `react-native-reanimated` |
| Network check | `@react-native-community/netinfo` + a `fetch` counter |

### 6.3 Directory tree
```
AppBuildersPH/
├── README.md               # pitch, setup, demo
├── DISCLOSURES.md          # required (§13)
├── docs/{BUILD_SPEC.md, benchmarks.md}
├── scripts/push-models.sh
├── android/app/src/main/java/com/backpacktutor/ocr/{OcrModule.kt, OcrPackage.kt}
└── src/
    ├── app/{App.tsx, navigation.tsx, theme.ts}
    ├── screens/{Home, Ingest, Crossword, DailyTerm, ProofPanel, DevBench}Screen.tsx
    ├── components/
    │   ├── crossword/{Grid, Cell, ClueBar}.tsx
    │   ├── daily/{Board, Keyboard}.tsx
    │   └── tutor/TutorSheet.tsx
    ├── services/
    │   ├── ai/{llamaBridge, prompts, termExtractor, tutor, leakGuard}.ts
    │   ├── ingest/{ocr, chunker, pipeline}.ts
    │   ├── rag/retrieve.ts
    │   ├── game/{crossword, dailyTerm}.ts
    │   ├── db/{client, schema}.ts
    │   └── net/netCounter.ts
    ├── store/{useDeckStore, useGameStore, useAiStore}.ts
    └── assets/sample/it_audit_ch1.txt   # backup demo deck
```

---

## 7. Data model
```sql
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT, source TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, doc_id TEXT, idx INTEGER, text TEXT, embedding BLOB);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, chunk_id UNINDEXED, doc_id UNINDEXED);
CREATE TABLE IF NOT EXISTS terms (id TEXT PRIMARY KEY, doc_id TEXT, chunk_id TEXT, term TEXT,
  answer TEXT, clue TEXT, UNIQUE(doc_id, answer));
CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, term_id TEXT, mode TEXT,
  correct INTEGER, hints_used INTEGER, ts INTEGER);
CREATE TABLE IF NOT EXISTS daily (day TEXT, doc_id TEXT, term_id TEXT, PRIMARY KEY (day, doc_id));
```
Insert into `chunks_fts` at the same time as `chunks`. No triggers are needed because chunks are never edited.

---

## 8. Module specs and starter code

> Signatures follow llama.rn's README and docs. After `npm i`, check them against `node_modules/llama.rn/lib/typescript` for your installed version.

### 8.1 `db/client.ts`
```ts
import { open } from '@op-engineering/op-sqlite';
import { SCHEMA } from './schema'; // array of the SQL statements in §7

export const db = open({ name: 'backpack.sqlite' });
export async function migrate() { for (const s of SCHEMA) await db.execute(s); }
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
```

### 8.2 `ai/llamaBridge.ts`
```ts
import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import RNFS from '@dr.pogodin/react-native-fs';

export const MODEL_DIR = `${RNFS.ExternalDirectoryPath}/models`;
export const GEN_PATH = `${MODEL_DIR}/gen.gguf`;   // push the chosen LLM under this name
export const EMB_PATH = `${MODEL_DIR}/emb.gguf`;
const STOP = ['<|im_end|>', '<end_of_turn>', '<|eot_id|>', '<|endoftext|>'];

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
let gen: LlamaContext | null = null;
let emb: LlamaContext | null = null;

export const stats = {
  modelName: '', gpu: false, reasonNoGPU: '', devices: [] as string[],
  loadMs: 0, lastTtftMs: 0, lastTps: 0, embedDims: 0,
};

// One request at a time: avoids memory spikes and keeps the UI predictable.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export async function loadModels(nGpuLayers = 99) {
  if (!(await RNFS.exists(GEN_PATH))) throw new Error(`Missing model: ${GEN_PATH}`);
  const info: any = await loadLlamaModelInfo(GEN_PATH);
  stats.modelName = info?.['general.name'] ?? 'gen.gguf';
  const t0 = Date.now();
  gen = await initLlama({ model: GEN_PATH, n_ctx: 2048, n_gpu_layers: nGpuLayers, use_mlock: false });
  stats.loadMs = Date.now() - t0;
  const g: any = gen;
  stats.gpu = !!g.gpu; stats.reasonNoGPU = g.reasonNoGPU ?? ''; stats.devices = g.devices ?? [];
  emb = await initLlama({ model: EMB_PATH, embedding: true, n_ctx: 512, n_gpu_layers: 0 });
}

export function complete(opts: {
  messages: Msg[]; n_predict?: number; temperature?: number;
  jsonSchema?: object; onToken?: (t: string) => void;
}): Promise<string> {
  return serial(async () => {
    if (!gen) throw new Error('LLM not loaded');
    const t0 = Date.now(); let tFirst = 0;
    const res = await gen.completion(
      {
        messages: opts.messages,
        n_predict: opts.n_predict ?? 256,
        temperature: opts.temperature ?? 0.4,
        stop: STOP,
        chat_template_kwargs: { enable_thinking: false }, // Qwen3.5; ignored by other templates
        ...(opts.jsonSchema
          ? { response_format: { type: 'json_schema', json_schema: { schema: opts.jsonSchema } } }
          : {}),
      } as any,
      (d) => { if (!tFirst) tFirst = Date.now(); opts.onToken?.(d.token); },
    );
    stats.lastTtftMs = tFirst ? tFirst - t0 : 0;
    stats.lastTps = res.timings?.predicted_per_second ?? 0;
    return res.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  });
}

export const stopGeneration = () => gen?.stopCompletion();

export function embed(text: string): Promise<Float32Array> {
  return serial(async () => {
    if (!emb) throw new Error('Embedder not loaded');
    const { embedding } = await emb.embedding(text);
    const v = Float32Array.from(embedding);
    let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n;
    stats.embedDims = v.length;
    return v;
  });
}
```
Load both models **once at app start** behind a splash screen with progress. Never load per request.

### 8.3 OCR: Kotlin module on bundled ML Kit
`android/app/build.gradle`:
```gradle
dependencies { implementation "com.google.mlkit:text-recognition:16.0.1" } // bundled; NOT play-services-mlkit-*
```
`OcrModule.kt`
```kotlin
package com.backpacktutor.ocr

import android.net.Uri
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class OcrModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  override fun getName() = "Ocr"

  @ReactMethod
  fun recognize(uri: String, promise: Promise) {
    try {
      val image = InputImage.fromFilePath(ctx, Uri.parse(uri))
      recognizer.process(image)
        .addOnSuccessListener { promise.resolve(it.text) }
        .addOnFailureListener { promise.reject("OCR_FAILED", it) }
    } catch (e: Exception) { promise.reject("OCR_BAD_IMAGE", e) }
  }
}
```
`OcrPackage.kt`
```kotlin
package com.backpacktutor.ocr

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OcrPackage : ReactPackage {
  override fun createNativeModules(c: ReactApplicationContext) = listOf(OcrModule(c))
  override fun createViewManagers(c: ReactApplicationContext) = emptyList<ViewManager<*, *>>()
}
```
Register it in `MainApplication.kt`: `PackageList(this).packages.apply { add(OcrPackage()) }`. Legacy modules run under New Architecture through the interop layer.

`ingest/ocr.ts`
```ts
import { NativeModules } from 'react-native';
import { launchCamera } from 'react-native-image-picker';

export async function snapAndRead(): Promise<string> {
  const res = await launchCamera({ mediaType: 'photo', quality: 0.9 });
  const uri = res.assets?.[0]?.uri;
  if (!uri) throw new Error('No photo');
  return cleanOcr(await NativeModules.Ocr.recognize(uri));
}
export const cleanOcr = (s: string) =>
  s.replace(/-\n(?=[a-z])/g, '')    // re-join words hyphenated across lines
   .replace(/[ \t]+/g, ' ')
   .replace(/\n{3,}/g, '\n\n')
   .trim();
```
**Test on a fresh install in airplane mode** to prove the bundled model is used.

### 8.4 `ingest/chunker.ts`
```ts
export function chunk(text: string, target = 180, overlap = 30): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const out: string[] = [];
  for (let i = 0; ; i += target - overlap) {
    out.push(words.slice(i, i + target).join(' '));
    if (i + target >= words.length) break;
  }
  return out;
}
```

### 8.5 `ai/termExtractor.ts` + `ingest/pipeline.ts`
```ts
import { complete } from './llamaBridge';
import { TERM_SYSTEM } from './prompts';
import { leaks } from './leakGuard';

const TERM_SCHEMA = {
  type: 'object',
  properties: {
    terms: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object',
        properties: { term: { type: 'string', maxLength: 40 }, clue: { type: 'string', maxLength: 140 } },
        required: ['term', 'clue'],
      },
    },
  },
  required: ['terms'],
};

export type ExtractedTerm = { term: string; answer: string; clue: string; chunkId: string };
export const toAnswer = (t: string) => t.toUpperCase().replace(/[^A-Z]/g, '');

export async function extractTerms(chunkId: string, text: string, onToken?: () => void) {
  const raw = await complete({
    messages: [{ role: 'system', content: TERM_SYSTEM }, { role: 'user', content: `Passage:\n${text}` }],
    jsonSchema: TERM_SCHEMA, n_predict: 220, temperature: 0.2, onToken,
  });
  let parsed: { terms?: { term?: string; clue?: string }[] };
  try { parsed = JSON.parse(raw); } catch { return [] as ExtractedTerm[]; }
  const lower = text.toLowerCase();
  return (parsed.terms ?? []).flatMap((x): ExtractedTerm[] => {
    const term = (x.term ?? '').trim(), clue = (x.clue ?? '').trim();
    const answer = toAnswer(term), words = clue.split(/\s+/).length;
    const ok = /^[A-Za-z][A-Za-z \-]*$/.test(term)      // letters only, crossword-safe
      && answer.length >= 3 && answer.length <= 12
      && lower.includes(term.toLowerCase())             // grounded: appears in the notes
      && words >= 4 && words <= 22
      && !leaks(clue, term);                            // clue never contains the answer
    return ok ? [{ term, answer, clue, chunkId }] : [];
  });
}
```
```ts
// ingest/pipeline.ts
import { db, uid } from '../db/client';
import { embed } from '../ai/llamaBridge';
import { extractTerms } from '../ai/termExtractor';
import { chunk } from './chunker';

export type Progress = { chunk: number; total: number; terms: number; ready: boolean };

export async function ingest(title: string, source: string, text: string, onProgress: (p: Progress) => void) {
  const docId = uid();
  await db.execute('INSERT INTO documents VALUES (?,?,?,?)', [docId, title, source, Date.now()]);
  const parts = chunk(text); const seen = new Set<string>(); let found = 0;
  for (let i = 0; i < parts.length; i++) {
    const id = `${docId}:${i}`, c = parts[i];
    const vec = await embed(c);
    await db.execute('INSERT INTO chunks VALUES (?,?,?,?,?)', [id, docId, i, c, vec.buffer]);
    await db.execute('INSERT INTO chunks_fts (text, chunk_id, doc_id) VALUES (?,?,?)', [c, id, docId]);
    for (const t of await extractTerms(id, c)) {
      if (seen.has(t.answer)) continue;
      seen.add(t.answer); found++;
      await db.execute('INSERT OR IGNORE INTO terms VALUES (?,?,?,?,?,?)',
        [uid(), docId, id, t.term, t.answer, t.clue]);
    }
    onProgress({ chunk: i + 1, total: parts.length, terms: found, ready: found >= 6 });
  }
  return docId;
}
```
**UX:** show "Reading chunk 2/3 · 7 terms found". Enable "Play" as soon as `ready` is true. One handout page (≈300–400 words) should give 6–10 terms.

### 8.6 `rag/retrieve.ts` ("Ask my notes", P1)
```ts
import { db } from '../db/client';
import { embed } from '../ai/llamaBridge';

const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '; // confirm on model card

export async function searchNotes(docId: string, query: string, k = 3) {
  const q = await embed(QUERY_PREFIX + query);
  const { rows } = await db.execute('SELECT id, text, embedding FROM chunks WHERE doc_id = ?', [docId]);
  const words = query.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const kw = new Set<string>();
  if (words.length) {
    const fts = await db.execute(
      'SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? AND doc_id = ?',
      [words.map((w) => `"${w}"`).join(' OR '), docId]);
    fts.rows.forEach((r: any) => kw.add(r.chunk_id));
  }
  return rows.map((r: any) => {
    const v = new Float32Array(r.embedding as ArrayBuffer);
    let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * q[i];
    return { id: r.id as string, text: r.text as string, score: s + (kw.has(r.id) ? 0.1 : 0) };
  }).sort((a, b) => b.score - a.score).slice(0, k);
}
```
Tutor hints don't need search: each term stores its source `chunk_id`, so the exact passage is free and always correct.

### 8.7 `game/crossword.ts` and `game/dailyTerm.ts`
```ts
export type Dir = 'A' | 'D';
export type Entry = { termId: string; answer: string; clue: string };
export type Placed = Entry & { r: number; c: number; dir: Dir; num?: number };
export type Puzzle = { rows: number; cols: number; entries: Placed[] };

const key = (r: number, c: number) => `${r},${c}`;
const step = (d: Dir): [number, number] => (d === 'A' ? [0, 1] : [1, 0]);

function tryBuild(words: Entry[], maxWords: number): Placed[] {
  const cells = new Map<string, { ch: string; dirs: Set<Dir> }>();
  const placed: Placed[] = [];

  const fit = (a: string, r: number, c: number, d: Dir): number => {
    const [dr, dc] = step(d);
    if (cells.has(key(r - dr, c - dc)) || cells.has(key(r + dr * a.length, c + dc * a.length))) return -1;
    let crosses = 0;
    for (let i = 0; i < a.length; i++) {
      const rr = r + dr * i, cc = c + dc * i, cell = cells.get(key(rr, cc));
      if (cell) {
        if (cell.ch !== a[i] || cell.dirs.has(d)) return -1;      // letter clash or same-direction overlap
        crosses++;
      } else if (cells.has(key(rr + dc, cc + dr)) || cells.has(key(rr - dc, cc - dr))) {
        return -1;                                                 // touches a parallel word side-by-side
      }
    }
    return crosses;
  };
  const place = (w: Entry, r: number, c: number, d: Dir) => {
    const [dr, dc] = step(d);
    for (let i = 0; i < w.answer.length; i++) {
      const k = key(r + dr * i, c + dc * i);
      const cell = cells.get(k) ?? { ch: w.answer[i], dirs: new Set<Dir>() };
      cell.dirs.add(d); cells.set(k, cell);
    }
    placed.push({ ...w, r, c, dir: d });
  };

  if (!words.length) return placed;
  place(words[0], 0, 0, 'A');
  let pending = words.slice(1);
  for (let pass = 0; pass < 2 && pending.length && placed.length < maxWords; pass++) {
    const skipped: Entry[] = [];
    for (const w of pending) {
      if (placed.length >= maxWords) break;
      let best: { r: number; c: number; d: Dir; s: number } | null = null;
      for (const p of placed) for (let i = 0; i < p.answer.length; i++) for (let j = 0; j < w.answer.length; j++) {
        if (p.answer[i] !== w.answer[j]) continue;
        const d: Dir = p.dir === 'A' ? 'D' : 'A';
        const r = p.dir === 'A' ? p.r - j : p.r + i;
        const c = p.dir === 'A' ? p.c + i : p.c - j;
        const s = fit(w.answer, r, c, d);
        if (s > 0 && (!best || s > best.s)) best = { r, c, d, s };
      }
      if (best) place(w, best.r, best.c, best.d); else skipped.push(w);
    }
    pending = skipped;                       // second pass retries words that fit later
  }
  return placed;
}

const area = (ps: Placed[]) => {
  const rs = ps.flatMap((p) => [p.r, p.r + (p.dir === 'D' ? p.answer.length - 1 : 0)]);
  const cs = ps.flatMap((p) => [p.c, p.c + (p.dir === 'A' ? p.answer.length - 1 : 0)]);
  return (Math.max(...rs) - Math.min(...rs) + 1) * (Math.max(...cs) - Math.min(...cs) + 1);
};
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function finalize(ps: Placed[]): Puzzle {
  const minR = Math.min(...ps.map((p) => p.r)), minC = Math.min(...ps.map((p) => p.c));
  const entries = ps.map((p) => ({ ...p, r: p.r - minR, c: p.c - minC }));
  const rows = Math.max(...entries.map((e) => e.r + (e.dir === 'D' ? e.answer.length : 1)));
  const cols = Math.max(...entries.map((e) => e.c + (e.dir === 'A' ? e.answer.length : 1)));
  const nums = new Map<string, number>(); let n = 0;
  [...entries].sort((a, b) => a.r - b.r || a.c - b.c).forEach((e) => {
    const k = key(e.r, e.c);
    if (!nums.has(k)) nums.set(k, ++n);
    e.num = nums.get(k);                    // across + down from the same cell share a number
  });
  return { rows, cols, entries };
}

export function buildCrossword(words: Entry[], maxWords = 10, attempts = 12): Puzzle | null {
  const uniq = [...new Map(words.map((w) => [w.answer, w])).values()]
    .filter((w) => /^[A-Z]{3,12}$/.test(w.answer)).slice(0, 20);
  if (uniq.length < 2) return null;
  let best: Placed[] = [];
  for (let a = 0; a < attempts; a++) {
    const order = a === 0 ? [...uniq].sort((x, y) => y.answer.length - x.answer.length) : shuffle(uniq);
    const ps = tryBuild(order, maxWords);
    if (ps.length > best.length || (ps.length === best.length && ps.length > 1 && area(ps) < area(best))) best = ps;
  }
  return best.length >= 2 ? finalize(best) : null;
}
```
If fewer than 5 words place, show a **Clue List** fallback (same clues, plain answer boxes) so the demo never dead-ends.

```ts
// game/dailyTerm.ts
export type Mark = 'G' | 'Y' | 'X';
export function scoreGuess(guess: string, answer: string): Mark[] {
  const res: Mark[] = Array(answer.length).fill('X');
  const left: Record<string, number> = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) res[i] = 'G';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < answer.length; i++) {
    if (res[i] !== 'G' && left[guess[i]]) { res[i] = 'Y'; left[guess[i]]--; }
  }
  return res;
}
export const isValidGuess = (g: string, len: number) => new RegExp(`^[A-Z]{${len}}$`).test(g);

export const PICK_DAILY_SQL = `
SELECT t.*, SUM(CASE WHEN a.correct = 0 THEN 1 ELSE 0 END) AS misses, MAX(a.ts) AS last_seen
FROM terms t LEFT JOIN attempts a ON a.term_id = t.id AND a.ts > ?
WHERE t.doc_id = ? AND length(t.answer) BETWEEN 4 AND 10
GROUP BY t.id ORDER BY misses DESC, last_seen ASC NULLS FIRST LIMIT 1`;
// Look up `daily` for (today, doc) first. If there's no row, run PICK_DAILY_SQL([Date.now() - 7*864e5, docId]) and insert the pick.
// `today` = local date string (Asia/Manila), e.g. new Date().toLocaleDateString('en-CA').
```

### 8.8 Tutor + leak guard (fix for P3)
Three layers: **(1)** the model never sees the term; **(2)** the stream is held back and checked; **(3)** retry, then a template fallback. Plus: if the student types the right answer into the chat, the **game** marks it solved and no LLM call is made.

```ts
// ai/leakGuard.ts
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const stemOf = (t: string) => (t.length >= 7 ? t.slice(0, Math.max(6, Math.ceil(t.length * 0.75))) : t);

export function leaks(text: string, term: string): boolean {
  const t = norm(term), x = norm(text);
  return !!t && (x.includes(t) || (t.length >= 7 && x.includes(stemOf(t))));
}

export function maskTerm(passage: string, term: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = term.trim().split(/\s+/).map(esc).join('[\\s-]+');
  let out = passage.replace(new RegExp(words, 'gi'), '_____');
  const single = term.trim();
  if (!/\s/.test(single) && single.length >= 7) {        // also mask variants: authenticate/authentication
    out = out.replace(new RegExp(`\\b${esc(stemOf(single.toLowerCase()))}\\w*`, 'gi'), '_____');
  }
  return out;
}

/** Shows text only once it is `holdback` chars behind the stream, so a leak is caught before it renders. */
export class StreamGuard {
  private raw = ''; private shown = 0; leaked = false;
  constructor(private term: string, private emit: (visible: string) => void,
              private holdback = Math.max(24, term.length * 2)) {}
  push(token: string) {
    if (this.leaked) return;
    this.raw += token;
    if (leaks(this.raw, this.term)) { this.leaked = true; return; }
    const end = this.raw.length - this.holdback;
    if (end > this.shown) { this.shown = end; this.emit(this.raw.slice(0, end)); }
  }
}
```
```ts
// ai/tutor.ts
import { complete, stopGeneration, type Msg } from './llamaBridge';
import { leaks, maskTerm, StreamGuard } from './leakGuard';
import { tutorSystem } from './prompts';
import { toAnswer } from './termExtractor';
import { db } from '../db/client';

export type TermRow = { id: string; term: string; answer: string; clue: string; chunk_id: string };
export type TutorUI = { setText(s: string): void; setStatus(s: string): void; onSolved(): void };

export async function askTutor(term: TermRow, studentMsg: string, history: Msg[], ui: TutorUI) {
  // Layer 0: the student got it right in chat → the game handles it, not the LLM
  if (toAnswer(studentMsg) === term.answer) { ui.onSolved(); return; }

  const { rows } = await db.execute('SELECT text FROM chunks WHERE id = ?', [term.chunk_id]);
  const masked = maskTerm((rows[0] as any)?.text ?? '', term.term);           // Layer 1
  const messages: Msg[] = [
    { role: 'system', content: tutorSystem(term.clue, masked) },
    ...history.slice(-4),
    { role: 'user', content: studentMsg },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    ui.setStatus(attempt ? 'Let me rephrase that…' : 'Thinking…');
    const guard = new StreamGuard(term.term, ui.setText);                     // Layer 2
    const text = await complete({
      messages, n_predict: 90, temperature: attempt ? 0.3 : 0.7,
      onToken: (t) => { guard.push(t); if (guard.leaked) stopGeneration(); },
    });
    if (!guard.leaked && !leaks(text, term.term)) { ui.setText(text); ui.setStatus(''); return text; }
    ui.setText('');
  }
  const fb = fallbackHint(term, masked);                                      // Layer 3
  ui.setText(fb); ui.setStatus('');
  return fb;
}

function fallbackHint(term: TermRow, masked: string) {
  const sentence = masked.split(/(?<=[.!?])\s+/).find((s) => s.includes('_____'));
  return `Here's a nudge: it starts with "${term.answer[0]}" and has ${term.answer.length} letters.`
    + (sentence ? ` Your notes say: "${sentence.trim()}"` : ` Re-read the clue: ${term.clue}`);
}
```
Ship gate: **0 visible leaks in 50 scripted attempts** (§11), and the raw leak rate recorded in `benchmarks.md`.

### 8.9 Proof panel + network counter
```ts
// net/netCounter.ts — import once at the very top of index.js
export const net = { calls: 0 };
const orig = global.fetch;
global.fetch = (...args: Parameters<typeof fetch>) => { net.calls++; return orig(...args); };
```
`ProofPanelScreen` (opened by long-pressing the logo) shows live values from `stats` and `net`:
- LLM: `stats.modelName`, Q4_0, load ms · **Backend:** `GPU (OpenCL · ${devices})` or `CPU (${reasonNoGPU})`
- Last TTFT ms · tok/s · Embeddings: dims, chunks indexed · OCR: ML Kit (bundled)
- Network: NetInfo `type` (`none` in airplane mode) · **Cloud calls this session: `net.calls`** (must read 0)

---

## 9. Prompts (`ai/prompts.ts`)

### 9.1 Term extraction
```ts
export const TERM_SYSTEM = `You extract exam study terms from class notes.
From the passage, choose up to 5 key technical terms a student must know.
Rules:
- Each term must appear word-for-word in the passage. Prefer 1–2 word terms.
- For each term, write a clue: one sentence, 6 to 20 words, explaining what it means using the passage.
- The clue must NOT contain the term or any form of it.
Return JSON only.`;
```

### 9.2 Socratic tutor
```ts
export const tutorSystem = (clue: string, maskedNotes: string) => `You are a patient study coach for a Filipino college student.
The student is trying to recall a hidden term. In the notes it appears as _____.
Clue: ${clue}
Notes: ${maskedNotes}

Rules:
- Reply with ONE short guiding question (max 35 words) that points to the idea in the notes.
- Never guess, spell, rhyme, or give letters of the hidden term.
- If the student's guess is close, say which part of their thinking is right.
- Be warm and brief. Light Taglish is fine if the student uses it.`;
```
After the smoke test, add **one** short example exchange to each prompt that targets the chosen model's most common mistake. Small models follow examples better than rules.

---

## 10. Setup

### 10.1 Create and install
```bash
npx @react-native-community/cli@latest init BackpackTutor
cd BackpackTutor
npm i llama.rn @op-engineering/op-sqlite @dr.pogodin/react-native-fs zustand \
      react-native-reanimated react-native-worklets @react-native-community/netinfo \
      react-native-image-picker
```
Follow Reanimated's install notes (babel plugin). llama.rn downloads its prebuilt native libraries during `postinstall`. **No NDK/CMake setup is needed.**

### 10.2 `package.json`
```json
"op-sqlite": { "fts5": true }
```

### 10.3 Android config
`AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<application ...>
  <uses-native-library android:name="libOpenCL.so" android:required="false" />
</application>
```
`android/app/build.gradle`:
```gradle
android { defaultConfig { ndk { abiFilters "arm64-v8a" } } }
dependencies { implementation "com.google.mlkit:text-recognition:16.0.1" }
```
`android/app/proguard-rules.pro`:
```
-keep class com.rnllama.** { *; }
```

### 10.4 Models (`scripts/push-models.sh`)
```bash
#!/usr/bin/env bash
set -e
PKG=com.backpacktutor
DIR=/sdcard/Android/data/$PKG/files/models
adb shell mkdir -p $DIR
adb push "${1:?path to LLM .gguf (Q4_0)}" $DIR/gen.gguf
adb push "${2:?path to embedder .gguf}"  $DIR/emb.gguf
echo "Pushed. Record exact files + SHA256 in DISCLOSURES.md"
```
Install the app once before pushing (so the folder belongs to it). Add a "Choose model file" fallback picker on the splash screen in case a phone's folder is missing.

### 10.5 Run
```bash
npx react-native run-android                 # dev
npx react-native run-android --mode release  # DEMO: release build (faster JS, no Metro connection)
```

---

## 11. Tests that gate the demo
| Test | How | Pass |
|---|---|---|
| Model smoke | DevBench (§5.1) | Numbers in `benchmarks.md` |
| Extraction quality | 5 sample pages → count valid terms/page, JSON parse rate | ≥6 terms/page, ≥90% parse |
| Leak test | DevBench: 10 terms × 5 scripted student messages ("what is it?", "just tell me", "is it X-something?", "give me the first letters", Taglish request) | **0 visible leaks**; record the raw leak rate and fallback rate |
| Crossword | Build from 20 random term sets | ≥5 words placed in ≥90% of cases; no overlaps (unit test on the grid) |
| Daily scoring | Unit tests: duplicate letters (`LEVEL` vs `EAGLE`, etc.) | All pass |
| Offline | **Fresh install, airplane mode**, full loop | 5/5 runs; `net.calls === 0` |

---

## 12. Team plan and demo

### 12.1 Lanes
| Lane | Owns |
|---|---|
| **A — Runtime** | RN project, llama.rn, model pushing, DevBench, ProofPanel, release builds, perf |
| **B — Ingest & data** | Kotlin OCR module, chunker, pipeline, term extraction, DB, retrieval |
| **C — Games** | Crossword grid/input/clues, Clue List fallback, Daily Term board, animations |
| **D — Tutor & pitch** | TutorSheet, leak guard + leak tests, prompts, slides, demo script, video, README, DISCLOSURES |

### 12.2 Milestones (hours assume ~24h; double for 48h)
| Milestone | By | Exit criteria |
|---|---|---|
| M0 Skeleton | H2 | App runs on the demo phone; llama.rn streams one reply; repo pushed |
| M1 Model lock | H4 | DevBench done; LLM chosen; `benchmarks.md` written |
| M2 Vertical slice | H10 | Paste → terms → crossword → guarded tutor hint (ugly is fine) |
| M3 Camera + RAG | H14 | OCR offline on a fresh install; embeddings stored; ProofPanel live |
| M4 P0 polish | H18 | Loading/error states, backup deck, animations. **Feature freeze.** |
| M5 P1 | H20 | Daily Term (only if M4 is green) |
| M6 Harden | H22–24 | 5 airplane-mode rehearsals on both phones (release build); backup video; README |

`main` must always build and run on the demo phone. Use one branch per lane and merge at milestones.

### 12.3 Demo script (3 min)
| Time | Beat | Criterion |
|---|---|---|
| 0:00 | "Maria reviews on a 2-hour jeep ride. No signal, no load. Cloud AI tools can't help her." | Problem |
| 0:20 | Airplane mode ON. Open ProofPanel: GPU backend, model, **cloud calls: 0**. | Local AI |
| 0:35 | Snap a printed handout page → OCR text appears → "Generate" → terms stream in. | Local AI, Innovation |
| 1:05 | Crossword built from *those* terms. Fill two answers (instant). | Execution |
| 1:25 | Get one wrong twice → the tutor asks a guiding question grounded in the page. Type "just tell me": it still won't. Solve it. | Innovation, Demo |
| 2:00 | Daily Term picked from the missed word (or "Ask my notes"). | Usefulness |
| 2:20 | ProofPanel: TTFT, tok/s. "Three on-device models, ₱0 per puzzle, notes never left the phone." | Local AI |
| 2:40 | Who it's for; next: Filipino-language tutor, teacher decks shared by QR, iOS. | — |

**Demo safety:** release build · models warm before you walk up · a page you've tested 5× · pre-ingested backup deck · 80%+ battery, Do Not Disturb · screen mirroring tested · backup video ready.

### 12.4 Judge Q&A prep
1. **Why not call a cloud model?** Offline, ₱0 per puzzle at any scale, private notes, instant. Show airplane mode and the 0-calls counter.
2. **How do you stop a 2B model from giving the answer?** It never sees the term (masked, including variants); every token is checked before it renders; retry, then template fallback. Quote the raw vs. visible leak numbers.
3. **Is extraction reliable?** JSON-schema-constrained decoding plus code validation (must appear in the notes; clue can't contain the term). Quote the parse rate and terms/page.
4. **Which phones?** GPU path on Snapdragon/Adreno 7xx; 0.8B fallback for 4–6 GB phones; quote CPU tok/s.
5. **What's new vs. NotebookLM or Quizlet?** On-device, gamified recall from your own handouts, and an enforced Socratic tutor.

---

## 13. `DISCLOSURES.md` template (required)
```
Models (on-device):
  - LLM: <chosen model> GGUF Q4_0 — <HF repo/file>, SHA256 <...>, license <...>
  - Embeddings: snowflake-arctic-embed-xs GGUF — <HF repo/file>, license Apache-2.0
  - OCR: Google ML Kit Text Recognition v2 (bundled, on-device)
Runtime: llama.rn v<x> (llama.cpp), OpenCL backend on Adreno GPUs
Frameworks/libraries: React Native 0.<x>, op-sqlite, @dr.pogodin/react-native-fs, zustand,
  react-native-reanimated, react-native-image-picker, @react-native-community/netinfo
AI-assisted development: Claude, Gemini (planning/spec)<, Devin/Copilot if used>
Cloud APIs at runtime: none
Pre-existing code: none; all app code written during the hackathon
```

---

## 14. Risks
| Risk | Mitigation |
|---|---|
| llama.rn/New Arch build problems eat hours | Lane A does only M0; fall back to llama.rn's example app as a base |
| Qwen3.5 hybrid architecture slow or unaccelerated on OpenCL | DevBench decides; Gemma 3 1B QAT Q4_0 is the safe default |
| OOM with both models loaded | `n_ctx` 2048; embedder on CPU and tiny; release the embedder after ingest if needed |
| OCR noise → junk terms | `cleanOcr`, validation filters, a tested page, backup deck |
| Crossword too sparse | 12 shuffled attempts + Clue List fallback |
| Tutor leak on stage | Three-layer guard + 50-case leak test |
| ML Kit not offline | Bundled artifact only; fresh-install airplane test |
| Scope creep | P0/P1/P2 tiers; feature freeze at M4 |

---

## 15. Definition of done (P0)
- [ ] Fresh install, release build, airplane mode: full loop 5/5, `net.calls = 0`
- [ ] ≥6 valid terms from the demo page in <60 s
- [ ] 0 visible tutor leaks in 50 scripted attempts
- [ ] ProofPanel shows the real backend, TTFT, and tok/s
- [ ] README, DISCLOSURES.md, docs/benchmarks.md committed
- [ ] Backup video recorded
- [ ] No AI-citation artifacts in the repo or slides

---

### Sources
- llama.rn README (New Arch requirement, OpenCL on Adreno with Q4_0/Q6_K only, arm64, proguard rule, JSON schema → grammar, embeddings, Expo plugin, apps using it): https://github.com/mybigday/llama.rn
- react-native-quick-sqlite deprecation: https://github.com/margelo/react-native-nitro-sqlite/wiki
- op-sqlite configuration (`fts5`, sqlite-vec): https://op-engineering.github.io/op-sqlite/docs/installation
- react-native-pdf-extractor scope: https://www.npmjs.com/package/react-native-pdf-extractor
- snowflake-arctic-embed-xs GGUF: https://huggingface.co/ChristianAzinn/snowflake-arctic-embed-xs-gguf
- Qwen3.5 small GGUF sizes: https://huggingface.co/Hanish/quill-models
- Mobile model comparison (Gemma 3 1B, Qwen 3 1.7B, etc.): https://www.promptquorum.com/power-local-llm/mobile-llm-models-phi4-gemma-smollm
- ML Kit bundled vs. unbundled behavior: https://pub.dev/documentation/text_sight/0.1.0/
- EdSparkAI: https://github.com/Destroyer1543/EdSparkAI
- NotebookLM mobile flashcards and quizzes: https://9to5google.com/2025/11/06/notebooklm-app-flashcards-quizzes/
