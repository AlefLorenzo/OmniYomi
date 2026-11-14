#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Configurando OmniYomi para Android ==="
cd "$ROOT_DIR/client"

echo "-> Instalando dependências..."
npm install

echo "-> Compilando o cliente React..."
npm run build

echo "-> Inicializando Capacitor Android..."
npx cap add android || echo "Plataforma Android já adicionada"

echo "-> Sincronizando arquivos com o projeto Android..."
npx cap sync android

echo ""
echo "=== Setup Completo! ==="
echo "Para gerar o APK de debug:"
echo "  cd $ROOT_DIR/client/android && ./gradlew assembleDebug"
echo "Para abrir no Android Studio:"
echo "  npx cap open android"
