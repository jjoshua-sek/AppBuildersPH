# Backpack Tutor: Spec Review and 4-Person Work Split

This is a companion to `docs/BUILD_SPEC.md`. Part 1 reviews the spec against the hackathon rules and judging criteria. Part 2 splits the build into four parts that can be worked on in parallel.

---

## Part 1: Review

### 1.1 Is anything not allowed?

**Nothing in the architecture breaks the rules.** The LLM, the embedder and the OCR all run on the device, and the app makes no cloud calls at runtime. That goes beyond the minimum ("cloud services may be used, but meaningful AI functionality must run locally").

Three compliance risks to manage:

| Risk | Why it matters | What to do |
|---|---|---|
| **Pre-written code.** The spec has about 400 lines of finished TypeScript and Kotlin (§8). | "Substantially built during the hackathon." If that code goes into the repo before the start time, it can look like pre-existing work. | Treat §8 as a design reference. Type the code during the event and commit often, so the git history shows the build. List the spec under "AI-assisted planning" in `DISCLOSURES.md`. Check the organizers' rule on preparing before the event. |
| **"Local AI" vs. "AI for a local audience."** | The theme slide says these are different things. The pitch leans hard on Filipino students, brownouts and ₱0. | Open the pitch with **on-device inference**: airplane mode, GPU backend, 0 cloud calls. Then present the Filipino student as the user who benefits. |
| **Disclosures** | Required. | `DISCLOSURES.md` (§13), owned by Part D. |

### 1.2 Weak points, ranked by score impact

**1. The demo phone requirement is wrong (Technical Execution 20%).**
llama.cpp's OpenCL documentation lists verified GPUs as Adreno 750 (Snapdragon 8 Gen 3), Adreno 830 (8 Elite) and X85. It says A6xx phone GPUs are likely not supported. The spec says "Snapdragon 8 Gen 2 or newer" (Adreno 740), which is unverified.
- Use an **8 Gen 3 or 8 Elite** phone if anyone has one. Otherwise, plan the demo around **CPU speed** and treat the GPU as a bonus.
- Quantize with `llama-quantize --pure ... Q4_0`. Without `--pure`, some tensors stay in other formats and run slower on the GPU.
- Most Filipino students have MediaTek or Exynos phones with Mali GPUs, which have no GPU path here. A judge may ask about this. Have the CPU tok/s number from the 0.8B backup model ready.

**2. The model shortlist is out of date (Local AI 25%).**
- **Gemma 4 E2B** (Apache 2.0, built for phones, QAT builds exist) is newer than Gemma 3 1B. Add it to the hour-1 benchmark as a safe-default candidate. Confirm that your llama.rn version supports its architecture.
- **Qwen3.5 0.8B / 2B** are hybrid Gated-DeltaNet models. Most of their layers are linear attention, which the OpenCL backend may not accelerate. The spec already flags this. Keep the benchmark as the deciding test.
- Only community GGUFs of Qwen3.5 exist, and some repos are mislabeled. Download from the official org or a well-known quantizer, and record the SHA256 hashes.

**3. The embedding model barely matters to the core loop (Local AI 25%).**
The pitch says "three on-device models," but the embedder only powers "Ask my notes," which is a P1 feature. If that feature is cut, a judge will see the embedder as filler. Pick one of these:
- (a) Use embeddings in the P0 loop: drop near-duplicate terms (cosine > 0.9) and pick the crossword's 6–10 terms for **topic coverage** across chunks. That's about 20 lines.
- (b) Or claim only what is real: "LLM + OCR in the loop; embeddings for search."

**4. False positives in the leak guard (Innovation and Demo 30%).**
`leaks()` removes spaces and does a plain substring check. For short terms, this matches inside unrelated words. For example, the term `ROI` matches "he**roi**c", and `RISK` matches "b**risk**".
- Effect on the tutor: harmless hints trigger a retry and then the template fallback, so the tutor looks dumb on stage.
- Effect on term extraction: valid clues are rejected because `extractTerms` uses the same check.
- **Fix:** for terms shorter than 7 letters, use a word-boundary regex on the un-normalized text, plus a separate check for spelled-out letters (`A-U-D-I-T`, `a u d i t`). Add a unit test for each case. Owner: Part D.

**5. The usefulness story is narrow (Problem and Usefulness 25%).**
Clue → term recall tests vocabulary, but board exams test concepts. A judge may ask: "Is a crossword how people actually review?"
- **Cheap upgrade (P1):** after the student solves an entry, the tutor asks one "why does this matter?" question built from the same chunk. That shows the LLM handling concepts, not only definitions, and needs no new UI.
- Keep the crossword. It is visual and demos well.

