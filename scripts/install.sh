#!/usr/bin/env bash
# LocalCode AI installer for Linux and macOS.
# Checks prerequisites, installs npm dependencies, builds the engine, CLI and UI.
# It never downloads models or system packages on its own: it tells you what is missing.
set -euo pipefail

cd "$(dirname "$0")/.."
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; }

OS="$(uname -s)"
missing=0
bold "LocalCode AI — checking prerequisites ($OS)"

if command -v node >/dev/null 2>&1; then
  ver="$(node -p 'process.versions.node')"
  major="${ver%%.*}"; rest="${ver#*.}"; minor="${rest%%.*}"
  if [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 13 ]; }; then ok "Node.js $ver"
  else fail "Node.js $ver is too old (22.13+ required)"; missing=1; fi
else
  fail "Node.js not found"; missing=1
fi
if [ "$missing" -eq 1 ]; then
  echo "    Install Node.js 22 LTS: https://nodejs.org  (or: nvm install 22)"
fi

if command -v git >/dev/null 2>&1; then ok "$(git --version)"
else
  fail "git not found (needed for checkpoints/undo)"; missing=1
  [ "$OS" = "Darwin" ] && echo "    xcode-select --install   or   brew install git" || echo "    sudo apt install git   (or your package manager)"
fi

if command -v rg >/dev/null 2>&1; then ok "ripgrep $(rg --version | head -1 | awk '{print $2}')"
else
  warn "ripgrep not found (optional, faster search)"
  [ "$OS" = "Darwin" ] && echo "    brew install ripgrep" || echo "    sudo apt install ripgrep"
fi

if command -v ollama >/dev/null 2>&1; then
  ok "Ollama $(ollama --version 2>/dev/null | awk '{print $NF}' | tail -1)"
  if curl -fsS -m 3 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then ok "Ollama server is running"
  else warn "Ollama is installed but not running — start it with: ollama serve"; fi
else
  warn "Ollama not found (or use llama.cpp / LM Studio)"
  [ "$OS" = "Darwin" ] && echo "    brew install ollama   or   https://ollama.com/download" || echo "    curl -fsSL https://ollama.com/install.sh | sh"
fi

if [ "$missing" -ne 0 ]; then
  echo; fail "Install the missing prerequisites above and run this script again."; exit 1
fi

echo; bold "Installing npm dependencies (network access to registry.npmjs.org)"
npm install --no-fund --no-audit

echo; bold "Building engine, CLI and UI"
npm run build

echo; bold "Running unit tests"
npm test --silent || { fail "Some tests failed — see output above."; exit 1; }

echo; bold "Done."
cat <<MSG
  CLI:          node apps/cli/dist/localcode.mjs --help    (or: npm link -w @localcode/cli)
  Check setup:  node apps/cli/dist/localcode.mjs doctor
  Browser UI:   node apps/cli/dist/localcode.mjs serve
  Desktop app:  npm run desktop:dev   (requires Rust and https://tauri.app/start/prerequisites/)

  No model installed yet? For example:  ollama pull qwen2.5-coder:7b   (~4.7 GB download)
MSG
