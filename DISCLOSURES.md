# Disclosures

Everything Backpack Tutor uses, as the hackathon rules require. Lines marked **TODO** need a value only a teammate has.

## Models (all run on the phone)

| Role | Model | Source | Format / size | License |
|---|---|---|---|---|
| LLM | Gemma 3 1B IT | F16 file from [`ggml-org/gemma-3-1b-it-GGUF`](https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF), quantized by us with `llama-quantize --pure ... Q4_0` | GGUF Q4_0, 569 MB | [Gemma Terms of Use](https://ai.google.dev/gemma/terms) |
| Embeddings | snowflake-arctic-embed-xs | [`ChristianAzinn/snowflake-arctic-embed-xs-gguf`](https://huggingface.co/ChristianAzinn/snowflake-arctic-embed-xs-gguf) | GGUF Q8_0 | Apache-2.0 |
| OCR (Android) | Google ML Kit Text Recognition v2, Latin, **bundled** in the app (`com.google.mlkit:text-recognition:16.0.1`) | Google Maven | built in | [ML Kit Terms](https://developers.google.com/ml-kit/terms) |
| OCR (iOS, code only; no iOS build is shipped) | Apple Vision (`VNRecognizeTextRequest`) | iOS SDK | built in | Apple SDK license |

Model file checksums (`scripts/push-models.sh` prints them when it pushes the models):

| File on the phone | SHA256 |
|---|---|
| `gen.gguf` (Gemma 3 1B IT Q4_0) | TODO |
| `emb.gguf` (arctic-embed-xs Q8_0) | TODO |

Why this model: [`docs/benchmarks.md`](docs/benchmarks.md).

## Runtime

- **llama.rn 0.12.9** (MIT), the React Native binding for **llama.cpp** (MIT). It runs the LLM and the embedder.
- CPU on the Infinix Hot 50 Pro+ (2 threads), our only demo phone.

## Cloud APIs at runtime

**None for the AI.** Every model runs on the phone, and nothing in the study loop (ingest, games, tutor, "why it matters") needs a network. The release build has no INTERNET permission, and `src/services/net/netCounter.ts` counts every `fetch`, `XMLHttpRequest` and `WebSocket` attempt; the Proof panel shows the count, which stays at 0.

**Optional school sync (off by default).** The School Planner can connect a Google Classroom or Microsoft Teams account to pull assignments into an offline task list. It only runs after the student signs in, and only when a network is available; the cached list and reminders work offline. It calls:

| Service | Endpoint | Used for |
|---|---|---|
| Google Classroom API | `classroom.googleapis.com`, Google Sign-In (`play-services-auth`) | Courses, coursework, announcements |
| Microsoft Graph | `graph.microsoft.com`, Microsoft identity platform via AppAuth | Teams assignments and tasks |

These calls are made from native Android code, so the JS cloud-call counter does not see them. The demo is run without a school account connected.

## Libraries in the app

| Library | Version | License |
|---|---|---|
| react-native | 0.87.1 | MIT |
| react | 19.2.3 | MIT |
| llama.rn | 0.12.9 | MIT |
| @op-engineering/op-sqlite (with FTS5) | 18.2.5 | MIT |
| @dr.pogodin/react-native-fs | 2.40.3 | MIT |
| @react-native-community/netinfo | 12.0.1 | MIT |
| react-native-device-info | 15.0.2 | MIT |
| react-native-image-picker | 8.2.1 | MIT |
| zustand | 5.0.15 | MIT |
| @react-navigation/native | 7.5.0 | MIT |
| @react-navigation/native-stack, @react-navigation/bottom-tabs | 7.20.0 | MIT |
| react-native-screens | 4.28.0 | MIT |
| react-native-svg | 15.15.5 | MIT |
| react-native-safe-area-context | 5.10.1 | MIT |
| lucide-react-native (icons) | 1.52.0 | ISC |
| @react-native/new-app-screen | 0.87.1 | MIT |
| @react-native-community/blur | 4.4.1 | MIT |
| net.openid:appauth (Android, school sync sign-in) | 0.11.1 | Apache-2.0 |
| com.google.android.gms:play-services-auth (Android, Google Classroom sign-in) | 22.0.0 | Android SDK License |
| androidx.work:work-runtime (Android, background sync and reminders) | 2.10.1 | Apache-2.0 |

## Development tools (not shipped in the app)

- TypeScript 6.0.3 (Apache-2.0), Jest 29.7.0, ESLint 8.57.1, Prettier 2.8.8, React Native CLI 20.2.0 (all MIT).
- llama.cpp `llama-quantize` (MIT), used on a laptop to make the Q4_0 model file.
- GitHub Actions for CI (typecheck, lint, unit tests).

## AI-assisted development

| Tool | What it was used for |
|---|---|
| Gemini | First draft of the product spec |
| Claude (incl. Claude Code) | Spec review and team plan (`docs/`), app scaffold, runtime, ingest and review work in several PRs (commits marked "Co-authored-by: Claude") |
| Kiro | Part D: README, benchmarks write-up, a TutorSheet prototype, the 50-attempt leak gate and this file |
| ChatGPT | Generated every image in the app (see Images below) |
| TODO | Add any other AI tool a teammate used (e.g. Devin, Copilot, ChatGPT) |

Every AI-written change was reviewed, tested and committed by a team member, through pull requests.

## Images and other assets

Every image in the app was **AI-generated with ChatGPT** for this project. No stock or third-party artwork is used.

| File | What it is |
|---|---|
| `src/assets/images/logo-backpack.png` | App logo |
| `src/assets/images/mascot-robot.png` (also `android/app/src/main/res/drawable-nodpi/tutor_bubble_robot.png`) | Tutor mascot |
| `src/assets/images/illustration-book.png` | Home illustration |
| `src/assets/images/bg-cabin-night.jpg`, `bg-landscape.jpg` | Backgrounds |
| `src/assets/images/flames/flame-spark.png`, `flame-building.png`, `flame-blazing.png`, `flame-legendary.png` | Streak flames |
| `src/assets/images/sample-notes.jpg` | Sample handout photo |

Icons come from lucide-react-native (ISC), listed above.

## Pre-existing code

None. The repository started empty at the hackathon, and all app code was written during it. The planning documents in `docs/` were written with the AI tools above.