**6. Smaller technical issues**
- `op-sqlite` changed its result shape between versions (`rows` vs. `rows._array`). Pin the version and check it in M0.
- Gemma's chat template has no system role. llama.cpp's Jinja template merges the system message into the first user turn. Test the tutor prompt with the chosen model's template, not just with Qwen's.
- Both models are loaded at app start. On an 8 GB phone that's fine. On the 4–6 GB backup phone, load the embedder only during ingest.

### 1.3 Are there better existing products?

| Competitor | Threat | How we differ |
|---|---|---|
| **Google AI Edge Gallery** (LiteRT-LM, Gemma 4 offline) | Proves Gemma runs offline on phones. Judges may know it. | A model showcase, not a study product. No notes → games → tutor loop. |
| **ML Kit Prompt API / Gemini Nano (AICore)** | Google's own on-device LLM API. No model download. | Only on recent flagship phones, no JSON-grammar control, and you can't choose the model. |
| **PocketPal AI, Off Grid, ChatterUI** | Offline llama.cpp chat apps. | Generic chat, no teaching method, no leak guard. |
| **NotebookLM, Quizlet, Khanmigo** | Better content quality. | Cloud only. Notes leave the device. |

**Runtime alternatives.** We checked whether another runtime beats llama.rn:
- **LiteRT-LM** (Google AI Edge): better Android GPU coverage, including Mali. But it has no maintained React Native binding and no grammar-constrained JSON output.
- **react-native-executorch**: ships RN hooks for LLM, OCR and embeddings. But its model choice is narrower, and JSON-schema decoding is not built in.

**Verdict:** keep **llama.rn**. Grammar-constrained JSON is what makes term extraction reliable. Mention LiteRT-LM as "next: wider GPU coverage" in the future-work slide.

### 1.4 Summary of recommended changes to the spec

1. Demo phone: 8 Gen 3 or newer. Quantize with `--pure`. Prepare a CPU-only story.
2. Add Gemma 4 E2B to the hour-1 benchmark.
3. Use embeddings in P0 for term dedupe and coverage, or stop claiming three models.
4. Use word-boundary leak checks for short terms, with unit tests.
5. Optional P1: a "why does it matter" question after each solved entry.
6. Type the code during the event. Pitch on-device inference first, the Filipino audience second.

---

## Part 2: Work split

The spec's lanes (§12.1) are kept, but each part now has **exact file ownership, a frozen interface, and a mock**, so nobody waits on anyone else after hour 2.

### 2.0 Hour 0–1: everyone together (about 30 minutes)

1. Agree on and commit **`src/types.ts`** (below). After that, it changes only with the whole team's agreement.
2. Part A creates the RN project and pushes `main`. The others work in plain TS meanwhile (Jest needs no phone).
3. **Everyone installs llama.cpp on their laptop** and downloads the same candidate GGUF. Parts B and D can then tune prompts with `llama-cli` / `llama-server` on the laptop without the phone. This is a development tool only, never used by the app at runtime.
4. Each part works on its own branch (`lane-a`, `lane-b`, …) and merges to `main` at the milestones. `main` must always build.

```ts
// src/types.ts — shared contract (frozen after hour 1)
export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

// Part A provides; Parts B and D call it
export interface AiBridge {
  complete(o: { messages: Msg[]; n_predict?: number; temperature?: number;
                jsonSchema?: object; onToken?: (t: string) => void }): Promise<string>;
  stopGeneration(): void;
  embed(text: string): Promise<Float32Array>;
}

// Part B writes these to the DB; Parts C and D read them
export type TermRow = { id: string; doc_id: string; chunk_id: string;
                        term: string; answer: string; clue: string };

// Part C opens the tutor with these props; Part D implements the component
export type TutorSheetProps = {
  term: TermRow; visible: boolean;
  onClose(): void; onSolved(): void;   // onSolved → game locks the entry
};

// Part C writes attempts; Part B owns the table
export type Attempt = { term_id: string; mode: 'crossword' | 'daily';
                        correct: 0 | 1; hints_used: number; ts: number };
```

**Mock bridge** (Part A commits it in hour 1 as `src/services/ai/mockBridge.ts`). It returns canned JSON for term extraction, a canned guiding question streamed token by token, and random unit vectors for embeddings. An env flag switches between the mock and the real bridge. Parts B, C and D build against the mock until M2.

**Sample data** (Part B commits it in hour 1 as `src/assets/sample/it_audit_ch1.txt` and `sample_terms.json`, with 10 hand-written TermRows). Part C builds the crossword from these on day 1.

---

### Part A: Runtime and platform

**Goal:** a release build that loads the models, runs them fast on the GPU (or CPU), and proves it on screen.

