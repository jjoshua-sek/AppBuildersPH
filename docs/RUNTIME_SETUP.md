# Runtime Setup (Part A)

Step by step: from a fresh clone to models running on all four phones, then the hour-1 benchmark.

## 1. Get the models (laptop, once)

Put them in a `models/` folder outside the repo (`*.gguf` is gitignored anyway).

| File on the phone | What | Where |
|---|---|---|
| `gen.gguf` | **Candidate 1:** Gemma 3 1B IT, QAT Q4_0 | Hugging Face `google/gemma-3-1b-it-qat-q4_0-gguf` (log in and accept Google's license first) |
| `gen.gguf` | **Candidate 2:** Qwen3.5 0.8B Instruct, Q4_0 | Qwen's official Hugging Face org. If there's no Q4_0 file, convert it yourself (below) |
| `gen.gguf` | **Candidate 3:** Llama 3.2 1B Instruct, Q4_0 | Same as above |
| `emb.gguf` | snowflake-arctic-embed-xs, Q8_0 or F16 | `ChristianAzinn/snowflake-arctic-embed-xs-gguf` |

To make a Q4_0 file from a full-precision model (with [llama.cpp](https://github.com/ggml-org/llama.cpp) built on the laptop):
```bash
python convert_hf_to_gguf.py path/to/hf-model --outfile model-f16.gguf --outtype f16
./llama-quantize --pure model-f16.gguf model-q4_0.gguf Q4_0
```
`--pure` keeps every tensor in Q4_0, which llama.cpp repacks for fast ARM CPU math.

Keep each candidate's file around ~1 GB or smaller; the iPhone 11 has 4 GB.

## 2. Android: Infinix Hot 50 Pro+ and Tecno Pova 4

One-time phone setup: Settings → About phone → tap **Build number** 7 times → Developer options → **USB debugging** on. Infinix/Tecno (XOS/HiOS) may also need **"Install via USB"** turned on in Developer options.

```bash
npm install
npx react-native run-android --mode release   # demo build: no INTERNET permission
# or: npx react-native run-android            # debug build, needs Metro running
```
Open the app once (it creates its folder and shows "Missing LLM"), then:
```bash
scripts/push-models.sh ~/models/gemma-3-1b-it-q4_0.gguf ~/models/arctic-embed-xs-q8_0.gguf
# two phones plugged in? pass the serial from `adb devices` as the 3rd argument
```
Tap **Retry** on the splash screen.

## 3. iOS: iPhone 13 Pro Max and iPhone 11 (needs a Mac)

```bash
npm install
cd ios && bundle install && bundle exec pod install && cd ..
open ios/BackpackTutor.xcworkspace
```
In Xcode:
1. Target **BackpackTutor** → Signing & Capabilities → Team: your Apple ID (a free one works; its apps expire after **7 days**).
2. If your team allows it: **+ Capability** → *Increased Memory Limit* and *Extended Virtual Addressing*. They matter most on the iPhone 11.
3. Product → Scheme → Edit Scheme → Run → Build Configuration: **Release**.
4. Pick the iPhone and press Run. On the phone: Settings → Privacy & Security → **Developer Mode** on. Then Settings → General → VPN & Device Management → trust your Apple ID.

Copy the models: Finder → the iPhone → **Files** tab → BackpackTutor → drag in a `models` folder that contains `gen.gguf` and `emb.gguf`. Reopen the app.

## 4. Check it works
- Long-press the title (or tap **Proof panel**):
  - Tier: `ios-metal` on the 13 Pro Max, `ios-cpu` on the 11, `android-cpu` on the MediaTek phones.
  - Backend: **GPU** on the 13 Pro Max, **CPU · N threads** on the others.
- Airplane mode on, Wi-Fi off: **Cloud calls this session** stays **0**.

## 5. Hour-1 benchmark (DevBench)
For **each candidate model** on **each phone** (start with the Tecno Pova 4; it is the slowest and decides the model):
1. **Speed:** prompt and generation tok/s.
2. **Thread sweep** (Android): 2 / 4 / 6 threads. If the winner isn't 4, change `n_threads` for `android-cpu` in `src/services/device/deviceProfile.ts`.
3. **Term extraction:** 3 fixed chunks → JSON parse rate, valid terms, seconds per chunk.
4. **Tutor leak test:** 20 attempts → raw leaks (model alone), visible leaks (what students see; must be 0), fallbacks.

Long-press the report, copy it, paste it into `docs/benchmarks.md`, and open a PR.

**Pick rule (on the Pova 4):** ≥ 8 tok/s generation, JSON 3/3, load < 10 s, < 30 s per chunk, then the lowest raw leak rate.
