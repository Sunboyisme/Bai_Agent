$ErrorActionPreference = 'Stop'
$baiRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $baiRoot
$baiExecutable = Join-Path $baiRoot 'src-tauri\target\debug\bai-agent.exe'
$baiRunning = Get-Process -Name 'bai-agent' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $baiExecutable }
if ($baiRunning) {
    Start-Process -FilePath $baiExecutable -WindowStyle Hidden
    exit 0
}
foreach ($baiCommand in @('pnpm', 'uv', 'cargo', 'pwsh')) {
    if (-not (Get-Command $baiCommand -ErrorAction SilentlyContinue)) { throw "Missing command: $baiCommand. See README.md." }
}
if (-not (Test-Path -LiteralPath (Join-Path $baiRoot 'node_modules'))) {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependencies failed to install.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $baiRoot 'backend\.venv\Scripts\python.exe'))) {
    & uv sync --project backend --frozen
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies failed to install.' }
}
$baiWorker = Join-Path $PSScriptRoot 'desktop-worker.ps1'
Start-Process -FilePath (Get-Command pwsh).Source -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $baiWorker + '"')) -WorkingDirectory $baiRoot -WindowStyle Hidden
