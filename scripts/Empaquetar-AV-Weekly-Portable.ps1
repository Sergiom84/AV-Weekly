[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $PSScriptRoot "..\release\AV-Weekly-portable")
)

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$stagingPath = "$destinationPath.staging"

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if (-not $pnpm) {
    throw "No se ha encontrado pnpm en el equipo de empaquetado. Instálalo allí antes de crear el paquete portable."
  }
  & $pnpm.Source @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm no ha podido completar la operación de empaquetado."
  }
}

Set-Location $appRoot
Invoke-Pnpm run build

if (Test-Path $stagingPath) {
  Remove-Item -LiteralPath $stagingPath -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $appRoot "dist") -Destination (Join-Path $stagingPath "dist") -Recurse
Copy-Item -LiteralPath (Join-Path $appRoot "package.json") -Destination (Join-Path $stagingPath "package.json")
Copy-Item -LiteralPath (Join-Path $appRoot "pnpm-lock.yaml") -Destination (Join-Path $stagingPath "pnpm-lock.yaml")
# pnpm reads this patch while resolving the locked production dependency.
Copy-Item -LiteralPath (Join-Path $appRoot "patches") -Destination (Join-Path $stagingPath "patches") -Recurse

New-Item -ItemType Directory -Path (Join-Path $stagingPath "scripts") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Iniciar-AV-Weekly-portable.ps1") -Destination (Join-Path $stagingPath "scripts\Iniciar-AV-Weekly.ps1")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Detener-AV-Weekly-portable.ps1") -Destination (Join-Path $stagingPath "scripts\Detener-AV-Weekly.ps1")

@'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Iniciar-AV-Weekly.ps1"
'@ | Set-Content -LiteralPath (Join-Path $stagingPath "Iniciar-AV-Weekly.cmd") -Encoding ascii

@'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Detener-AV-Weekly.ps1"
'@ | Set-Content -LiteralPath (Join-Path $stagingPath "Detener-AV-Weekly.cmd") -Encoding ascii

Push-Location $stagingPath
try {
  # This fresh directory receives only runtime dependencies. It is intentionally
  # built on the same Windows/Node architecture as the recipient's computer.
  Invoke-Pnpm install --prod --frozen-lockfile
} finally {
  Pop-Location
}

# No package manager is needed to run the portable copy, so retain a compact
# manifest and do not ship the lockfile or source-only package metadata.
$manifestPath = Join-Path $stagingPath "package.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$runtimeManifest = [ordered]@{
  name = $manifest.name
  version = $manifest.version
  private = $true
  type = $manifest.type
  dependencies = $manifest.dependencies
}
$runtimeManifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8
Remove-Item -LiteralPath (Join-Path $stagingPath "pnpm-lock.yaml") -Force
Remove-Item -LiteralPath (Join-Path $stagingPath "patches") -Recurse -Force

if (Test-Path $destinationPath) {
  Remove-Item -LiteralPath $destinationPath -Recurse -Force
}
Move-Item -LiteralPath $stagingPath -Destination $destinationPath

Write-Host "Paquete portable creado en: $destinationPath"
Write-Host "Copia la carpeta AV-Weekly-portable al portátil. Los datos se crearán fuera de ella, en AV Weekly - Datos."
