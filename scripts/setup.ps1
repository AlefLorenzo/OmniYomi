param(
  [switch]$SkipBuild,
  [switch]$SkipRuntime,
  [switch]$UpdateRuntime
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
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

function Get-NodeVersion {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if (-not $command) { return $null }
  try {
    $versionText = (& node -p "process.versions.node").Trim()
    return [version](($versionText -split "-")[0])
  } catch {
    return $null
  }
}

function Install-NodeLts {
  $minimum = [version]"22.12.0"
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    $installed = Get-NodeVersion
    if (-not $installed) {
      Write-Host "[OmniYomi] Instalando Node.js LTS pelo WinGet..." -ForegroundColor Yellow
      & winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
    } elseif ($installed -lt $minimum) {
      Write-Host "[OmniYomi] Atualizando Node.js pelo WinGet..." -ForegroundColor Yellow
      & winget upgrade --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
    } else {
      return
    }

    Refresh-NodePath
    $installed = Get-NodeVersion
    if ($installed -and $installed -ge $minimum) {
      Write-Host "[OmniYomi] Node.js $installed instalado pelo WinGet." -ForegroundColor Green
      return
    }

    Write-Warning "WinGet não concluiu a instalação/atualização. Tentando o pacote oficial portátil do Node.js."
  }

  Write-Host "[OmniYomi] Baixando Node.js 24 LTS oficial com verificação SHA-256..." -ForegroundColor Yellow
  $releaseIndex = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -TimeoutSec 45
  $release = $releaseIndex |
    Where-Object { $_.version -match "^v24\." -and $_.lts } |
    Sort-Object date -Descending |
    Select-Object -First 1
  if (-not $release) {
    throw "Não foi possível localizar uma versão Node.js 24 LTS no índice oficial."
  }

  $version = [string]$release.version
  $archiveName = "node-$version-win-x64.zip"
  $baseUrl = "https://nodejs.org/dist/$version/"
  $tempRoot = Join-Path $env:TEMP ("omniyomi-node-" + [Guid]::NewGuid().ToString("N"))
  $archivePath = Join-Path $tempRoot $archiveName
  $checksumsPath = Join-Path $tempRoot "SHASUMS256.txt"
  $extractPath = Join-Path $tempRoot "extracted"
  $targetRoot = Join-Path $env:LOCALAPPDATA "Programs\nodejs"
  $backupRoot = Join-Path $env:LOCALAPPDATA ("Programs\nodejs-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  $movedOld = $false

  try {
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    Invoke-WebRequest -Uri ($baseUrl + $archiveName) -OutFile $archivePath -UseBasicParsing -TimeoutSec 600
    Invoke-WebRequest -Uri ($baseUrl + "SHASUMS256.txt") -OutFile $checksumsPath -UseBasicParsing -TimeoutSec 60

    $checksumLine = Get-Content $checksumsPath |
      Where-Object { $_ -match ("^([a-fA-F0-9]{64})\s+\*?" + [regex]::Escape($archiveName) + "$") } |
      Select-Object -First 1
    if (-not $checksumLine) {
      throw "O arquivo SHASUMS256 oficial não contém o checksum do pacote Windows."
    }
    $expectedHash = ($checksumLine -split "\s+")[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
      throw "O SHA-256 do pacote oficial Node.js não confere. O arquivo foi descartado."
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force
    $stagedNode = Join-Path $extractPath ("node-" + $version + "-win-x64")
    if (-not (Test-Path (Join-Path $stagedNode "node.exe")) -or
        -not (Test-Path (Join-Path $stagedNode "npm.cmd"))) {
      throw "O ZIP oficial não contém node.exe e npm.cmd nos caminhos esperados."
    }

    $programs = Split-Path -Parent $targetRoot
    New-Item -ItemType Directory -Path $programs -Force | Out-Null
    if (Test-Path $targetRoot) {
      Move-Item $targetRoot $backupRoot
      $movedOld = $true
    }
    try {
      Move-Item $stagedNode $targetRoot
    } catch {
      if ($movedOld -and (Test-Path $backupRoot)) {
        Move-Item $backupRoot $targetRoot
        $movedOld = $false
      }
      throw
    }

    Refresh-NodePath
    $installed = Get-NodeVersion
    if (-not $installed -or $installed -lt $minimum) {
      throw "A verificação da instalação Node.js falhou."
    }

    if ($movedOld -and (Test-Path $backupRoot)) {
      Remove-Item $backupRoot -Recurse -Force
    }
    Write-Host "[OmniYomi] Node.js $installed instalado e validado." -ForegroundColor Green
  } finally {
    if (Test-Path $tempRoot) {
      Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

Refresh-NodePath
$nodeVersion = Get-NodeVersion
if (-not $nodeVersion -or $nodeVersion -lt [version]"22.12.0") {
  Install-NodeLts
  Refresh-NodePath
  $nodeVersion = Get-NodeVersion
}

if (-not $nodeVersion -or $nodeVersion -lt [version]"22.12.0") {
  throw "Node.js 22.12+ não está disponível mesmo após a instalação automática."
}
Write-Host "[OmniYomi] Node.js $nodeVersion detectado." -ForegroundColor Green

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
