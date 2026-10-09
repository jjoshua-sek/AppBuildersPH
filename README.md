# 🎒 Backpack Tutor

**An offline study app that turns your own handouts into puzzles and coaches you with an AI tutor that never gives the answer away. Everything runs on your phone, even in airplane mode.**

> Built for the Local AI hackathon theme: *"useful when the cloud disappears."*

> ⚠️ **Status:** In active development during the hackathon.

---

## 📖 The Problem

Filipino college students and board/certification reviewees often study from printed handouts on long commutes, in the provinces, or during brownouts. Mobile data in those places is slow, unavailable, or expensive.

The best AI study tools need the cloud. With no signal or no load, they stop working. They also require uploading your handouts, which are often private review-center material, to someone else's servers.

**Meet Maria:** a BSIT student reviewing her IT Audit chapter on a two-hour jeep ride with no signal.

## 💡 Our Solution

Backpack Tutor puts the AI **on the phone itself**:

1. 📸 **Snap a handout**, import a file (PDF, TXT, DOCX) or paste your notes
2. 🧠 The on-device AI **finds the key terms and writes clues** from *your* material
3. 🧩 Play **Wordscape** or a **Notes Crossword** built from those terms
4. 🦉 Stuck? A **Socratic tutor** asks guiding questions based on your notes. It won't just give you the answer.
5. 💡 After you solve a term, a **"why it matters" card** explains it
6. 📅 A **Daily Term** brings back the words you missed most

## ✨ Why Local AI?

| | |
|---|---|
| ✈️ **Offline** | Works with zero signal: on the jeep, in the province, during a brownout |
| 💸 **Free at scale** | Unlimited puzzles at ₱0 each, with no cost per cloud call |
| 🔒 **Private** | Your notes never leave your phone |
| ⚡ **Instant** | Answers are checked in milliseconds, and hints stream with no network delay |

**Without the AI, nothing works:** no puzzles, no clues, no tutor. Local AI runs every step of the app.

---

## 🔄 How It Works

```
 📸 Snap handout / paste notes
        │  ML Kit OCR ............................ on-device model #1
        ▼
 ✂️ Split into chunks  →  🔢 Embed each chunk .... on-device model #2
        │
        ▼
 🧠 Extract terms + write clues (JSON) ........... on-device LLM #3
        │
        ├──► 🧩 Wordscape / Notes Crossword (built from your terms)
        │          │ stuck / 2 wrong answers
        │          ▼
        │      🦉 Socratic Tutor (answer hidden from the AI + leak guard)
        │
        └──► 📅 Daily Term (picked from your missed terms)
```

### 🛡️ How the tutor keeps the answer secret
Small AI models often blurt out the answer even when told not to. We don't rely on the prompt alone:

1. **The AI never sees the answer.** The term (and variations of it) is blanked out of the notes before they reach the model.
2. **Every word is checked before you see it.** If the answer starts to appear, generation stops right away.
3. **Backup plan.** The tutor retries, then falls back to a safe pre-written hint.

If you type the correct answer into the chat, the game marks it solved without even calling the AI.

---

## 🎮 Features

**Must-have (P0)**
- [x] Camera, photo, file (PDF, TXT, DOCX) and pasted-text import
- [x] AI term and clue extraction, with a clear message when fewer than 3 terms are found
- [x] Proof Panel (shows the model, CPU backend, speed, and **0 cloud calls**)
- [x] Wordscape and Notes Crossword built from your terms
- [x] Socratic tutor with leak guard, opened from a game entry
- [x] "Why it matters" card after each solved term

