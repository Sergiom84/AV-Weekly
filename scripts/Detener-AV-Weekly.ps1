[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pidFile = Join-Path $appRoot "data\av-weekly.pid"

if (-not (Test-Path $pidFile)) {
  exit 0
}

$savedPid = (Get-Content $pidFile -Raw).Trim()
$process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
if ($null -ne $process -and $process.ProcessName -eq "node") {
  Stop-Process -Id $process.Id -Force
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
