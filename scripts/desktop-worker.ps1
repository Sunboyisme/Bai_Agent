$ErrorActionPreference = 'Stop'
$baiRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $baiRoot
$env:BAI_DATA_DIR = Join-Path $baiRoot '.local-data\dev'
New-Item -ItemType Directory -Path $env:BAI_DATA_DIR -Force | Out-Null
$baiLog = Join-Path $env:BAI_DATA_DIR 'desktop.log'
$baiPnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
# Redirect in cmd so Windows PowerShell 5.1 does not treat Cargo stderr as a terminating error.
$baiCommandLine = '""{0}" desktop:dev > "{1}" 2>&1"' -f $baiPnpm, $baiLog
& $env:ComSpec /d /s /c $baiCommandLine
exit $LASTEXITCODE
