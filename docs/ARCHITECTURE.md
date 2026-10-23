# Architecture

LocalCode is split into independent modules so that model inference, agent logic, tool
execution, the interface and storage can evolve separately.

```
┌──────────────────────────┐   WebSocket JSON-RPC + events   ┌──────────────────────────────┐
│ Desktop UI (React/Vite)  │ ◀──────────────────────────────▶ │ Local server (apps/cli)      │
│ in Tauri webview/browser │   127.0.0.1, token, origin check │  └─ Engine (packages/core)   │
└──────────────────────────┘                                  │      ├─ ModelClient ─────────┼──▶ Ollama / llama.cpp /
         ▲  Tauri shell (Rust) starts the engine process,     │      ├─ AgentRunner          │    LM Studio (localhost)
         │  passes port+token, folder picker, shutdown        │      ├─ ToolRegistry + tools │
                                                              │      ├─ Permissions          │
CLI (`localcode run/chat/...`) uses the same Engine directly  │      ├─ PersistentShell      │
                                                              │      ├─ RepoIndex / search   │
                                                              │      ├─ ShadowGit checkpoints│
                                                              │      └─ Store (SQLite)       │
                                                              └──────────────────────────────┘
```

## packages/core

| Module | Responsibility |
|---|---|
| `models/` | `OllamaProvider` (`/api/chat`, `/api/tags`, `/api/show`, `/api/ps`, `/api/pull`, `/api/embed`) and `OpenAICompatProvider` (`/v1/chat/completions` SSE, `/v1/models`, llama.cpp `/props` + `/health`, LM Studio metadata). `ModelClient` adapts tool calling; `toolcall-parser` recovers calls written as text; `probe` measures real ability; `memory` estimates RAM/VRAM. |
| `agent/` | `AgentRunner` (the loop), `ContextManager` (budgeting, compaction, summarization), `LoopGuard` (repetition/failure detection), prompts, event types. |
| `tools/` | Tool definitions (zod schemas → JSON Schema for the model), argument normalization and validation, risk assessment per call, and execution. |
| `security/` | `WorkspaceGuard` (paths), `assessCommand` (shell risk classifier), `decide` (permission policy), `SecretRedactor`/`scrubEnv`. |
| `exec/` | `PersistentShell` (bash with sentinel-delimited commands; PowerShell per-command on Windows) and `ProcessManager` (background processes). |
| `repo/` | File listing honouring `.gitignore`, project detection, tree-sitter symbols, ripgrep/built-in search, optional embedding index, relevance ranking, file watching. |
| `checkpoints/` | `ShadowGit`: workspace snapshots in a separate git repository under the data directory. |
| `storage/` | SQLite schema/migrations (`node:sqlite`) and the `Store` repository. |
| `engine/` | `Engine` (providers, sessions, tasks, approvals, undo, diff), `WorkspaceSession`, settings, benchmark. |
| `env/` | System info (RAM, GPUs via `nvidia-smi`/`rocm-smi`/Apple Silicon) and the doctor. |

## The agent loop

For each task (`AgentRunner.run`):

1. Persist the user message; snapshot the workspace (`Before task` checkpoint).
2. Build the prompt: system prompt (rules, workspace overview, project instructions file,
   recent tasks in this workspace, current plan, summary of older history, name-matched
   relevant files) + recent messages. If the estimate exceeds the configured share of the
   context window, older messages are summarized first.
3. Call the model with streaming; deltas are forwarded to the UI.
4. No tool calls → final answer. If the plan still has open steps, the model is nudged
   (at most twice) to continue or mark steps blocked.
5. For every tool call: parse → normalize aliases (`file_path` → `path`…) → validate (zod) →
   assess risk → permission decision (allow / ask / deny) → approval if needed → checkpoint if
   the tool can mutate files → execute with timeout and cancellation → redact secrets →
   truncate → feed back to the model (`ERROR:` prefix for failures).
6. `LoopGuard` warns the model after repeated identical failures and stops the task when
   the same failing call repeats, failures pile up, or identical calls loop.
7. Stop on completion, cancellation, step/time limits (resumable), or unrecoverable model
   errors (with actionable messages for out-of-memory, unreachable server, missing model).
8. Build the report from facts collected by the application: changed files (from the
   checkpoint diff), commands and real exit codes, parsed test runs, plan state, usage,
   warnings.

