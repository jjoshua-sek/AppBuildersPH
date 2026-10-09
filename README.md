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
5. 📅 A **Daily Term** brings back the words you missed most

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
- [ ] Paste text and camera OCR import
- [ ] AI term and clue extraction
- [ ] Notes Crossword
- [ ] Socratic tutor with leak guard
- [ ] Proof Panel (shows the model, GPU/CPU backend, speed, and **0 cloud calls**)

**Should-have (P1)**
- [ ] Daily Term
- [ ] "Ask my notes" (search your notes by meaning)
- [ ] Missed-term tracking

**Nice-to-have (P2)**
- [ ] PDF import · streaks · Taglish tutor replies · read hints aloud

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| App | React Native CLI (TypeScript, New Architecture), Android arm64 |
| On-device LLM | [llama.rn](https://github.com/mybigday/llama.rn) (llama.cpp), OpenCL GPU on Snapdragon/Adreno with CPU fallback |
| OCR | Google ML Kit Text Recognition v2 (bundled, works offline) |
| Database | op-sqlite with FTS5 full-text search |
| Vector search | Cosine similarity on on-device embeddings |
| State | zustand |
| Animation | react-native-reanimated |

### 🤖 Models (all on-device)

| Role | Model | Format |
|---|---|---|
| LLM | TODO: final pick after benchmarking (candidates: Qwen3.5-2B, Gemma 3 1B QAT, Qwen3.5-0.8B) | GGUF Q4_0 |
| Embeddings | snowflake-arctic-embed-xs | GGUF |
| OCR | ML Kit Text Recognition v2 (Latin, bundled) | — |

---

## → Getting Started

### Requirements
- Node.js 18+ and npm
- Android Studio + Android SDK, JDK 17
- An **Android arm64 phone** (Snapdragon 8 Gen 2+ with 8 GB RAM recommended for GPU speed)
- `adb` installed and USB debugging enabled on the phone

### 1. Clone and install
```bash
git clone https://github.com/jjoshua-sek/AppBuildersPH.git
cd AppBuildersPH
npm install
```

### 2. Install the app once (creates its storage folder)
```bash
npx react-native run-android
```

### 3. Download and push the models
Download a **Q4_0** GGUF LLM and the arctic-embed GGUF from Hugging Face, then run:
```bash
./scripts/push-models.sh path/to/llm-q4_0.gguf path/to/embedder.gguf
```
Models are copied to the phone's app storage, not bundled into the APK.

### 4. Run
```bash
# Development
npx react-native run-android

# Demo / best performance (release build)
npx react-native run-android --mode release
```

### 5. Test offline
Turn on **airplane mode** and use the app. Long-press the logo to open the **Proof Panel**. It should show **Cloud calls: 0**.

---

## 📁 Project Structure

```
AppBuildersPH/
├── README.md
├── DISCLOSURES.md
├── docs/                 # build spec + benchmarks
├── scripts/              # model push script
├── android/              # native code (incl. Kotlin OCR module)
└── src/
    ├── app/              # app entry, navigation, theme
    ├── screens/          # Home, Ingest, Crossword, DailyTerm, ProofPanel, DevBench
    ├── components/       # crossword, daily term, tutor UI
    ├── services/
    │   ├── ai/           # LLM bridge, prompts, term extractor, tutor, leak guard
    │   ├── ingest/       # OCR, chunker, pipeline
    │   ├── rag/          # notes search
    │   ├── game/         # crossword builder, daily term
    │   ├── db/           # database
    │   └── net/          # network call counter
    └── store/            # zustand stores
```

---

## ▪ Benchmarks

TODO: fill in after testing on the demo phone (see `docs/benchmarks.md`).

| Metric | Result |
|---|---|
| Model load time | TODO |
| Time to first token | TODO |
| Tokens per second (GPU / CPU) | TODO |
| Terms found per handout page | TODO |
| Tutor answer leaks (visible) | TODO (target: 0 in 50 tests) |

---

## 🗺️ Roadmap
- Filipino-language tutor
- Teachers share study decks by QR code
- iOS version

## 📜 Disclosures
All models, libraries, and AI tools used are listed in [DISCLOSURES.md](DISCLOSURES.md). **No cloud APIs are used at runtime.**

## 👥 Team
TODO: add team member names and roles

## 📄 License
TODO: choose a license (e.g., MIT)
