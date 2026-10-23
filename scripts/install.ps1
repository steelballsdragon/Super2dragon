# LocalCode AI installer for Windows (PowerShell).
# Checks prerequisites, installs npm dependencies and builds the engine, CLI and UI.
# It never downloads models or system packages on its own.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Ok($m) { Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [x]  $m" -ForegroundColor Red }

Write-Host "LocalCode AI - checking prerequisites" -ForegroundColor White
$missing = $false

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $ver = (& node -p "process.versions.node").Trim()
  $parts = $ver.Split('.')
  if ([int]$parts[0] -gt 22 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -ge 13)) { Ok "Node.js $ver" }
  else { Fail "Node.js $ver is too old (22.13+ required)"; $missing = $true }
} else { Fail 'Node.js not found'; $missing = $true }
if ($missing) { Write-Host '    Install Node.js 22 LTS: winget install OpenJS.NodeJS.LTS  (or https://nodejs.org)' }

if (Get-Command git -ErrorAction SilentlyContinue) { Ok (& git --version) }
else { Fail 'git not found (needed for checkpoints/undo)'; Write-Host '    winget install Git.Git'; $missing = $true }

if (Get-Command rg -ErrorAction SilentlyContinue) { Ok 'ripgrep available' }
else { Warn 'ripgrep not found (optional): winget install BurntSushi.ripgrep.MSVC' }

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  Ok 'Ollama installed'
  try { Invoke-RestMethod -TimeoutSec 3 http://127.0.0.1:11434/api/version | Out-Null; Ok 'Ollama server is running' }
  catch { Warn 'Ollama is installed but not running - start the Ollama app or run: ollama serve' }
} else { Warn 'Ollama not found (or use llama.cpp / LM Studio): https://ollama.com/download' }

if ($missing) { Fail 'Install the missing prerequisites above and run this script again.'; exit 1 }

Write-Host "`nInstalling npm dependencies (network access to registry.npmjs.org)" -ForegroundColor White
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nBuilding engine, CLI and UI" -ForegroundColor White
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nDone." -ForegroundColor Green
Write-Host '  CLI:          node apps\cli\dist\localcode.mjs --help'
Write-Host '  Check setup:  node apps\cli\dist\localcode.mjs doctor'
Write-Host '  Browser UI:   node apps\cli\dist\localcode.mjs serve'
Write-Host '  Desktop app:  npm run desktop:dev   (requires Rust and the Tauri prerequisites)'
Write-Host '  No model yet? For example:  ollama pull qwen2.5-coder:7b   (~4.7 GB download)'
