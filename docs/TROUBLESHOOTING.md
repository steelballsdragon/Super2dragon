# Troubleshooting

Start with `localcode doctor` (or the first-run wizard / **Models** window): it checks Node.js,
git, ripgrep, tree-sitter, the data directory, every inference server, installed models and
your hardware, and prints a fix for each problem.

### "No local inference server is running" / "Cannot reach inference server … ECONNREFUSED"

Start your server: `ollama serve` (or start the Ollama app), or
`llama-server -m model.gguf --jinja --port 8080`. If it runs on another address, change the
base URL in **Settings → Inference servers**. Then press **Retry** on the failed task.

### "No chat/coding model installed"

`ollama pull qwen2.5-coder:7b` (or pick a size from the README's model table). In the app:
**Models → Download a model** shows the download size first.

### The model loads forever / "No response from model server for 600s"

The first load of a multi-GB model from a slow or cold disk can take minutes; LocalCode
shows "Loading <model> into memory…" and waits up to 30 minutes for the load itself. If it
still stalls, check the server's log (`journalctl -u ollama`, or the terminal running
`ollama serve`). Raise **Settings → Agent → Model idle timeout** on very slow CPUs.

### Out of memory: "model requires more system memory" / CUDA out of memory

- Use a smaller model or quantization (e.g. `:7b-instruct-q4_K_M` instead of `q8_0`).
- Lower **Settings → Model → Context length** (KV-cache memory grows linearly with it; the
  Models window shows an estimate and a suggested context).
- Lower **GPU layers** to offload fewer layers to a small GPU, or set `0` for CPU only.
- Close other memory-hungry applications; set `OLLAMA_MAX_LOADED_MODELS=1`.

### The model talks about tools instead of using them, or returns broken JSON

Run **Models → Test tool calling** (`localcode probe <model>`). LocalCode will use native tool
calls, the prompted fallback, or chat-only mode based on the result. Small models (≤3B)
often cannot drive an agent reliably — use a 7B+ tool-capable coding model. For llama.cpp,
make sure the server was started with `--jinja`.

### "Step limit reached" / "Stopped to avoid a loop"

The agent hit **Max model calls per task** or repeated a failing action. Press **Resume** to
continue with full history, rephrase the task more specifically, or try a stronger model.

### An approval prompt does not appear in the CLI

Approvals need an interactive terminal. In scripts use `--yes` (approve all) or pick a
permission mode with `--mode`. Without a TTY, approval requests are denied.

### Undo

Every task is checkpointed. Use **Undo task changes** on the task report, **Diff → Changes
since a checkpoint → Restore**, `localcode undo` (last task), `localcode undo --task <id>` or
`localcode undo --checkpoint <id>`. A restore saves the current state first, so it can be
undone too. Checkpoints respect `.gitignore`; ignored files (build output, `node_modules`)
are not restored.

### Desktop app: "Node.js 22.13+ was not found"

Install Node.js 22 LTS from https://nodejs.org. GUI apps on macOS do not see your shell's
PATH; LocalCode also looks in Homebrew, nvm, Volta and fnm locations. Otherwise set
`LOCALCODE_NODE=/path/to/node` (e.g. with `launchctl setenv` on macOS).

### Desktop app on Linux shows a blank window

Install the WebKitGTK runtime (`libwebkit2gtk-4.1-0`). On some virtual machines or with
NVIDIA drivers, start with `WEBKIT_DISABLE_COMPOSITING_MODE=1`.

### Browser UI: "No access token"

Open the exact URL printed by `localcode serve` (it contains `#token=…`). The token stays in
the browser tab's session storage and is never sent to other sites.

### Search is slow

Install ripgrep (`rg`). Large generated folders can be excluded in **Settings → Context**.

### Resetting everything

Quit LocalCode and delete the data directory (see docs/CONFIGURATION.md). Your projects are
not affected.