Retries: transient model-server errors (connection refused, 5xx, stalls) are retried with
backoff; "tools unsupported" errors switch the call to the prompted fallback; context
overflow triggers aggressive summarization and a retry.

## Tool calling across models

`ToolMode` per model is decided by, in order: user override → stored probe result →
server-reported capabilities → default `native`.

- **native** — tools are sent through the API. If the model answers with text that contains
  a tool call (common with small models), the parser recovers it.
- **prompted** — tool signatures are rendered compactly into the system prompt, calls are
  parsed from `<tool_call>{…}</tool_call>` (and other formats), results go back as
  `<tool_result>` user turns, and the stream filter hides raw call markup from the UI.
- **none** — chat only; the UI labels the model clearly.

The probe asks the model to read a file through a tool, checks the call and arguments, then
returns a tool result and checks the model actually uses it. Server errors are reported, not
recorded as model failures.

## Permissions

Each tool returns a `RiskAssessment` (`read < build < write < execute < network <
destructive < privileged`). Commands are tokenized (quotes, pipes, `&&`, substitutions,
redirections) and every segment is classified; the highest risk wins. A keyword sweep catches
dangerous programs hidden in `bash -c "…"`. Paths outside the workspace raise the level.
`decide()` maps risk × mode × stored rules to allow/ask/deny (see README for the matrix).

## Persistent shell

On Unix a single `bash --noprofile --norc` process (own process group) keeps state between
commands. Each command is written as:

```
cd -- '<cwd>'
{
<command>
} < /dev/null
__lc_ec=$?; printf '\n__LC_END_<nonce>%s__%s\n' "$__lc_ec" "$PWD"; printf '\n__LC_ERR_<nonce>__\n' >&2
```

The random sentinel delimits output and carries the exit code and new working directory.
Syntax is checked first with `bash -n` so an unterminated quote cannot swallow the sentinel.
Timeouts/cancellation kill the whole process group; the shell restarts transparently in the
last directory. stdin is `/dev/null`, so interactive prompts cannot hang the agent.

## Checkpoints

`ShadowGit` keeps a bare-style git directory per workspace in the data directory and uses
`--git-dir/--work-tree` to snapshot the workspace with `git add -A` (respecting `.gitignore`
and default excludes like `node_modules`). Snapshots are taken before each task and before
each mutating tool call, so changes made by shell commands are captured too. Restore takes a
safety snapshot first, checks out changed/deleted files, and removes files added since the
checkpoint. The user's own repository, index and branches are never touched.

## Context management

Token use is estimated (characters ÷ 3.5). Older tool results beyond the last six are
compacted to head+tail. When the estimate passes `summarizeAtRatio` of the window, messages
older than the last `keepRecentMessages` are summarized by the model (or the light model, if
configured) into fixed sections: requirements, decisions, file references, verified results,
outstanding work. If summarization fails, a deterministic summary is generated. The cut point
never leaves orphaned tool results. Full history stays in SQLite for the UI.

## Storage

SQLite tables: `settings`, `workspaces`, `conversations`, `messages`, `tasks` (status, plan,
report, usage, checkpoint), `events` (activity log), `checkpoints`, `permission_rules`,
`model_profiles` (probe/benchmark), `embeddings`. Tasks left `running` when the process exits
are marked `interrupted` on the next start and can be resumed.

## Server protocol

`localcode serve` listens on `127.0.0.1` (HTTP for static UI + `/health`, WebSocket at
`/ws?token=…`). Requests: `{id, method, params}` → `{id, result}` or
`{id, error: {code, message}}`. Server pushes `{event}` for engine events (`task.*`,
`assistant.delta`, `tool.start/output/end`, `approval.request/resolved`, `plan.update`,
`checkpoint.created`, `context.summarized`, `terminal.*`, `pull.progress`, `log`). The method
list is in `apps/cli/src/server.ts`.

## Desktop shell

`apps/desktop/src-tauri/src/lib.rs` finds Node.js 22.13+ (PATH, nvm, Volta, Homebrew…),
starts `localcode.mjs serve --port 0 --token <random> --exit-with-stdin`, waits for the
`LOCALCODE_READY {port, token}` line and exposes it through the `backend_info` command. The
engine exits when the app exits (or crashes — its stdin closes).
