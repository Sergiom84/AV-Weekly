[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dataDir = Join-Path (Split-Path $appRoot -Parent) "AV Weekly - Datos"
$pidFile = Join-Path $dataDir "av-weekly.pid"

if (-not (Test-Path $pidFile)) {
  exit 0
}

$savedPid = (Get-Content $pidFile -Raw).Trim()
$process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
if ($null -ne $process -and $process.ProcessName -eq "node") {
  Stop-Process -Id $process.Id -Force
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
