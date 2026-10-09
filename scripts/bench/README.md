# Term-extraction benchmark (laptop)

Runs the app's real term extractor (prompt, JSON schema, chunker, validator) on the
handout pages in `pages/` against a llama-server on your laptop, then appends a
report to `docs/bench/extraction-laptop.md`. Raw model outputs go to `out/` (not committed).

Laptop numbers tell you about **quality** (JSON parse rate, valid terms per page,
why terms are rejected). They do not tell you phone **speed**; DevBench measures that.

## Run

1. Get llama.cpp (`llama-bNNNNN-bin-win-cpu-x64.zip` from github.com/ggml-org/llama.cpp/releases)
   and the same GGUF the phones use.
2. Start the server with the phone's context size:
   ```bash
   llama-server -m gemma-3-1b-it-qat-Q4_0.gguf -c 2048 --jinja --port 8089
   ```
3. Run the benchmark (about 2 minutes per run over the 5 pages):
   ```bash
   LLAMA_URL=http://127.0.0.1:8089 RUNS=3 LABEL="what you changed" npx jest -c jest.bench.config.js
   ```

Options: `TIER` (`android-cpu` default, `ios-metal`, `ios-cpu`) picks the chunk size, terms per
chunk and max tokens from `src/services/device/deviceProfile.ts`. Terms are checked with the
app's own `reviewTerms` / `rejectReason`, so the rejection reasons match what the phone logs.

## Pages

| File | What it tests |
|---|---|
| `1-it-audit.txt` | An IT Audit handout page (kept as-is so results stay comparable across prompt versions) |
| `2-access-control.txt` | A page whose key terms are long (AUTHENTICATION, 14 letters) |
| `3-networking-ocr.txt` | Phone-photo noise: running header, page number, words hyphenated across lines |
| `4-cloud.txt` | Many multi-word terms (infrastructure as a service, availability zone) |
| `5-databases.txt` | Many short, well-defined terms |

All pages were written for this project.
