[CmdletBinding()]
param(
  [switch]$NoLaunch,
  [switch]$KeepBuildFiles
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$owner = "AlefLorenzo"
$repository = "OmniYomi"
$branch = "feature/windows-desktop-launcher"
$archiveUrl = "https://codeload.github.com/$owner/$repository/zip/refs/heads/$branch"
$localRoot = Join-Path $env:LOCALAPPDATA "OmniYomi"
$sourceRoot = Join-Path $localRoot "installer-source"
$stagingRoot = Join-Path $localRoot "installer-staging"
$backupRoot = Join-Path $localRoot ("installer-source-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
$tempZip = Join-Path $env:TEMP ("omniyomi-source-" + [Guid]::NewGuid().ToString("N") + ".zip")
$installerWasBuilt = $false

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "=== $Message ===" -ForegroundColor Cyan
}

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

function Run-External([string]$File, [string[]]$Arguments, [string]$WorkingDirectory) {
  Push-Location $WorkingDirectory
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$File $($Arguments -join ' ') falhou com código $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

if ($env:OS -ne "Windows_NT" -or [Environment]::Is64BitOperatingSystem -ne $true) {
  throw "Este instalador automático exige Windows 10/11 de 64 bits."
}

if (-not $env:LOCALAPPDATA) {
  throw "Não foi possível localizar a pasta LocalAppData do usuário."
}

New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
if (Test-Path $stagingRoot) {
  Remove-Item $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

try {
  Write-Step "Baixando a versão do OmniYomi do GitHub"
  Invoke-WebRequest -Uri $archiveUrl -OutFile $tempZip -UseBasicParsing
  Expand-Archive -LiteralPath $tempZip -DestinationPath $stagingRoot -Force

  $extracted = Get-ChildItem -LiteralPath $stagingRoot -Directory | Select-Object -First 1
  if (-not $extracted -or -not (Test-Path (Join-Path $extracted.FullName "package.json"))) {
    throw "O arquivo do GitHub foi baixado, mas a pasta do projeto não foi encontrada."
  }

  if (Test-Path $sourceRoot) {
    Write-Step "Preservando dependências locais e atualizando os arquivos do projeto"
    if (Test-Path (Join-Path $sourceRoot "node_modules")) {
      Move-Item (Join-Path $sourceRoot "node_modules") (Join-Path $extracted.FullName "node_modules") -Force
    }
    if ((Test-Path (Join-Path $sourceRoot "client\node_modules")) -and
        (Test-Path (Join-Path $extracted.FullName "client"))) {
      New-Item -ItemType Directory -Path (Join-Path $extracted.FullName "client\node_modules") -Force | Out-Null
      Move-Item (Join-Path $sourceRoot "client\node_modules") (Join-Path $extracted.FullName "client\node_modules") -Force
    }
    Move-Item $sourceRoot $backupRoot
  }

  Move-Item $extracted.FullName $sourceRoot

  Write-Step "Instalando/verificando Node.js, dependências e runtime"
  $setupScript = Join-Path $sourceRoot "scripts\setup.ps1"
  if (-not (Test-Path $setupScript)) {
    throw "O script de preparação do projeto não foi encontrado."
  }
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $setupScript -SkipBuild
  if ($LASTEXITCODE -ne 0) {
    throw "A preparação do ambiente falhou com código $LASTEXITCODE."
  }
  Refresh-NodePath
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js não está disponível após a preparação. Feche e reabra o PowerShell e tente novamente."
  }

  Write-Step "Compilando e criando o instalador Windows x64"
  Run-External "npm.cmd" @("run", "desktop:dist") $sourceRoot

  $releaseDir = Join-Path $sourceRoot "release"
  $installer = Get-ChildItem -LiteralPath $releaseDir -Filter "OmniYomi-Desktop-*-x64.exe" -File |
    Where-Object { $_.Name -notmatch "portable" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $installer) {
    throw "A compilação terminou, mas o instalador NSIS x64 não foi encontrado em $releaseDir."
  }
  $installerWasBuilt = $true

  Write-Step "Instalando OmniYomi silenciosamente"
  $process = Start-Process -FilePath $installer.FullName -ArgumentList @("/S") -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "O instalador NSIS encerrou com código $($process.ExitCode)."
  }

  Write-Host "Instalador executado: $($installer.FullName)" -ForegroundColor Green
  Write-Host "Banco, progresso, biblioteca, extensões e downloads existentes em $localRoot\data não foram apagados." -ForegroundColor Green

  if (-not $NoLaunch) {
    $programs = Join-Path $env:LOCALAPPDATA "Programs"
    $appExecutable = $null
    if (Test-Path $programs) {
      $appExecutable = Get-ChildItem -LiteralPath $programs -Filter "*.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match "OmniYomi" -and $_.Name -notmatch "Uninstall|Setup" } |
        Select-Object -First 1
    }
    if ($appExecutable) {
      Write-Step "Abrindo OmniYomi Desktop"
      Start-Process -FilePath $appExecutable.FullName
    } else {
      Write-Warning "Instalação concluída. O executável foi instalado, mas não foi localizado automaticamente no diretório Programs."
      Start-Process explorer.exe $programs
    }
  }

  if (-not $KeepBuildFiles -and (Test-Path $backupRoot)) {
    Remove-Item $backupRoot -Recurse -Force
  }

  Write-Host ""
  Write-Host "OMNIYOMI INSTALADO. Se esta foi a primeira execução, aguarde o runtime e os catálogos terminarem de inicializar." -ForegroundColor Green
  Write-Host "Código-fonte e compilação: $sourceRoot"
} catch {
  Write-Host ""
  Write-Host "FALHA NA INSTALAÇÃO: $($_.Exception.Message)" -ForegroundColor Red
  if ((Test-Path $backupRoot) -and -not (Test-Path $sourceRoot)) {
    Move-Item $backupRoot $sourceRoot
    Write-Warning "A versão anterior do código foi restaurada."
  }
  if ($installerWasBuilt) {
    Write-Warning "O instalador compilado está preservado na pasta release do projeto."
  }
  throw
} finally {
  if (Test-Path $tempZip) {
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $stagingRoot) {
    Remove-Item $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}