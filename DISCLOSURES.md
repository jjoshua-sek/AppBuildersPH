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

**None.** All AI runs on the phone. The release build has no INTERNET permission, and `src/services/net/netCounter.ts` counts every `fetch`, `XMLHttpRequest` and `WebSocket` attempt; the Proof panel shows the count, which stays at 0.

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

## Development tools (not shipped in the app)

- TypeScript 6.0.3 (Apache-2.0), Jest 29.7.0, ESLint 8.57.1, Prettier 2.8.8, React Native CLI 20.2.0 (all MIT).
- llama.cpp `llama-quantize` (MIT), used on a laptop to make the Q4_0 model file.
- GitHub Actions for CI (typecheck, lint, unit tests).

## AI-assisted development

| Tool | What it was used for |
|---|---|
| Gemini | First draft of the product spec |
| Claude (incl. Claude Code) | Spec review and team plan (`docs/`), app scaffold, runtime, ingest and review work in several PRs (commits marked "Co-authored-by: Claude") |
| Kiro | Part D: README, benchmarks write-up, the TutorSheet screen, the 50-attempt leak gate and this file |
| TODO | Add any other AI tool a teammate used (e.g. Devin, Copilot, ChatGPT) |

Every AI-written change was reviewed, tested and committed by a team member, through pull requests.

## Images and other assets

The app on `main` uses no third-party images. If the UI mockup's images (logo, mascot, illustrations, backgrounds, streak flames) are ported from `ui/expo-preview`, list each one here with who made it and whether it was AI-generated (see #18).

## Pre-existing code

None. The repository started empty at the hackathon, and all app code was written during it. The planning documents in `docs/` were written with the AI tools above.
