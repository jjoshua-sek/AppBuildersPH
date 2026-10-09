# Runtime Setup (Part A)

Step by step: from a fresh clone to models running on our three phones (Infinix Hot 50 Pro+, iPhone 13 Pro Max, iPhone 11), then the hour-1 benchmark.

## 1. Get the models (laptop, once)

Put them in a `models/` folder outside the repo (`*.gguf` is gitignored anyway).

| File on the phone | Model | Where |
|---|---|---|
| `gen.gguf` | **Gemma 3 1B IT, Q4_0 (chosen, 569 MB)** | Made from the F16 file in `ggml-org/gemma-3-1b-it-GGUF` (no license gate), steps below |
| `emb.gguf` | snowflake-arctic-embed-xs, Q8_0 | `ChristianAzinn/snowflake-arctic-embed-xs-gguf` |

Why this model: see `docs/benchmarks.md` (Q4_0 vs. Q8_0 on the Infinix).

**Make the Q4_0 file (Windows, about 10 minutes):**
1. Download the `…f16.gguf` file from https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF (Files and versions) into `C:\models`.
2. Download the newest `llama-…-bin-win-cpu-x64.zip` from https://github.com/ggml-org/llama.cpp/releases and unzip it to `C:\llama`.
3. Quantize:
   ```powershell
   C:\llama\llama-quantize.exe --pure "C:\models\gemma-3-1b-it-f16.gguf" "C:\models\gemma-3-1b-it-Q4_0.gguf" Q4_0
   ```
   `--pure` keeps every tensor in Q4_0, which llama.cpp repacks for fast ARM CPU math. The result is about 537 MiB.

The 569 MB file also fits the iPhone 11 (4 GB RAM).

## 2. Android: Infinix Hot 50 Pro+

One-time phone setup: Settings → About phone → tap **Build number** 7 times → Developer options → **USB debugging** on. Infinix (XOS) may also need **"Install via USB"** turned on in Developer options.

```bash
npm install
npx react-native run-android --mode release   # demo build: no INTERNET permission
# or: npx react-native run-android            # debug build, needs Metro running
```
Open the app once (it creates its folder and shows "Missing LLM"), then:
```bash
scripts/push-models.sh ~/models/gemma-3-1b-it-Q4_0.gguf ~/models/snowflake-arctic-embed-xs-Q8_0.gguf
```
On Windows PowerShell, without Git Bash:
```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$dir = "/sdcard/Android/data/com.backpacktutor/files/models"
& $adb shell mkdir -p $dir
& $adb push "C:\models\gemma-3-1b-it-Q4_0.gguf" "$dir/gen.gguf"
& $adb push "C:\models\snowflake-arctic-embed-xs-Q8_0.GGUF" "$dir/emb.gguf"
```
If the push stops with `write failed` / `no devices`, the USB link dropped: use the phone's original cable directly in a laptop port, turn on **Stay awake** in Developer options, and push again.
Tap **Retry** on the splash screen.

### Windows troubleshooting (what we hit on the first setup)
| Error | Fix |
|---|---|
| `npm install` fails with `llama.rn: getaddrinfo ENOTFOUND github.com` | Network/DNS blip during llama.rn's native download. Run `$env:RNLLAMA_SKIP_POSTINSTALL = "1"; npm install`, then `node node_modules/llama.rn/install/download-native-artifacts.js` (re-run it until it finishes). |
| `SDK location not found` | `"sdk.dir=$("$env:LOCALAPPDATA\Android\Sdk" -replace '\\','\\')" \| Out-File -Encoding ascii android\local.properties` (the file is gitignored). |
| `adb` / `Test-Path` "not recognized" | You're in Command Prompt, not PowerShell (the prompt must start with `PS`), or `platform-tools` isn't on `Path`. Use `$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"` and `& $adb ...`. |
| Long path / CMake errors | Clone into a short path such as `C:\dev\AppBuildersPH`. |

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
  - Tier: `ios-metal` on the 13 Pro Max, `ios-cpu` on the 11, `android-cpu` on the Infinix.
  - Backend: **GPU** on the 13 Pro Max, **CPU · N threads** on the others.
- Airplane mode on, Wi-Fi off: **Cloud calls this session** stays **0**.

## 5. Hour-1 benchmark (DevBench)
For **each candidate model** on **each phone** (start with the Infinix; it is the demo phone and decides the model):
1. **Speed:** prompt and generation tok/s.
2. **Thread sweep** (Android): 2 / 4 / 6 threads. If the winner isn't 4, change `n_threads` for `android-cpu` in `src/services/device/deviceProfile.ts`.
3. **Term extraction:** 3 fixed chunks → JSON parse rate, valid terms, seconds per chunk.
4. **Tutor leak test:** 20 attempts → raw leaks (model alone), visible leaks (what students see; must be 0), fallbacks.

Long-press the report, copy it, paste it into `docs/benchmarks.md`, and open a PR.

**Pick rule (on the Infinix):** ≥ 8 tok/s generation, JSON 3/3, load < 10 s, < 30 s per chunk, then the lowest raw leak rate.
