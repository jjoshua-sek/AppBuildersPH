# Benchmarks

Paste DevBench reports here, one block per phone × model. See `docs/RUNTIME_SETUP.md` §5.

## Decision
- **Chosen LLM:** _TBD_ (Gemma 3 1B IT Q8_0 is the working baseline)
- **Why:** _TBD (numbers from the Infinix Hot 50 Pro+)_
- **`deviceProfile.ts` settings so far:** `android-cpu` uses **2 threads** (fastest generation in the sweep) and `extractTokens` 320.

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
- Extraction failed: `extractTokens` was 180, and 18 s/chunk at ~10 tok/s means the model hit that limit, so the JSON was cut off. Fixed by raising it to 320 and recovering finished terms from truncated or fenced output. Re-run pending.
