[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $appRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "No se ha encontrado Node.js. Instala Node.js LTS o coloca su carpeta junto a la aplicación antes de preparar AV Weekly."
}

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  $installedPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($installedPnpm) {
    & $installedPnpm.Source @Arguments
  } else {
    $corepack = Get-Command corepack -ErrorAction SilentlyContinue
    if (-not $corepack) {
      throw "No se ha encontrado pnpm ni Corepack. Instala Node.js LTS completo o solicita el paquete ya preparado."
    }

    # Do not run `corepack enable` or `prepare --activate`: both try to write
    # into Program Files and fail on managed work computers. This uses Corepack
    # from the current user profile without changing the Node installation.
    & $corepack.Source "pnpm@10.4.1" @Arguments
  }

  if ($LASTEXITCODE -ne 0) {
    throw "pnpm no ha podido completar la operación. Si el portátil usa proxy o bloquea registry.npmjs.org, solicita acceso temporal o usa el paquete ya preparado."
  }
}

Invoke-Pnpm install --frozen-lockfile

Invoke-Pnpm run build

New-Item -ItemType Directory -Path (Join-Path $appRoot "data") -Force | Out-Null
Write-Host "AV Weekly está preparada. Haz doble clic en Iniciar-AV-Weekly.cmd."