| Owns (only A edits these) |
|---|
| `android/` (except `.../ocr/`), `package.json`, `babel.config.js`, `index.js` |
| `src/app/{App.tsx, navigation.tsx, theme.ts}` |
| `src/services/ai/{llamaBridge.ts, mockBridge.ts}`, `src/services/net/netCounter.ts` |
| `src/screens/{Home, DevBench, ProofPanel}Screen.tsx`, splash/model-loading screen |
| `src/store/useAiStore.ts`, `scripts/push-models.sh`, `docs/benchmarks.md` |

**Tasks**
1. **M0 (H2):** create the RN CLI project with the New Architecture, install all dependencies (§10.1), set `op-sqlite` fts5, add manifest `libOpenCL.so`, `abiFilters arm64-v8a` and the proguard rule. Get llama.rn to stream one reply on the demo phone.
2. **Mock bridge** (hour 1) and the shared `types.ts`.
3. **M1 (H4):** DevBench. Benchmark Gemma 4 E2B, Gemma 3 1B QAT, Qwen3.5 2B and 0.8B, each in Q4_0 `--pure`, on GPU and CPU. Measure load time, TTFT, tok/s and JSON parse rate (using Part B's prompt) and raw leak rate (using Part D's prompt). Write `benchmarks.md` and choose the model.
4. Splash screen with load progress, a "choose model file" fallback picker, and serialized `complete` / `embed` calls.
5. **M3:** ProofPanel (backend, devices, TTFT, tok/s, NetInfo type, `net.calls`) and netCounter imported at the top of `index.js`.
6. Navigation: Home → Ingest (B) → Crossword / Daily (C) → Tutor sheet (D).
7. **M6:** release builds for both phones, model push on both, and 5 airplane-mode rehearsals.

**Done when:** a release APK on both phones loads in under 8 s, ProofPanel shows real numbers, and `net.calls = 0`.

---

### Part B: Ingest and data

**Goal:** a photo or pasted text becomes chunks, embeddings and 6–10 validated terms in the DB in under 60 s.

| Owns |
|---|
| `android/app/src/main/java/com/backpacktutor/ocr/{OcrModule.kt, OcrPackage.kt}` (plus a one-line registration in `MainApplication.kt`, coordinated with A) |
| `src/services/ingest/{ocr, chunker, pipeline}.ts` |
| `src/services/ai/termExtractor.ts` and `TERM_SYSTEM` in `prompts.ts` (D owns the rest of `prompts.ts`) |
| `src/services/db/{client, schema}.ts`, `src/services/rag/retrieve.ts` |
| `src/screens/IngestScreen.tsx`, `src/store/useDeckStore.ts`, `src/assets/sample/*` |

**Tasks**
1. Hour 1: sample text plus `sample_terms.json` for Part C.
2. DB schema and `migrate()`, plus the query helpers the others need: `getTerms(docId)`, `getChunk(id)`, `logAttempt(a)` and `getDailyTerm(docId)`, which runs `PICK_DAILY_SQL` and caches the result in `daily`. **Others never write SQL;** they call these functions.
3. Chunker (Jest tests). Term extractor with JSON schema and validation. Tune `TERM_SYSTEM` on the laptop with llama.cpp until there are at least 6 valid terms per page and a parse rate of at least 90% over 5 sample pages.
4. Use embeddings in P0 (review item 3): dedupe near-identical terms and select the crossword terms for coverage.
5. Kotlin OCR on the **bundled** ML Kit artifact. Test it on a fresh install in airplane mode.
6. IngestScreen: paste box, camera button, OCR preview, and a "Reading chunk 2/3 · 7 terms found" progress line. Play becomes enabled once `ready` is true.
7. P1: "Ask my notes" with `searchNotes`.

**Done when:** one tested handout page yields at least 6 valid terms in under 60 s on the phone, offline.

---

### Part C: Games

**Goal:** a playable, polished crossword (plus the Daily Term) built from any list of TermRows.

| Owns |
|---|
| `src/services/game/{crossword, dailyTerm}.ts` + their Jest tests |
| `src/components/crossword/*`, `src/components/daily/*` |
| `src/screens/{Crossword, DailyTerm}Screen.tsx`, `src/store/useGameStore.ts` |

