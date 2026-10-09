# Backpack Tutor — Build Spec (v4, for our demo phones)

> An offline study app for students. **On-device AI reads your own handouts, turns them into crossword puzzles, and coaches you with a Socratic tutor that never gives the answer away.** Everything works in airplane mode.

| | |
|---|---|
| Repo | `github.com/jjoshua-sek/AppBuildersPH` |
| Platform | Android (arm64), bare React Native CLI 0.87, New Architecture. iOS code exists but is not built or tested (see below) |
| Hackathon theme | Local AI: "useful when the cloud disappears" |
| Status | **This is the build spec.** v4 retargets the app to the three phones we demo on (§0.4, §5). The pure-logic modules are implemented and unit-tested in `src/services/` (§8). Demo plan: `docs/DEVICES_AND_DEMO.md`. Work split: `docs/TEAM_PLAN.md`. |

> **Update: iPhones dropped.** The team has no iPhone available, so the Infinix Hot 50 Pro+ is the only demo and test phone. The iPhone 13 Pro Max / iPhone 11 rows, the `ios-metal` / `ios-cpu` tiers and the iOS demo beats below are historical; skip them. Current device plan: `docs/DEVICES_AND_DEMO.md`.

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

### 0.4 v4 changes: our four demo phones
None of our phones has a Qualcomm Adreno GPU, so the OpenCL GPU path from v3 is gone.

| # | v3 said | Why it changed | v4 |
|---|---|---|---|
| A | Android only; Snapdragon 8 Gen 2+ demo phone | Our phones: iPhone 11, iPhone 13 Pro Max, Infinix Hot 50 Pro+ | **Android + iOS.** Device tiers in `src/services/device/deviceProfile.ts` (§5) |
| B | GPU via OpenCL on Adreno | The Infinix is a MediaTek Helio G100 with a Mali GPU; llama.rn has no Mali backend | Android runs on the **CPU** (2× Cortex-A76 + 6× A55). Q4_0 is still the format: llama.cpp repacks it for fast ARM CPU math |
| C | — | llama.cpp's Metal kernels need an Apple7-family GPU (A14+) | iPhone 13 Pro Max (A15) uses **Metal**; iPhone 11 (A13) runs on the **CPU** |
| D | One "largest that hits 10 tok/s" model | Three phones, two OSes; prompt tuning and leak tests per model are expensive | **One small LLM for all three phones**, chosen on the demo phone (Infinix Hot 50 Pro+) |
| E | Kotlin ML Kit OCR only | ML Kit's custom module is Android-only | Android: bundled ML Kit (unchanged). iOS: Apple **Vision** `VNRecognizeTextRequest`, which is on-device (§8.3) |
| F | Serial queue for all model calls | Background work would block the tutor on a slow phone | `WorkQueue` with priorities: tutor requests preempt background jobs (§8.2) |
| G | Embeddings only for "Ask my notes" (P1) | Judges would see the embedder as filler | Embeddings in the P0 loop: **dedupe terms and pick them for coverage** across the handout (`termSelect.ts`) |
| H | Leak check was a substring match | `ROI` matched "heroic", `risk` matched "brisk": false leaks and rejected clues | Word-boundary matching, spelled-out detection, stem variants (`leakGuard.ts`, 26 tests) |
| I | Layer 0 only caught a message that was exactly the answer | "is it audit?" went to the model with the answer in it | `messageSolves()` finds the answer inside a sentence |
| J | Net counter patched `fetch` only | XHR and WebSocket were invisible; RN's fetch uses XHR | Counts fetch once, plus XHR and WebSocket |
| K | No post-solve teaching | Clue → term recall is shallow | **"Why it matters" card** after each solved entry: a description of the term and why it matters, generated on the device in the background (§4.4) |

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
Clue → term recall is active recall. Re-surfacing missed terms is spaced repetition. A guiding question instead of the answer is the Socratic method. The "why it matters" card turns a recalled word into understanding. Anagrams did none of these.

### 4.4 "Why it matters" card (P0)
- When an entry is solved (in the grid, in Daily Term, or by typing it to the tutor), a card slides up with:
  - **Term**
  - **Description**: 1–2 sentences on what it is, from the student's notes.
  - **Why it matters**: 1–2 sentences on why it matters (what goes wrong without it, or where it is used).
