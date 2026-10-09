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

1. 📸 **Snap a handout** (or paste your notes)
2. 🧠 The on-device AI **finds the key terms and writes clues** from *your* material
3. 🧩 Play a **Notes Crossword** built from those terms
4. 🦉 Stuck? A **Socratic tutor** asks guiding questions based on your notes. It won't just give you the answer.
5. 💡 After you solve a term, a **"why it matters" card** explains it
6. 📅 A **Daily Term** brings back the words you missed most

## · Why Local AI?

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
        ├──► 🧩 Notes Crossword (built from your terms)
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
- [x] Paste text and camera OCR import
- [x] AI term and clue extraction
- [x] Proof Panel (shows the model, GPU/CPU backend, speed, and **0 cloud calls**)
- [ ] Notes Crossword (logic done, screen in progress)
- [ ] Socratic tutor with leak guard (logic done, screen in progress)
- [ ] "Why it matters" card after each solved term

**Should-have (P1)**
- [x] "Ask my notes" (search your notes by meaning)
- [ ] Daily Term (logic done, screen in progress)
- [ ] Missed-term tracking

**Nice-to-have (P2)**
- [ ] PDF import · streaks · Taglish tutor replies · read hints aloud

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| App | React Native 0.87 CLI (TypeScript, New Architecture), Android and iOS (iOS code exists but isn't built yet) |
| On-device LLM | [llama.rn](https://github.com/mybigday/llama.rn) 0.12 (llama.cpp): CPU on the Infinix (2 threads), Metal GPU on the iPhone 13 Pro Max |
| OCR | Google ML Kit Text Recognition v2 on Android (bundled, works offline), Apple Vision on iOS |
| Database | op-sqlite with FTS5 full-text search |
| Vector search | Cosine similarity on on-device embeddings |
| State | zustand |
| UI | react-navigation (native stack + bottom tabs), react-native-screens, react-native-svg, lucide icons |

### 🤖 Models (all on-device)

| Role | Model | Format | Size |
|---|---|---|---|
| LLM | Gemma 3 1B IT (quantized with `llama-quantize --pure` from the [ggml-org F16 file](https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF)) | GGUF Q4_0 | 569 MB |
| Embeddings | [snowflake-arctic-embed-xs](https://huggingface.co/ChristianAzinn/snowflake-arctic-embed-xs-gguf) | GGUF Q8_0 | small |
| OCR | ML Kit Text Recognition v2 (Android) / Apple Vision (iOS) | built in | — |

Why this model: see [`docs/benchmarks.md`](docs/benchmarks.md).

---

## → Getting Started

> Full step-by-step guide, including Windows fixes and iOS: **[`docs/RUNTIME_SETUP.md`](docs/RUNTIME_SETUP.md)**.

### Requirements
- **Node.js 22.11+** and npm (the project requires it)
- **Android:** Android Studio + Android SDK, JDK 17, `adb` with USB debugging on the phone
- **iOS:** a Mac with Xcode and CocoaPods

### Phones

| Phone | Chip | How the AI runs | Role |
|---|---|---|---|
| **Infinix Hot 50 Pro+** | Helio G100, 8 GB | CPU, 2 threads | **Main demo phone** ("Maria's phone") |
| iPhone 13 Pro Max | A15, 6 GB | Metal GPU | Fast path (needs a Mac to build) |
| iPhone 11 | A13, 4 GB | CPU, 2 threads | Spare / judge pass-around (needs a Mac to build) |

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
iOS steps (Xcode signing, copying models with Finder) are in [`docs/RUNTIME_SETUP.md`](docs/RUNTIME_SETUP.md) §3.

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
├── android/                  # native code (incl. Kotlin ML Kit OCR module)
├── ios/                      # native code (incl. Swift Apple Vision OCR module)
└── src/
    ├── app/                  # App.tsx, navigation, theme
    ├── screens/              # Splash, Home, Ingest, AskNotes, ProofPanel, DevBench, UiCheck
    ├── components/           # Button, Gradient
    ├── assets/sample/        # sample handout + terms
    ├── services/
    │   ├── ai/               # llama.rn bridge, prompts, term extractor, tutor, leak guard, DevBench
    │   ├── ingest/           # OCR, chunker, pipeline
    │   ├── rag/              # notes search, term selection
    │   ├── game/             # crossword builder, daily term
    │   ├── db/               # database schema + queries
    │   ├── device/           # per-phone settings
    │   └── net/              # network call counter
    └── store/                # zustand stores
```

---

## ▪ Benchmarks

Measured on the **Infinix Hot 50 Pro+** (CPU, 2 threads, Gemma 3 1B Q4_0). Details in [`docs/benchmarks.md`](docs/benchmarks.md).

| Metric | Result |
|---|---|
| Model load time | **~2.0 s** |
| Generation speed | **~20 tokens/s** |
| Prompt speed | ~80 tokens/s |
| Terms found per handout page | **~10** |
| Time to read a whole page | ~47–50 s |
| Tutor answer leaks (visible) | **0 / 20** (50-test run still to do) |
| Cloud calls | **0** |

---

## 🗺️ Roadmap
- Filipino-language tutor
- Teachers share study decks by QR code
- GPU speed-up on more Android phones (MediaTek / Mali)

## 📜 Disclosures
All models, libraries, and AI tools used will be listed in `DISCLOSURES.md` (being added by Part D). **No cloud APIs are used at runtime.**

## 🤝 Contributing
See [`CONTRIBUTING.md`](CONTRIBUTING.md): branch from `main`, open a pull request, and run the checks first.

## 👥 Team

| Part | Owns | Member |
|---|---|---|
| A: Runtime | Project setup, llama.rn, model benchmark, Proof Panel, release builds | TODO |
| B: Ingest and data | Camera OCR, chunking, term extraction, database, Ingest screen | TODO |
| C: Games | Crossword, clue-list fallback, Daily Term | TODO |
| D: Tutor | Leak guard and its tests, tutor prompt and screen, README, disclosures | Kiev Gonzales ([@kvzl0](https://github.com/kvzl0)) |
| Pitch | Slides, demo script, backup video | TODO |

## 📄 License
TODO: choose a license (e.g., MIT)
