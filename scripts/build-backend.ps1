$ErrorActionPreference = 'Stop'
$baiRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $baiRoot
& uv sync --project backend --frozen
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency sync failed.' }
$baiPython = Join-Path $baiRoot 'backend\.venv\Scripts\python.exe'
& $baiPython -m PyInstaller --noconfirm --distpath .local-data/backend-dist --workpath .local-data/backend-build backend/bai-backend.spec
if ($LASTEXITCODE -ne 0) { throw 'Standalone backend build failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $baiRoot '.local-data\backend-dist\bai-backend\bai-backend.exe'))) { throw 'Backend executable missing.' }
