[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dataDir = Join-Path $appRoot "data"
$pidFile = Join-Path $dataDir "av-weekly.pid"
$port = 3000

Set-Location $appRoot
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("No se ha encontrado Node.js. Ejecuta primero Preparar-AV-Weekly.ps1 tras instalar Node.js LTS.", "AV Weekly") | Out-Null
  exit 1
}

if (-not (Test-Path (Join-Path $appRoot "dist\index.js"))) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("La aplicación aún no está preparada. Ejecuta primero Preparar-AV-Weekly.ps1.", "AV Weekly") | Out-Null
  exit 1
}

$running = $false
if (Test-Path $pidFile) {
  $savedPid = Get-Content $pidFile -Raw
  $running = $null -ne (Get-Process -Id $savedPid.Trim() -ErrorAction SilentlyContinue)
}

if (-not $running) {
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  $nodePath = (Get-Command node).Source
  $previousNodeEnv = $env:NODE_ENV
  $previousPort = $env:PORT
  $previousDataDir = $env:APP_DATA_DIR
  $env:NODE_ENV = "production"
  $env:PORT = "$port"
  $env:APP_DATA_DIR = $dataDir
  try {
    $process = Start-Process -FilePath $nodePath -ArgumentList "dist/index.js" -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataDir "av-weekly.out.log") -RedirectStandardError (Join-Path $dataDir "av-weekly.err.log") -PassThru
  } finally {
    $env:NODE_ENV = $previousNodeEnv
    $env:PORT = $previousPort
    $env:APP_DATA_DIR = $previousDataDir
  }
  Set-Content -Path $pidFile -Value $process.Id -NoNewline
}

$url = "http://localhost:$port/"
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null
    Start-Process $url
    exit 0
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show("AV Weekly no ha podido iniciarse. Revisa data\av-weekly.err.log.", "AV Weekly") | Out-Null
exit 1
