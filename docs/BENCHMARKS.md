# Benchmarks

`localcode bench <model>` (or **Models → Benchmark**) measures what a model can actually do
as a LocalCode agent:

1. **Tool-calling probe** — can it emit a correct tool call (native API, or the prompted
   fallback), and does it use the tool result to answer?
2. **Three coding tasks**, each run by the real agent loop in a throwaway folder
   (autonomous mode, network denied, 16 model calls max, 20 minutes max):
   - *fix-bug*: make a failing test pass by fixing `math.mjs` (off-by-one in an average);
   - *implement*: create `slugify.mjs` from a specification;
   - *multi-file*: rename a function across three files and keep the program working.
3. **Verification by execution** — after each task LocalCode runs its own hidden checks
   (`node` scripts). A task passes only if the code really works, regardless of what the
   model claims.

Score = (3 × passed tasks + probe points) / (3 × tasks + 2) × 100.

## Results on the development machine

Hardware: 4 CPU threads (Intel Xeon @ 2.1 GHz), 16 GB RAM, **no GPU**, Ollama 0.32.15.
Generation speeds below are CPU-only and were measured while other builds were running, so
treat timings as pessimistic.

| Model | Probe result | fix-bug | implement | multi-file | Score | Speed |
|---|---|---|---|---|---|---|
| `qwen2.5-coder:1.5b` (Q4_K_M) | prompted fallback (native calls echo the JSON schema) | ✗ | ✗ | ✗ | 18/100 | ~13 tok/s |
| `qwen3.5:4b` (Q4_K_M) | native ✓ | ✓ (5 calls) | ✓ (7 calls) | ✓ (10 calls) | **100/100** | ~5–6 tok/s idle; ~1–2 tok/s while compiling |

Observations:

- `qwen2.5-coder:1.5b` advertises the `tools` capability but returns a fenced JSON block
  that copies the parameter schema instead of values. LocalCode's probe detects this and
  switches to the prompted fallback, which produces valid calls — but the model still
  "completed" every task without actually solving it. The verified benchmark (and the task
  report's real exit codes) make that visible.
- `qwen3.5:4b` makes structured tool calls, passed all three tasks (total 32 minutes on a
  CPU that was also compiling the desktop app), and separately fixed the sample repository's
  bug end-to-end (run tests → read test → read source → one-line edit → re-run tests →
  report) in 6 model calls / ~4 minutes.

Expect much better results and speed from 7B–32B coding models on a GPU; run the benchmark
on your own hardware to choose.
