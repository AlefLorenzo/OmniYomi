param(
  [switch]$SkipBuild,
  [switch]$SkipRuntime,
  [switch]$UpdateRuntime
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Refresh-NodePath {
  $candidates = @(
    "$env:ProgramFiles\nodejs",
    "$env:LOCALAPPDATA\Programs\nodejs",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path (Join-Path $candidate "node.exe")) {
      $env:Path = "$candidate;$env:Path"
    }
  }
}

Refresh-NodePath
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $node) {
  Write-Host "[OmniYomi] Node.js não encontrado. Instalando Node.js LTS pelo WinGet..." -ForegroundColor Yellow
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "Node.js/WinGet não encontrados. Instale Node.js 20+ em https://nodejs.org/ e execute novamente."
  }
  & winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "O WinGet não conseguiu instalar Node.js. Instale Node.js LTS e execute novamente."
  }
  Refresh-NodePath
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js foi instalado, mas não está visível nesta sessão. Feche e reabra o PowerShell."
  }
}

$majorText = (& node -p "process.versions.node.split('.')[0]")
$major = [int]$majorText
if ($major -lt 20) {
  Write-Host "[OmniYomi] Atualizando Node.js LTS..." -ForegroundColor Yellow
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { throw "Node.js 20+ é necessário. Atualize pelo site https://nodejs.org/." }
  & winget upgrade --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível atualizar Node.js automaticamente." }
  Refresh-NodePath
  $major = [int](& node -p "process.versions.node.split('.')[0]")
  if ($major -lt 20) { throw "Reinicie o PowerShell para carregar a versão atualizada do Node.js." }
}

$nodeArgs = @((Join-Path $PSScriptRoot "setup.mjs"))
if ($SkipBuild) { $nodeArgs += "--skip-build" }
if ($SkipRuntime) { $nodeArgs += "--skip-runtime" }
if ($UpdateRuntime) { $nodeArgs += "--update-runtime" }

Write-Host ""
Write-Host "=== Preparação automática do OmniYomi ===" -ForegroundColor Cyan
& node @nodeArgs
if ($LASTEXITCODE -ne 0) {
  throw "A preparação do OmniYomi falhou com código $LASTEXITCODE."
}
