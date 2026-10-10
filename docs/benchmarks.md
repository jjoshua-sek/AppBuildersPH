# Benchmarks

Paste DevBench reports here, one block per phone and model. See `docs/RUNTIME_SETUP.md` §4.

Runs 1–5 were measured on the Infinix Hot 50 Pro+ (Helio G100). The demo phone is now the Tecno Pova 4 (Helio G99), which has the same CPU layout (2× Cortex-A76 + 6× Cortex-A55) and uses the same `android-cpu` settings.

## Decision
- **Chosen LLM: Gemma 3 1B IT, Q4_0**, made with `llama-quantize --pure` from the F16 file in `ggml-org/gemma-3-1b-it-GGUF` (569 MB).
- **Embeddings:** snowflake-arctic-embed-xs Q8_0 (`ChristianAzinn/snowflake-arctic-embed-xs-gguf`).
- **Why (Infinix Hot 50 Pro+, CPU, 2 threads):** compared with Q8_0, Q4_0 loads 3.4× faster (2.1 s), generates 1.8× faster (19.9 tok/s), extracts slightly more terms (3.0 per chunk) in less time (13.9 s per chunk), and still shows 0/20 visible leaks.
- **`deviceProfile.ts`:** `android-cpu` uses 2 threads and `extractTokens` 320.

| Infinix, 2 threads | Q8_0 | **Q4_0** |
|---|---|---|
| File size | 1,069 MB | **569 MB** |
| Load | 7.2 s | **2.1 s** |
| Generation | 10.8 tok/s | **19.9 tok/s** |
| Extraction | 3/3 JSON, 2.7 terms/chunk, 19.0 s | **3/3 JSON, 3.0 terms/chunk, 13.9 s** |
| Tutor | 0/20 visible leaks, 3.7 s/reply | **0/20 visible leaks, 2.3 s/reply** |

Gemma 3 1B was the only candidate run; Google's official QAT Q4_0 build (gated) and Qwen3.5 0.8B were not needed.

## Reports

### Infinix X6880 (android-cpu): run 1

- Model: Gemma 3 1B IT, Q8_0 (`ggml-org/gemma-3-1b-it-GGUF`, 1069 MB), load 3.5 s, backend CPU 4 threads

| Threads | GPU layers | Prompt tok/s | Generation tok/s |
|---|---|---|---|
| 4 | 0 | 74.1 | 10.1 |
| 2 | 0 | 77.6 | 12.2 |
| 4 | 0 | 81.3 | 11.2 |
| 6 | 0 | 87.3 | 11.0 |

- Extraction: JSON 0/3, 0.0 valid terms/chunk, 18.0 s/chunk
- Tutor: raw leaks 0/20, **visible leaks 0/20**, fallbacks 0/20, 3.7 s/reply

**Notes**
- Generation 10–12 tok/s passes the ≥ 8 target; load 3.5 s passes < 10 s.
- Extraction failed: `extractTokens` was 180, and 18 s/chunk at ~10 tok/s means the model hit that limit, so the JSON was cut off. Fixed by raising it to 320 and recovering finished terms from truncated or fenced output. Re-run below.

### Infinix X6880 (android-cpu): run 2, after the extraction fix

- Model: Gemma 3 1B IT, Q8_0, load 12.2 s (first load after reinstall), backend CPU 2 threads

| Threads | GPU layers | Prompt tok/s | Generation tok/s |
|---|---|---|---|
| 2 | 0 | 71.4 | 10.8 |

- Extraction: **JSON 3/3**, 2.0 valid terms/chunk, 19.0 s/chunk

**Notes**
- JSON now parses every time. 2 terms/chunk is too few: a page is about 3 chunks, so about 6 terms, the minimum for a crossword.
- Many key terms in the test text are longer than the old 12-letter limit (AUTHENTICATION 14, ACCESS CONTROL 13, AUTHORIZATION 13, INTERNAL CONTROL 15). Raised the limit to 15. DevBench now logs every rejected term and why.
- Load time of 12.2 s was the first launch after reinstalling (files not yet cached). Run 1 loaded in 3.5 s. Re-check on a normal launch.

### Infinix X6880 (android-cpu): run 3, after the 15-letter limit

- Model: Gemma 3 1B IT, Q8_0 (1069 MB), load 7.2 s, backend CPU 2 threads
- Extraction: JSON 3/3, 2.7 valid terms/chunk, 19.0 s/chunk

### Infinix X6880 (android-cpu): run 4, Q4_0 ✅ chosen

- Model: Gemma 3 1B IT, **Q4_0** (569 MB, `llama-quantize --pure` from the ggml-org F16), load 2.1 s, backend CPU 2 threads

| Threads | GPU layers | Prompt tok/s | Generation tok/s |
|---|---|---|---|
| 2 | 0 | 77.6 | 19.9 |

- Extraction: JSON 3/3, 3.0 valid terms/chunk, 13.9 s/chunk
- Tutor: raw leaks 0/20, **visible leaks 0/20**, fallbacks 0/20, 2.3 s/reply

### Infinix X6880 (android-cpu): run 5, current main (after #11–#17)

- Model: Gemma 3 1B IT, Q4_0 (569 MB), load 2.0 s, backend CPU 2 threads

| Threads | GPU layers | Prompt tok/s | Generation tok/s |
|---|---|---|---|
| 2 | 0 | 83.9 | 19.6 |
| 2 | 0 | 85.4 | 20.5 |
| 4 | 0 | 77.2 | 15.9 |
| 6 | 0 | 22.0 | 9.4 |

- Extraction (3 fixed chunks): JSON 3/3, 3.3 valid terms/chunk, 13.1 s/chunk
  - kept: IT audit, controls · Risk, inherent risk, residual risk, Materiality · Access control, Authentication, Authorization, Encryption
  - rejected: "preventive control", "detective control" (answer over 15 letters)
- Tutor: raw leaks 0/20, **visible leaks 0/20**, fallbacks 0/20, 2.3 s/reply
- Real photo ingest (Add notes, chloroplast handout): whole page 50 s, Play unlocks, Proof panel 0 cloud calls

**Notes**
- The Q4_0 thread sweep confirms the `android-cpu` setting of 2 threads: 20.5 tok/s vs. 15.9 at 4 and 9.4 at 6.