**Should-have (P1)**
- [x] "Ask my notes" (search your notes by meaning)
- [x] Daily Term
- [x] Missed-term tracking
- [x] Streaks and progress
- [ ] Tutor chat tab with answers checked against your notes (after #22)
- [ ] Review terms, add pages to a deck, multiple-choice quiz (#21, #22)

**Nice-to-have (P2)**
- [x] Optional School Planner: syncs Google Classroom / Microsoft Teams tasks when online (off by default)
- [ ] Taglish tutor replies · read hints aloud

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| App | React Native 0.87 CLI (TypeScript, New Architecture), Android. iOS code exists but isn't built or tested |
| On-device LLM | [llama.rn](https://github.com/mybigday/llama.rn) 0.12 (llama.cpp): CPU on the Infinix (2 threads) |
| OCR | Google ML Kit Text Recognition v2 (bundled, works offline) |
| Database | op-sqlite with FTS5 full-text search |
| Vector search | Cosine similarity on on-device embeddings |
| State | zustand |
| UI | react-navigation (native stack + bottom tabs: Home, Decks, Games, Progress), react-native-screens, react-native-svg, lucide icons, AI-generated artwork (ChatGPT) |

### 🤖 Models (all on-device)

| Role | Model | Format | Size |
|---|---|---|---|
| LLM | Gemma 3 1B IT (quantized with `llama-quantize --pure` from the [ggml-org F16 file](https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF)) | GGUF Q4_0 | 569 MB |
| Embeddings | [snowflake-arctic-embed-xs](https://huggingface.co/ChristianAzinn/snowflake-arctic-embed-xs-gguf) | GGUF Q8_0 | small |
| OCR | ML Kit Text Recognition v2 | built in | — |

Why this model: see [`docs/benchmarks.md`](docs/benchmarks.md).

---

## 🚀 Getting Started

> Full step-by-step guide, including Windows fixes: **[`docs/RUNTIME_SETUP.md`](docs/RUNTIME_SETUP.md)**.

### Requirements
- **Node.js 22.11+** and npm (the project requires it)
- **Android:** Android Studio + Android SDK, JDK 17, `adb` with USB debugging on the phone

### Phones

| Phone | Chip | How the AI runs | Role |
|---|---|---|---|
| **Infinix Hot 50 Pro+** | Helio G100, 8 GB | CPU, 2 threads | **The demo and test phone** ("Maria's phone") |

The app picks settings for each phone automatically (`src/services/device/deviceProfile.ts`). Most budget Android phones in the Philippines use MediaTek chips with Mali GPUs, which llama.rn can't use yet, so the AI runs on the CPU there.

### 1. Clone and install
```bash
git clone https://github.com/jjoshua-sek/AppBuildersPH.git
cd AppBuildersPH
npm install
```

### 2. Install the app once (creates its storage folder)
```bash
npx react-native run-android --mode release
```
Open the app once. It shows "Missing LLM" until the models are on the phone.

### 3. Get the models and push them to the phone
Make the Gemma 3 1B Q4_0 file and download the arctic-embed Q8_0 file (see [`docs/RUNTIME_SETUP.md`](docs/RUNTIME_SETUP.md) §1). On the phone they **must be named `gen.gguf` (LLM) and `emb.gguf` (embedder)**. The script renames them for you:
```bash
scripts/push-models.sh ~/models/gemma-3-1b-it-Q4_0.gguf ~/models/snowflake-arctic-embed-xs-Q8_0.gguf
```
Then tap **Retry** on the splash screen. Models are copied to the phone's app storage, not bundled into the app.

### 4. Run
```bash
# Android: demo / best performance (release build, no INTERNET permission)
npx react-native run-android --mode release

# Android: development (needs Metro running)
npx react-native run-android
```

### Windows notes
- If `npm install` fails on llama.rn's download, run `$env:RNLLAMA_SKIP_POSTINSTALL = "1"; npm install`, then `node node_modules/llama.rn/install/download-native-artifacts.js`.
- If you get `SDK location not found`, create `android/local.properties` with your SDK path (`sdk.dir=...`).
- Without Git Bash, push the models with `adb push` in PowerShell.

The exact commands are in [`docs/RUNTIME_SETUP.md`](docs/RUNTIME_SETUP.md) ("Windows troubleshooting").

### 5. Test offline
Turn on **airplane mode** and use the app. Long-press the title (or tap **Proof panel**). It should show **Cloud calls this session: 0**.

### 6. Run the checks (no phone needed)
```bash
npx tsc --noEmit && npm run lint && npm test
```

---

## 📁 Project Structure

```
AppBuildersPH/
├── README.md
├── CONTRIBUTING.md
├── docs/
│   ├── BUILD_SPEC.md         # the build spec
│   ├── TEAM_PLAN.md          # review + 4-lane work split
│   ├── RUNTIME_SETUP.md      # setup on each phone
│   ├── DEVICES_AND_DEMO.md   # phones and demo script
│   ├── benchmarks.md         # DevBench results
│   └── bench/                # laptop extraction benchmark
├── scripts/                  # push-models.sh, bench/
├── android/                  # native code (Kotlin ML Kit OCR, file import, optional school sync)
├── ios/                      # iOS native code (not built for the hackathon)
└── src/
    ├── app/                  # App.tsx, navigation.tsx (tabs + stack), theme
    ├── screens/              # Splash, Home, Decks, Games, Progress, Ingest (Scan Notes),
    │                         # Wordscape, Crossword, DailyTerm, AskNotes, SchoolPlanner,
    │                         # ProofPanel, DevBench, UiCheck
    ├── components/           # TutorSheet, ui, Gradient, deck and streak components
    ├── assets/               # images (AI-generated) and sample handout + terms
    ├── services/
    │   ├── ai/               # llama.rn bridge, prompts, term extractor, tutor, leak guard, DevBench
    │   ├── ingest/           # OCR, file import, chunker, pipeline
    │   ├── rag/              # notes search, term selection
    │   ├── game/             # crossword builder, Wordscape layout, daily term
    │   ├── db/               # database schema + queries
    │   ├── device/           # per-phone settings
    │   ├── net/              # network call counter
    │   └── school/           # optional School Planner sync
    └── store/                # zustand stores
```

---

## 📊 Benchmarks

Measured on the **Infinix Hot 50 Pro+** (CPU, 2 threads, Gemma 3 1B Q4_0). Details in [`docs/benchmarks.md`](docs/benchmarks.md).

| Metric | Result |
|---|---|
| Model load time | **~2.0 s** |
| Generation speed | **~20 tokens/s** |
| Prompt speed | ~80 tokens/s |
| Terms found per handout page | **~10** on typed text, 7–8 from a real photo |
| Time to read a whole page | ~50 s |
| Tutor answer leaks (visible) | **0 / 20** (50-attempt run on the Infinix: pending) |
| Cloud calls | **0** |

---

## 🗺️ Roadmap
- Filipino-language tutor
- Teachers share study decks by QR code
- GPU speed-up on more Android phones (MediaTek / Mali)

## 📜 Disclosures
Every model, library, AI tool and image is listed in [`DISCLOSURES.md`](DISCLOSURES.md). **The AI never uses the cloud.** The optional School Planner can sync Google Classroom / Microsoft Teams tasks when online; it is off by default and not used in the demo.

## 🤝 Contributing
See [`CONTRIBUTING.md`](CONTRIBUTING.md): branch from `main`, open a pull request, and run the checks first.

## 👥 Team

| Part | Owns | Member |
|---|---|---|
| A: Runtime | Project setup, llama.rn, model benchmark, Proof Panel, release builds | [@jjoshua-sek](https://github.com/jjoshua-sek), Kiev Gonzales (device builds) |
| B: Ingest and data | Camera OCR, chunking, term extraction, database, Ask my notes | Michael ([@delosreyesmichaeljeffrey-stack](https://github.com/delosreyesmichaeljeffrey-stack)) |
| C: Games and UI | Wordscape, Crossword, Daily Term, the app UI | Jedrick ([@def-jedd](https://github.com/def-jedd)) |
| D: Tutor | Leak guard and its tests, tutor prompt, leak gate, README, disclosures | Kiev Gonzales ([@kvzl0](https://github.com/kvzl0)) |
| Pitch | Slides, demo script, backup video | TODO |

## 📄 License
TODO: choose a license (e.g., MIT)
