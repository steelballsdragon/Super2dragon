# Configuration

## Where settings live

Settings are stored in SQLite in the data directory:

| OS | Default data directory |
|---|---|
| Linux | `$XDG_DATA_HOME/localcode` or `~/.local/share/localcode` |
| macOS | `~/Library/Application Support/LocalCode` |
| Windows | `%APPDATA%\LocalCode` |

Set `LOCALCODE_HOME=/some/folder` to use another location (useful for portable installs or
separate profiles). The folder contains `localcode.db` (conversations, tasks, settings,
activity) and `checkpoints/` (shadow git repositories for undo).

Edit settings in the app (**⚙ Settings**) — every option is described there. A complete
example with defaults is in [`examples/config/settings.example.json`](../examples/config/settings.example.json).

## Inference servers

### Ollama (default: `http://127.0.0.1:11434`)

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

Useful Ollama environment variables: `OLLAMA_HOST` (address), `OLLAMA_MODELS` (where models
are stored), `OLLAMA_MAX_LOADED_MODELS=1` (keep memory use predictable), `OLLAMA_KEEP_ALIVE`.
LocalCode sets `num_ctx` explicitly from **Context length**, so Ollama's own default context
does not apply.

### llama.cpp server (default: `http://127.0.0.1:8080/v1`)

```bash
llama-server -m ./models/qwen2.5-coder-7b-instruct-q4_k_m.gguf --jinja -c 16384 --port 8080
```

`--jinja` is required for tool calling (LocalCode falls back to prompted tool calls
otherwise). Use `-ngl 99` to offload layers to the GPU. LocalCode reads `/props` for the
context size and the chat template's tool capabilities, and `/health` to detect a model that
is still loading.

### LM Studio (default: `http://127.0.0.1:1234/v1`, disabled by default)

Start the local server in LM Studio, load a model, then enable the provider in **Settings →
Inference servers**. Tool-use capability is read from LM Studio's model metadata.

### Other OpenAI-compatible servers

vLLM, LocalAI, llama-cpp-python, text-generation-webui (openai extension) and others work.
Add them under **Settings → Inference servers → Add OpenAI-compatible server** with a base
URL ending in `/v1`. If your server needs an API key, enter it there; it is only sent to that
server.

## Model roles

| Role | Used for |
|---|---|
| Coding | Running the agent (per conversation; switching keeps history) |
| Planning | Optional: the first model call of each new task (typically writes the plan) |
| Light | Optional: summarizing long conversations |
| Embeddings | Optional: `search_code mode=semantic` (e.g. `nomic-embed-text`) |

## Tool-mode overrides

In **Models**, each model has a tool-mode selector: `auto` (probe result → capabilities),
`native`, `prompted` (fallback) or `chat only`. Overrides are stored in
`toolModeOverrides["<provider>/<model>"]`.

## Project instructions

Put a `LOCALCODE.md` (or `AGENTS.md`, `CLAUDE.md`, `.localcode/instructions.md`) in the
workspace root to give the agent project-specific guidance: how to run tests, coding style,
areas to avoid. The first 4,000 characters are included in every prompt (after the safety
rules, which always take precedence). See [`examples/config/LOCALCODE.md`](../examples/config/LOCALCODE.md).

## Index exclusions

`.gitignore` files are always honoured (via `git ls-files` in git repositories, or a
walker that reads nested `.gitignore` files elsewhere). Common heavy folders
(`node_modules`, `.venv`, `target`, `.next`, `coverage`…) are excluded by default. Add more
patterns (gitignore syntax) under **Settings → Context → Extra index exclusions**.

## Environment variables

| Variable | Effect |
|---|---|
| `LOCALCODE_HOME` | Data directory |
| `LOCALCODE_TOKEN` | Fixed access token for `localcode serve` (default: random per start) |
| `LOCALCODE_NODE` | Node.js executable for the desktop app |
| `LOCALCODE_SERVER_SCRIPT` | Engine script for the desktop app (development) |
| `LOCALCODE_WASM_DIR` | Location of tree-sitter `.wasm` grammars |
| `NO_COLOR` | Disable colours in CLI output |
