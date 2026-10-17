$ErrorActionPreference = 'Stop'
$baiRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $baiRoot
$baiExecutable = Join-Path $baiRoot '.local-data\cargo-ui-review\debug\bai-agent.exe'
$baiRunning = Get-Process -Name 'bai-agent' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $baiExecutable }
if ($baiRunning) {
    Start-Process -FilePath $baiExecutable -WindowStyle Hidden
    exit 0
}
foreach ($baiCommand in @('pnpm', 'cargo', 'node')) {
    if (-not (Get-Command $baiCommand -ErrorAction SilentlyContinue)) { throw "Missing command: $baiCommand. See README.md." }
}
if (-not (Test-Path -LiteralPath (Join-Path $baiRoot 'node_modules'))) {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependencies failed to install.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $baiRoot 'backend\.venv\Scripts\python.exe'))) {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'Missing command: uv. See README.md.' }
    & uv sync --project backend --frozen
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies failed to install.' }
}
$baiWorker = Join-Path $PSScriptRoot 'desktop-worker.ps1'
$baiPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$baiWorkerProcess = Start-Process -FilePath $baiPowerShell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $baiWorker + '"')) -WorkingDirectory $baiRoot -WindowStyle Hidden -PassThru
$baiDeadline = [DateTime]::UtcNow.AddMinutes(3)
$baiLog = Join-Path $baiRoot '.local-data\dev\desktop.log'
Write-Host 'Starting XiaoXi. The first build may take a minute...'
while ([DateTime]::UtcNow -lt $baiDeadline) {
    $baiWindow = Get-Process -Name 'bai-agent' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $baiExecutable -and $_.MainWindowHandle -ne 0 }
    if ($baiWindow) { exit 0 }
    $baiWorkerProcess.Refresh()
    if ($baiWorkerProcess.HasExited) {
        if (Test-Path -LiteralPath $baiLog) { Get-Content -LiteralPath $baiLog -Tail 30 | Write-Host }
        throw "XiaoXi failed to start. See $baiLog"
    }
    Start-Sleep -Milliseconds 500
}
throw "XiaoXi did not open a window within 3 minutes. See $baiLog"
