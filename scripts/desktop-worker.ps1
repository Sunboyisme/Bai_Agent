$ErrorActionPreference = 'Stop'
$baiRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $baiRoot
$env:BAI_DATA_DIR = Join-Path $baiRoot '.local-data\dev'
New-Item -ItemType Directory -Path $env:BAI_DATA_DIR -Force | Out-Null
$baiLog = Join-Path $env:BAI_DATA_DIR 'desktop.log'
& pnpm desktop:dev *> $baiLog
