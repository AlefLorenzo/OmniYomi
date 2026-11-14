# Script para configurar o ambiente Android do OmniYomi
param([switch]$Release)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\client"
Write-Host "Instalando dependencias..."
npm install
Write-Host "Compilando o cliente React..."
npm run build
Write-Host "Inicializando Capacitor Android..."
try { npx cap add android 2>&1 } catch { Write-Host "android ja adicionado" }
Write-Host "Sincronizando Capacitor..."
npx cap sync android
Write-Host ""
Write-Host "Setup completo!"
Write-Host "Para gerar o APK de debug, execute:"
Write-Host "  cd $root\client\android && .\gradlew.bat assembleDebug"
Write-Host "Para abrir no Android Studio:"
Write-Host "  npx cap open android"