- Generated by the LLM from the term's source chunk (`src/services/ai/whyItMatters.ts`), one JSON-schema call per term.
- Generation runs **in the background at low priority** right after ingest, for the crossword's terms, while the student plays. A tutor request preempts it.
- If a card isn't ready when the entry is solved, show the clue as the description and a "Why it matters…" spinner, and bump that term to the front of the queue.
- Bad model output falls back to the clue, so the card never shows junk. Saved in `terms.description` / `terms.why`.

---

## 5. Models and devices

### 5.1 Our phones
| Phone | Chip | RAM | LLM backend | Tier (`deviceProfile.ts`) |
|---|---|---|---|---|
| iPhone 13 Pro Max | A15 Bionic | 6 GB | **Metal GPU** | `ios-metal` |
| iPhone 11 | A13 Bionic | 4 GB | CPU (A13 is below the Apple7 GPU family llama.cpp's Metal kernels need) | `ios-cpu` |
| Infinix Hot 50 Pro+ | MediaTek Helio G100 (2× A76 + 6× A55), Mali-G57 MC2 | 8 GB | CPU | `android-cpu` |

The Infinix is our budget phone (CPU only), the kind of phone our users actually own, and **the main demo phone**. **Every model and setting decision is made on the Infinix.** If it runs well there, it runs everywhere. (The Tecno Pova 4 is not used.)

### 5.2 One LLM for all three phones

> **Decision (benchmarked on the Infinix): Gemma 3 1B IT, Q4_0** (569 MB, made with `llama-quantize --pure` from the ggml-org F16 file). 19.9 tok/s, loads in 2.1 s, 3.0 valid terms per chunk in 13.9 s, 0/20 visible tutor leaks. Full numbers: `docs/benchmarks.md`.
Using one model means the prompts, the few-shot examples and the leak test are tuned once.

| Role | Candidates (benchmark on the Infinix in hour 1) | Format | Notes |
|---|---|---|---|
| **LLM** | 1. **Gemma 3 1B IT, QAT Q4_0** (Google's official QAT GGUF) | Q4_0 | Safe default: trained for Q4_0, small, fast on CPU |
| | 2. **Qwen3.5 0.8B Instruct** | Q4_0 | Smallest; check JSON quality. Disable thinking |
| | 3. Llama 3.2 1B Instruct | Q4_0 | Last resort |
| | Stretch only: Gemma 4 E2B / Qwen3.5 2B on the iPhone 13 Pro Max | Q4_0 | Only if time remains after M4; needs its own leak test |
| **Embeddings** | **snowflake-arctic-embed-xs** | Q8_0 or F16 | CPU on all phones; 384-d; check the model card for the query prefix |
| **OCR** | Android: **ML Kit Text Recognition v2, bundled**. iOS: **Apple Vision** | — | Both run fully on the device |

Quantize with `--pure` so every tensor is Q4_0 (llama.cpp repacks Q4_0 for fast ARM CPU math): `llama-quantize --pure model-f16.gguf model-q4_0.gguf Q4_0`.

**Memory:** the iPhone 11 has 4 GB and iOS limits each app's memory, so the LLM file must stay around 1 GB or smaller. Its tier uses `n_ctx` 1536.

### 5.3 Hour-1 benchmark (Lane A, before any UI)
A throwaway `DevBench` screen, run on **all three phones**, for each candidate:
1. `initLlama` with the tier's settings → log `gpu`, `reasonNoGPU`, load time.
2. Android: sweep `n_threads` 2 / 4 / 6 and keep the fastest.
3. Run the term-extraction prompt on 3 sample chunks → JSON parse rate, valid-term count, TTFT, tok/s, **seconds per chunk**.
4. Run the tutor prompt 20× **without the guard** → raw leak rate.

**Pick rule (on the Infinix):** ≥ 8 tok/s generation, ≥ 9/10 JSON parse, load < 10 s, one page ingested in < 90 s, lowest raw leak rate. Write everything to `docs/benchmarks.md`, and put the winning settings into `PROFILES` in `deviceProfile.ts`. Those numbers go in the pitch.

## 6. Architecture

### 6.1 Diagram
```
┌────────────── React Native 0.87 (TS, New Architecture), release builds: Android + iOS ──────────────┐
│ Screens: Home · Ingest · Crossword · DailyTerm · TutorSheet · WhyCard · ProofPanel · DevBench       │
│ State: zustand            device/deviceProfile → tier settings (ios-metal / ios-cpu / android-cpu)  │
└──────┬─────────────────────────┬───────────────────────────┬───────────────────────────────────────┘
       │                         │                           │
┌──────▼───────────────┐ ┌───────▼────────┐         ┌────────▼─────────┐
│ ingest/              │ │ game/          │         │ ai/tutor         │
│ ocr: Kotlin ML Kit / │ │ crossword      │         │ layer 0 → mask → │
│      Swift Vision    │ │ dailyTerm      │         │ StreamGuard →    │
│ chunker → pipeline ──┼┐│                │         │ retry → fallback │
│ rag/termSelect       ││└───────┬────────┘         └────────┬─────────┘
└──────┬───────────────┘│ ┌──────▼────────────────────────────▼──────────────┐
       │                └►│ ai/llamaBridge + WorkQueue (high > normal > low) │
       │                  │  gen: 1 small LLM, Q4_0                          │
       │                  │    Metal on iPhone 13 Pro Max, CPU elsewhere     │
       │                  │  emb: arctic-embed-xs (CPU)                      │
       │                  │  background: whyItMatters (low priority)         │
       │                  └──────────────────────────────────────────────────┘
┌──────▼──────────────────────────────────────────────┐
│ op-sqlite: documents · chunks(+embedding BLOB) ·    │
│ chunks_fts (FTS5) · terms(+description, why) ·      │
│ attempts · daily                                    │
└─────────────────────────────────────────────────────┘
               🚫 zero runtime network calls (counted)
```

### 6.2 Stack
| Layer | Choice |
|---|---|
| App | React Native CLI 0.87, TypeScript, New Architecture (required by llama.rn ≥ 0.10) |
| LLM runtime | `llama.rn`: completion + streaming, `response_format` JSON schema, embeddings, `stopCompletion`. Metal on iOS, CPU on our Android phones |
| OCR | Android: Kotlin module on `com.google.mlkit:text-recognition` (bundled). iOS: Swift module on Apple Vision. Both behind `NativeModules.Ocr.recognize(uri)` + `react-native-image-picker` |
| DB | `@op-engineering/op-sqlite` with `fts5: true` (pin the version; check the `rows` result shape) |
| Vector use | Term dedupe + coverage (`termSelect.ts`); brute-force cosine search for "Ask my notes" (P1) |
| Device detection | `react-native-device-info` `getDeviceId()` → `detectTier()` |
| Files | `@dr.pogodin/react-native-fs` |
| State / anim | `zustand`, `react-native-reanimated` |
| Network check | `@react-native-community/netinfo` + `installNetCounter()` |

### 6.3 Directory tree
```
AppBuildersPH/
├── README.md · CONTRIBUTING.md · DISCLOSURES.md
├── .github/{workflows/ci.yml, pull_request_template.md}
├── docs/{BUILD_SPEC.md, TEAM_PLAN.md, DEVICES_AND_DEMO.md, benchmarks.md}
├── scripts/push-models.sh
├── android/app/src/main/java/com/backpacktutor/ocr/{OcrModule.kt, OcrPackage.kt}
├── ios/BackpackTutor/Ocr/{Ocr.swift, Ocr.m}
└── src/
    ├── types.ts                        # shared contract between lanes
    ├── app/{App.tsx, navigation.tsx, theme.ts}
    ├── screens/{Home, Ingest, Crossword, DailyTerm, ProofPanel, DevBench}Screen.tsx
    ├── components/{crossword/*, daily/*, tutor/TutorSheet.tsx, why/WhyCard.tsx}
    ├── services/
    │   ├── ai/{llamaBridge, workQueue✅, mockBridge✅, prompts✅, termExtractor✅, tutor✅, leakGuard✅, whyItMatters✅}.ts
    │   ├── ingest/{ocr, chunker✅, pipeline}.ts
    │   ├── rag/{termSelect✅, retrieve}.ts
    │   ├── game/{crossword✅, dailyTerm✅}.ts
    │   ├── device/deviceProfile✅.ts
    │   ├── db/{client, schema, queries}.ts
    │   └── net/netCounter✅.ts
    ├── store/{useDeckStore, useGameStore, useAiStore}.ts
    └── assets/sample/{it_audit_ch1.txt, sample_terms.json}
```
✅ = implemented with unit tests (`npm test`).

## 7. Data model
```sql
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT, source TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, doc_id TEXT, idx INTEGER, text TEXT, embedding BLOB);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, chunk_id UNINDEXED, doc_id UNINDEXED);
CREATE TABLE IF NOT EXISTS terms (id TEXT PRIMARY KEY, doc_id TEXT, chunk_id TEXT, term TEXT,
  answer TEXT, clue TEXT, description TEXT, why TEXT, selected INTEGER DEFAULT 0, UNIQUE(doc_id, answer));
CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, term_id TEXT, mode TEXT,
  correct INTEGER, hints_used INTEGER, ts INTEGER);
CREATE TABLE IF NOT EXISTS daily (day TEXT, doc_id TEXT, term_id TEXT, PRIMARY KEY (day, doc_id));
```
Insert into `chunks_fts` at the same time as `chunks`. No triggers are needed because chunks are never edited. `selected = 1` marks the terms `selectTerms()` chose for the crossword; `description` and `why` are filled in the background (§4.4).

---

## 8. Module specs

> Signatures follow llama.rn's README. After `npm i`, check them against `node_modules/llama.rn/lib/typescript` for your installed version.

### 8.0 Already implemented (`src/services/`, with unit tests)
| Module | What it does |
|---|---|
| `ai/leakGuard.ts` | `leaks()`, `maskTerm()`, `StreamGuard`. Word-boundary matching, spelled-out letters, stem variants |
| `ai/tutor.ts` | `askTutor(bridge, term, passage, msg, history, ui, settings)`; `messageSolves()`; `fallbackHint()` |
| `ai/termExtractor.ts` | `extractTerms(bridge, chunkId, passage, {maxTerms, n_predict})`; `validateTerms()` |
| `ai/whyItMatters.ts` | `generateWhy(bridge, term, passage)` → `{description, why}`; `parseWhy()` fallback |
| `ai/workQueue.ts` | Priority queue; high preempts a running low job, which re-runs afterwards |
| `ai/prompts.ts` | `termSystem(max)`, `tutorSystem(clue, masked)`, `WHY_SYSTEM` |
| `ai/mockBridge.ts` | Fake `AiBridge` for development and tests |
| `ingest/chunker.ts` | `chunk(text, target, overlap)`, `cleanOcr()` |
| `rag/termSelect.ts` | `selectTerms(candidates, max)`: embedding dedupe + round-robin chunk coverage |
| `game/crossword.ts` | `buildCrossword()`, `toGrid()`; property-tested for valid grids |
| `game/dailyTerm.ts` | `scoreGuess()`, `isValidGuess()`, `PICK_DAILY_SQL`, `todayKey()` |
| `device/deviceProfile.ts` | `detectTier(os, deviceId)`, `PROFILES` |
| `net/netCounter.ts` | `installNetCounter()`, `net.calls` |

Everything below still needs to be written, and needs a phone to verify.

### 8.1 `db/client.ts`
```ts
import { open } from '@op-engineering/op-sqlite';
import { SCHEMA } from './schema'; // array of the SQL statements in §7

export const db = open({ name: 'backpack.sqlite' });
export async function migrate() { for (const s of SCHEMA) await db.execute(s); }
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
```
`db/queries.ts` (Lane B) exposes the only functions other lanes call: `getTerms(docId)`, `getSelectedTerms(docId)`, `getChunk(id)`, `logAttempt(a)`, `getDailyTerm(docId)`, `saveWhy(termId, card)`.

### 8.2 `ai/llamaBridge.ts` (implements `AiBridge` from `src/types.ts`)
```ts
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import RNFS from '@dr.pogodin/react-native-fs';
import type { AiBridge, CompleteOptions } from '../../types';
import { profileFor } from '../device/deviceProfile';
import { WorkQueue } from './workQueue';

const BASE = Platform.OS === 'ios' ? RNFS.DocumentDirectoryPath : RNFS.ExternalDirectoryPath;
export const MODEL_DIR = `${BASE}/models`;
export const GEN_PATH = `${MODEL_DIR}/gen.gguf`;
export const EMB_PATH = `${MODEL_DIR}/emb.gguf`;
const STOP = ['<|im_end|>', '<end_of_turn>', '<|eot_id|>', '<|endoftext|>'];

export const profile = profileFor(Platform.OS, DeviceInfo.getDeviceId());
let gen: LlamaContext | null = null;
let emb: LlamaContext | null = null;

export const stats = {
  modelName: '', tier: profile.tier, gpu: false, reasonNoGPU: '', devices: [] as string[],
  loadMs: 0, lastTtftMs: 0, lastTps: 0, embedDims: 0, lastIngestMs: 0,
};

const queue = new WorkQueue(() => gen?.stopCompletion());

export async function loadModels() {
  if (!(await RNFS.exists(GEN_PATH))) throw new Error(`Missing model: ${GEN_PATH}`);
  const info: any = await loadLlamaModelInfo(GEN_PATH);
  stats.modelName = info?.['general.name'] ?? 'gen.gguf';
  const t0 = Date.now();
  gen = await initLlama({
    model: GEN_PATH, n_ctx: profile.n_ctx, n_gpu_layers: profile.n_gpu_layers,
    n_threads: profile.n_threads, use_mlock: false,
  });
  stats.loadMs = Date.now() - t0;
  const g: any = gen;
  stats.gpu = !!g.gpu; stats.reasonNoGPU = g.reasonNoGPU ?? ''; stats.devices = g.devices ?? [];
  emb = await initLlama({ model: EMB_PATH, embedding: true, n_ctx: 512, n_gpu_layers: 0, n_threads: 2 });
}

export const bridge: AiBridge = {
  complete: (o: CompleteOptions) => queue.run(o.priority ?? 'normal', async () => {
    if (!gen) throw new Error('LLM not loaded');
    const t0 = Date.now(); let tFirst = 0;
    const res = await gen.completion(
      {
        messages: o.messages,
        n_predict: o.n_predict ?? 256,
        temperature: o.temperature ?? 0.4,
        stop: STOP,
        chat_template_kwargs: { enable_thinking: false }, // Qwen3.5; ignored by other templates
        ...(o.jsonSchema
          ? { response_format: { type: 'json_schema', json_schema: { schema: o.jsonSchema } } }
          : {}),
      } as any,
      (d) => { if (!tFirst) tFirst = Date.now(); o.onToken?.(d.token); },
    );
    stats.lastTtftMs = tFirst ? tFirst - t0 : 0;
    stats.lastTps = res.timings?.predicted_per_second ?? 0;
    return res.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }),
  stopGeneration: () => { gen?.stopCompletion(); },
  embed: (text) => queue.run('normal', async () => {
    if (!emb) throw new Error('Embedder not loaded');
    const { embedding } = await emb.embedding(text);
    const v = Float32Array.from(embedding);
    let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n;
    stats.embedDims = v.length;
    return v;
  }),
};
```
Load both models **once at app start** behind a splash screen with progress. llama.rn reuses the KV cache for a shared prompt prefix, so tutor follow-ups on the same entry start faster; confirm this in DevBench on the Infinix.

**Gemma's chat template has no system role.** llama.cpp's template merges the system message into the first user turn. Run the leak test with the model you actually pick.

### 8.3 OCR

**Android: Kotlin module on bundled ML Kit.** `android/app/build.gradle`:
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
Register it in `MainApplication.kt`: `PackageList(this).packages.apply { add(OcrPackage()) }`. Legacy modules run under the New Architecture through the interop layer.

**iOS: Swift module on Apple Vision** (on-device since iOS 13; no download). `ios/BackpackTutor/Ocr/Ocr.swift`:
```swift
import Foundation
import Vision
import ImageIO

@objc(Ocr)
class Ocr: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(recognize:resolver:rejecter:)
  func recognize(_ uri: String,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let url = URL(string: uri),
          let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
      reject("OCR_BAD_IMAGE", "Cannot read \(uri)", nil); return
    }
    // Camera photos carry their rotation in EXIF; Vision needs it to read the text upright.
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let raw = props?[kCGImagePropertyOrientation] as? UInt32 ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: raw) ?? .up

    let request = VNRecognizeTextRequest { req, err in
      if let err = err { reject("OCR_FAILED", err.localizedDescription, err); return }
      let lines = (req.results as? [VNRecognizedTextObservation] ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
      resolve(lines.joined(separator: "\n"))
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([request])
      } catch {
        reject("OCR_FAILED", error.localizedDescription, error)
      }
    }
  }
}
```
`ios/BackpackTutor/Ocr/Ocr.m`:
```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Ocr, NSObject)
RCT_EXTERN_METHOD(recognize:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
```
Add `#import <React/RCTBridgeModule.h>` to the Swift bridging header (Xcode offers to create one when you add the first Swift file).

`ingest/ocr.ts` (same on both platforms):
```ts
import { NativeModules } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { cleanOcr } from './chunker';

export async function snapAndRead(): Promise<string> {
  const res = await launchCamera({ mediaType: 'photo', quality: 0.9 });
  const uri = res.assets?.[0]?.uri;
  if (!uri) throw new Error('No photo');
  return cleanOcr(await NativeModules.Ocr.recognize(uri));
}
```
**Test both on a fresh install in airplane mode.**

### 8.4 `ingest/pipeline.ts`
```ts
import type { AiBridge } from '../../types';
import { db, uid } from '../db/client';
import { extractTerms, type ExtractedTerm } from '../ai/termExtractor';
import { generateWhy } from '../ai/whyItMatters';
import { selectTerms } from '../rag/termSelect';
import type { Profile } from '../device/deviceProfile';
import { chunk } from './chunker';

export type Progress = { chunk: number; total: number; terms: number; ready: boolean };

export async function ingest(bridge: AiBridge, p: Profile, title: string, source: string, text: string,
                             onProgress: (x: Progress) => void) {
  const docId = uid();
  await db.execute('INSERT INTO documents VALUES (?,?,?,?)', [docId, title, source, Date.now()]);
  const parts = chunk(text, p.chunkWords, 30);
  const cands: (ExtractedTerm & { chunkIdx: number; vec: Float32Array })[] = [];
  for (let i = 0; i < parts.length; i++) {
    const id = `${docId}:${i}`, c = parts[i];
    const vec = await bridge.embed(c);
    await db.execute('INSERT INTO chunks VALUES (?,?,?,?,?)', [id, docId, i, c, vec.buffer]);
    await db.execute('INSERT INTO chunks_fts (text, chunk_id, doc_id) VALUES (?,?,?)', [c, id, docId]);
    for (const t of await extractTerms(bridge, id, c, { maxTerms: p.termsPerChunk, n_predict: p.extractTokens })) {
      cands.push({ ...t, chunkIdx: i, vec: await bridge.embed(`${t.term}: ${t.clue}`) });
    }
    const unique = new Set(cands.map((x) => x.answer)).size;
    onProgress({ chunk: i + 1, total: parts.length, terms: unique, ready: unique >= 6 });
  }
  const picked = selectTerms(cands, 10);
  const pickedSet = new Set(picked);
  for (const t of cands) {
    await db.execute('INSERT OR IGNORE INTO terms (id, doc_id, chunk_id, term, answer, clue, selected) VALUES (?,?,?,?,?,?,?)',
      [uid(), docId, t.chunkId, t.term, t.answer, t.clue, pickedSet.has(t) ? 1 : 0]);
  }
  return docId;
}

/** Fire and forget after ingest: fills the "why it matters" cards at low priority. */
export async function fillWhyCards(bridge: AiBridge, p: Profile, docId: string) {
  const { rows } = await db.execute(
    `SELECT t.id, t.term, t.clue, c.text FROM terms t JOIN chunks c ON c.id = t.chunk_id
     WHERE t.doc_id = ? AND t.selected = 1 AND t.why IS NULL`, [docId]);
  for (const r of rows as any[]) {
    const card = await generateWhy(bridge, r, r.text, p.whyTokens);
    await db.execute('UPDATE terms SET description = ?, why = ? WHERE id = ?', [card.description, card.why, r.id]);
  }
}
```
**UX:** show "Reading chunk 2/3 · 7 terms found". Enable "Play" as soon as `ready` is true. Save the total ingest time to `stats.lastIngestMs` for the Proof panel.

### 8.5 `rag/retrieve.ts` ("Ask my notes", P1)
Brute-force cosine over the document's chunk embeddings (≤ 2k chunks takes milliseconds) plus a +0.1 boost for FTS5 keyword hits. Tutor hints don't need search: each term stores its source `chunk_id`, so the exact passage is free and always correct.

### 8.6 Proof panel
`installNetCounter()` is called at the very top of `index.js`. `ProofPanelScreen` (opened by long-pressing the logo) shows live values from `stats` and `net`:
- Phone tier (`ios-metal` / `ios-cpu` / `android-cpu`) and device name
- LLM: `stats.modelName`, Q4_0, load ms · **Backend:** `GPU (Metal)` or `CPU · ${n_threads} threads`
- Last TTFT ms · tok/s · last ingest time · embeddings: dims, chunks indexed · OCR: ML Kit (bundled) or Apple Vision
- Network: NetInfo `type` (`none` in airplane mode) · **Cloud calls this session: `net.calls`** (must read 0)

## 9. Prompts
All prompts live in `src/services/ai/prompts.ts`: `termSystem(max)`, `tutorSystem(clue, maskedNotes)` and `WHY_SYSTEM`. After the benchmark, add **one** short example exchange to each prompt that targets the chosen model's most common mistake. Small models follow examples better than rules.

## 10. Setup

### 10.1 Install
The RN project is already in the repo. Add the native dependencies (Lane A, in one PR, verified on one Android and one iOS phone):
```bash
npm i llama.rn @op-engineering/op-sqlite @dr.pogodin/react-native-fs zustand \
      react-native-reanimated react-native-worklets @react-native-community/netinfo \
      react-native-image-picker react-native-device-info
cd ios && bundle install && bundle exec pod install && cd ..
```
Follow Reanimated's install notes (babel plugin). llama.rn downloads prebuilt native libraries during `postinstall`. **No NDK/CMake setup is needed.**

### 10.2 `package.json`
```json
"op-sqlite": { "fts5": true }
```

### 10.3 Android config
`AndroidManifest.xml`: `<uses-permission android:name="android.permission.CAMERA" />`
`android/app/build.gradle`:
```gradle
android { defaultConfig { ndk { abiFilters "arm64-v8a" } } }
dependencies { implementation "com.google.mlkit:text-recognition:16.0.1" }
```
`android/app/proguard-rules.pro`: `-keep class com.rnllama.** { *; }`

### 10.4 iOS config (needs a Mac with Xcode)
`Info.plist`:
- `NSCameraUsageDescription`: "Snap a handout page to study it."
- `UIFileSharingEnabled` = YES and `LSSupportsOpeningDocumentsInPlace` = YES, so the app's Documents folder shows in Finder and in the Files app (used to copy the models in).

Signing: a free Apple ID works. Its provisioning profile **expires after 7 days**, so build the final demo install within a week of the demo. On each iPhone: enable **Developer Mode** (Settings → Privacy & Security), then trust the developer profile (Settings → General → VPN & Device Management).

### 10.5 Models
**Android** (`scripts/push-models.sh`, after installing the app once):
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
**iOS:** connect the iPhone to the Mac → Finder → the iPhone → **Files** → BackpackTutor → drag a `models` folder with `gen.gguf` and `emb.gguf` in. (Or AirDrop the files and save them to On My iPhone → BackpackTutor → models.)

Keep the "Choose model file" fallback picker on the splash screen in case a path is wrong.

### 10.6 Run
```bash
npm test                                      # unit tests, no phone needed
npx react-native run-android                  # dev
npx react-native run-android --mode release   # DEMO build: Infinix
# iOS: open ios/BackpackTutor.xcworkspace → scheme BackpackTutor → Edit Scheme → Run → Build Configuration: Release → run on the iPhone
```

## 11. Tests that gate the demo
| Test | How | Pass |
|---|---|---|
| Unit tests | `npm test` (CI runs it on every PR) | All green |
| Model benchmark | DevBench (§5.3) on all three phones | Numbers in `benchmarks.md` |
| Extraction quality | 5 sample pages on the Infinix → valid terms/page, JSON parse rate, seconds/page | ≥ 6 terms/page, ≥ 90% parse, < 90 s/page |
| Leak test | DevBench: 10 terms × 5 scripted messages ("what is it?", "just tell me", "is it X-something?", "give me the first letters", a Taglish request) on the Infinix and the iPhone 13 Pro Max | **0 visible leaks**; record raw leak and fallback rates |
| Why cards | Ingest the demo page, play for 2 minutes on the Infinix | All 6–10 cards ready; tutor never waits more than one job |
| OCR | Demo page photographed on all three phones, fresh install, airplane mode | Text readable; ≥ 6 terms |
| Offline | **Fresh install, airplane mode, Wi-Fi and Bluetooth off**, full loop | 5/5 runs per demo phone; `net.calls === 0` |

## 12. Team plan and demo
- **Work split, milestones and PR workflow:** `docs/TEAM_PLAN.md` and `CONTRIBUTING.md`.
- **Which phone does what, screen mirroring, the 3-minute script, rehearsals and the failure playbook:** `docs/DEVICES_AND_DEMO.md`.

### 12.1 Judge Q&A prep
1. **Why not call a cloud model?** Offline, ₱0 per puzzle at any scale, private notes, instant. Show airplane mode and the 0-calls counter.
2. **How do you stop a small model from giving the answer?** It never sees the term (masked, including variants); every token is checked before it renders; retry, then a template fallback. Quote the raw vs. visible leak numbers.
3. **Is extraction reliable?** JSON-schema-constrained decoding plus code validation (must appear in the notes; the clue can't contain the term). Quote the parse rate and terms/page.
4. **Which phones?** "It's running on an Infinix Hot 50 Pro+ right now: a MediaTek budget phone, CPU only. The iPhone 13 Pro Max uses its GPU through Metal. Same model, same app." Quote tok/s for both.
5. **What's new vs. NotebookLM or Quizlet?** On-device, gamified recall from your own handouts, an enforced Socratic tutor, and a "why it matters" card for every term.

## 13. `DISCLOSURES.md` template (required)
```
Models (on-device):
  - LLM: <chosen model> GGUF Q4_0 — <HF repo/file>, SHA256 <...>, license <...>
  - Embeddings: snowflake-arctic-embed-xs GGUF — <HF repo/file>, license Apache-2.0
  - OCR: Google ML Kit Text Recognition v2 (bundled, on-device) on Android; Apple Vision on iOS
Runtime: llama.rn v<x> (llama.cpp): Metal on iPhone 13 Pro Max, CPU on the other phones
Frameworks/libraries: React Native 0.87, op-sqlite, @dr.pogodin/react-native-fs, zustand,
  react-native-reanimated, react-native-image-picker, @react-native-community/netinfo,
  react-native-device-info
AI-assisted development: Claude, Gemini (planning/spec)<, Devin/Copilot if used>
Cloud APIs at runtime: none
Pre-existing code: none; all app code written during the hackathon
```

---

## 14. Risks
| Risk | Mitigation |
|---|---|
| Ingest too slow on the MediaTek phones | Choose the model on the Infinix; smaller chunks and fewer terms per chunk in the `android-cpu` profile; "Play" unlocks at 6 terms; live ingest on the iPhone 13 Pro Max, budget phone ingests in the background (`DEVICES_AND_DEMO.md`) |
| Tutor reply slow on CPU phones | `tutorTokens` 60 on CPU tiers; WorkQueue preempts background jobs; KV-cache prefix reuse for follow-ups |
| No Mac on the team | iOS can't be built. Demo on the Infinix alone, with the backup video as the spare |
| Free Apple ID profile expires after 7 days | Build the final iOS install within a week of the demo; re-check on the morning of the demo |
| iPhone 11 runs out of memory | ≤ 1 GB LLM file; `n_ctx` 1536; it's the judge pass-around phone, not a stage phone |
| llama.rn / New Architecture build problems eat hours | Lane A does only M0 first; fall back to llama.rn's example app as a base |
| OCR noise → junk terms | `cleanOcr`, validation filters, a tested page, a pre-ingested backup deck on every phone |
| Crossword too sparse | 12 shuffled attempts + Clue List fallback |
| Tutor leak on stage | Three-layer guard + 50-case leak test on two phones |
| ML Kit not offline | Bundled artifact only; fresh-install airplane test |
| Scope creep | P0/P1/P2 tiers; feature freeze at M4 |

## 15. Definition of done (P0)
- [ ] Fresh install, release build, airplane mode: full loop 5/5 on each stage phone, `net.calls = 0`
- [ ] ≥ 6 valid terms from the demo page: < 30 s on the iPhone 13 Pro Max, < 90 s on the Infinix
- [ ] "Why it matters" cards ready for every crossword term within 2 minutes of play on the Infinix
- [ ] 0 visible tutor leaks in 50 scripted attempts
- [ ] ProofPanel shows the real tier, backend, TTFT, and tok/s on every phone
- [ ] README, DISCLOSURES.md, docs/benchmarks.md committed
- [ ] Backup video recorded
- [ ] No AI-citation artifacts in the repo or slides

---

### Sources
- llama.cpp OpenCL backend (Adreno-only; why it doesn't apply to our phones): https://huggingface.co/OpenTransformer/llama.cpp-prismml/blob/main/docs/backend/OPENCL.md
- llama.rn README (Metal on iOS, Apple7 GPU minimum in earlier versions): https://www.npmjs.com/package/llama.rn
- Infinix Hot 50 Pro+ specs (Helio G100, 8 GB): https://m.gsmarena.com/infinix_hot_50_pro%2B_4g-13408.php
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