**Tasks**
1. Day 1, no phone needed: `crossword.ts` and `dailyTerm.ts` with unit tests. Build from 20 random term sets: at least 5 words placed in at least 90% of cases, no overlaps. Test duplicate letters with `LEVEL` vs. `EAGLE`.
2. Grid, Cell and ClueBar UI. Tap a clue to type, check instantly, lock correct cells in green. Use Reanimated for the animations.
3. Clue List fallback when fewer than 5 words place.
4. Two wrong submissions on an entry, or a tap on 🦉, opens `<TutorSheet term=… />` (a stub until Part D merges it). `onSolved` locks the entry.
5. Log every submission with `logAttempt` (Part B's helper).
6. **M5 (P1):** Daily Term board (6 rows × term length) with an on-screen keyboard. It accepts any A–Z guess of the right length, and 3 misses open the tutor.

**Done when:** the crossword is playable from `sample_terms.json` with the mock tutor, and later from real ingested terms.

---

### Part D: Tutor, safety and pitch

**Goal:** a Socratic tutor that never leaks the answer, plus everything the judges see beyond the app.

| Owns |
|---|
| `src/services/ai/{tutor, leakGuard}.ts` and `tutorSystem` in `prompts.ts` |
| `src/components/tutor/TutorSheet.tsx` |
| Leak test harness (Jest unit tests plus a DevBench "leak test" button coordinated with A) |
| `README.md`, `DISCLOSURES.md`, slides, demo script, backup video |

**Tasks**
1. Day 1, no phone: `leakGuard.ts` with Jest tests, **including the short-term word-boundary fix** (review item 4). `maskTerm` tests for variants such as authenticate / authentication.
2. Tune the tutor prompt on the laptop with llama.cpp: 10 terms × 5 scripted student messages ("just tell me", "first letters?", a Taglish request…). Add one few-shot example that targets the chosen model's most common mistake.
3. `tutor.ts`: layer 0 (correct answer typed in chat), mask, StreamGuard with `stopGeneration`, retry, template fallback.
4. TutorSheet UI: bottom sheet, streaming text, a "Thinking…" status, chat history (last 4 turns).
5. **Ship gate:** 0 visible leaks in 50 scripted attempts on the phone. Record the raw leak rate and fallback rate in `benchmarks.md`.
6. Pitch: the problem slide (find one citable statistic on PH mobile data cost or connectivity), a 3-minute script (§12.3) that **opens with on-device inference**, a judge Q&A sheet (§12.4 plus the Mali/MediaTek question), and the backup video the night before.
7. `DISCLOSURES.md`: models, SHA256 hashes, licenses, libraries, AI-assisted development (Claude and Gemini for the spec).

**Done when:** the leak gate passes, and the slides, README, DISCLOSURES and video are committed or ready.

---

### 2.1 Who depends on whom

| Needs | From | When | Until then, use |
|---|---|---|---|
| RN project | A | H2 | Plain TS + Jest |
| `complete` / `embed` | A | H4 | `mockBridge.ts` |
| TermRows in DB | B | H10 | `sample_terms.json` |
| `logAttempt`, `getDailyTerm` | B | H8 | An in-memory array |
| TutorSheet | D | H10 | A stub sheet that says "tutor here" |
| Chosen model's prompt behavior | A (benchmark) | H4 | Laptop llama.cpp, same GGUF |

### 2.2 Milestones (unchanged from §12.2, with owners)

| Milestone | By | Owner of the exit check |
|---|---|---|
| M0 Skeleton | H2 | A |
| M1 Model lock | H4 | A (with B's and D's prompts) |
| M2 Vertical slice: paste → terms → crossword → guarded hint | H10 | **All four.** First integration merge. |
| M3 Camera + RAG + ProofPanel | H14 | B, A |
| M4 P0 polish, feature freeze | H18 | C, D |
| M5 Daily Term | H20 | C |
| M6 Harden, 5 rehearsals, video | H22–24 | A, D |

### Sources
- llama.cpp OpenCL backend (Q4_0 focus, `--pure`, verified Adreno 750/830/X85, A6xx unsupported): https://huggingface.co/OpenTransformer/llama.cpp-prismml/blob/main/docs/backend/OPENCL.md
- Qwen3.5 0.8B hybrid Gated DeltaNet architecture: https://tinyweights.dev/posts/qwen3-5-tiny-multimodal-thinking-model/ and https://huggingface.co/AaryanK/Qwen3.5-0.8B-GGUF
- Gemma 4 E2B on phones and QAT GGUF: https://www.mindstudio.ai/blog/gemma-4-e2b-e4b-edge-models-phone-local and https://huggingface.co/leok7v/gemma-4-e2b-it-qat
- LiteRT-LM, AI Edge Gallery, MediaPipe LLM in maintenance mode: https://gemma4all.com/blog/gemma-4-on-phone
- ML Kit Prompt API with Gemma 4: https://medium.com/google-cloud/building-your-first-on-device-ai-feature-with-gemma-4-and-the-ml-kit-prompt-api-1fe94039ab4d
