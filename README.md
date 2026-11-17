# 📱 OmniYomi — Leitor & Gerenciador de Mangás, Manhwas e Manhuas

<details open>
<summary><strong>⬇️ BAIXAR OMNIYOMI DESKTOP PARA WINDOWS (64 BITS)</strong></summary>

**[CLIQUE AQUI PARA BAIXAR O EXECUTÁVEL (.EXE)](https://github.com/AlefLorenzo/OmniYomi/actions/runs/44000431532)**

Na página que abrir, desça até **Artifacts** e baixe **OmniYomi-Desktop-Windows-x64**. Extraia o ZIP e execute o instalador `.exe` (ou escolha a versão portátil, se incluída).

Compatível com Windows 10/11 x64. O instalador mantém os dados do OmniYomi em `%LOCALAPPDATA%\OmniYomi\data`.

</details>

---

O **OmniYomi** é uma plataforma completa e moderna de leitura, agregação e gerenciamento de mangás, manhwas e manhuas. Inspirado no ecossistema **Tachiyomi / Suwayomi / Keiyoushi**, o OmniYomi unifica um servidor de alta performance, catálogo com normalização precisa de títulos, leitura fluida e suporte completo ao aplicativo **Android (APK)** com sincronização e leitura offline.

---

## ✨ Recursos Principais

### 🌐 Integração Real com Extensões Tachiyomi
- Execução direta dos repositórios de extensões do Tachiyomi / Keiyoushi.
- Consulta ao catálogo real por fonte individual (sem catálogos fictícios).
- Extração de metadados, paginação completa de todos os capítulos, capas em alta definição e lista de páginas.
- Filtragem estrita por fonte selecionada: selecionar uma extensão exibe única e exclusivamente suas obras.

### 🇧🇷 Títulos em Português (PT-BR) e Inglês (EN)
- Sistema automático de normalização e validação de títulos.
- Elimina títulos brutos em Hangul, Kanji ou Hanzi no título principal.
- Ordem de prioridade inteligente: PT-BR oficial > Inglês oficial > Título alternativo em EN > Tradução PT-BR confiável.

### 📱 Experiência Mobile & Android Nativo (APK)
- **Barra de Navegação Inferior (Bottom Nav)**: navegação intuitiva com uma mão no celular (Início, Biblioteca, Catálogo, Downloads e Configurações).
- **Safe Area & Notches**: suporte completo a telas modernas, barras de gestos do Android e câmeras em furo/notch (`viewport-fit=cover`).
- **Layout Adaptável**:
  - Celulares: 2 colunas no catálogo e biblioteca, hero view vertical na página de detalhes.
  - Tablets e Dobráveis: 3 a 4 colunas dinâmicas.
  - Desktop: 4 a 6 colunas com sidebar retrátil.
- **Leitor Otimizado**: suporte a tela cheia, leitura vertical (webtoon) e modo páginas.

### 📥 Downloads Físicos no Dispositivo & Leitura 100% Offline
- **Armazenamento no Aparelho**: os capítulos baixados são salvos fisicamente no armazenamento do dispositivo (`OmniYomi/Downloads/[Fonte]/[Obra]/[Capítulo]/page-XXX.jpg`).
- **Independência do Servidor para Leitura**: capítulos baixados abrem instantaneamente offline (`isOffline: true`) sem depender de conexão com o servidor ou com a internet.
- **Download em Lote**: suporte a baixar capítulos individuais ou faixas inteiras de capítulos.
- **Notificação em Tempo Real**: WebSocket integrado (`DOWNLOAD_COMPLETED` e `DOWNLOAD_PROGRESS`) com atualização visual automática.

### 🔄 Sistema de Atualização Integrado (In-App Updater)
- O aplicativo verifica automaticamente a existência de novas versões publicadas no **GitHub Releases**.
- Ao detectar uma atualização, apresenta um banner amigável informando a nova versão e o changelog.
- Permite o download direto do novo arquivo `.apk` com confirmação padrão de segurança do Android.
- Preserva todos os dados locais, biblioteca, favoritos, histórico e capítulos baixados ao atualizar.

---

## 🛠️ Arquitetura do Projeto

```
OmniYomi/
├── client/                     # Interface React 19 + TailwindCSS v4 + Vite
│   ├── src/
│   │   ├── components/         # Componentes UI, Layout, BottomNav e UpdateChecker
│   │   ├── pages/              # Páginas (Catálogo, Detalhes, Leitor, Biblioteca, etc.)
│   │   ├── lib/                # API client, WebSocket e Updater
│   │   └── App.tsx             # Rotas e provedores
│   ├── capacitor.config.ts     # Configuração do Capacitor Android
│   └── package.json
│
├── server/                     # Backend Node.js + Express + TypeScript
│   ├── src/
│   │   ├── db/                 # Banco SQLite (better-sqlite3) e migrações
│   │   ├── routes/             # Endpoints REST (manga, capítulos, fontes, downloads)
│   │   ├── services/           # DownloadManager, LibraryManager, SuwayomiService
│   │   ├── sources/            # Adapters de extensões APK e MangaDex
│   │   └── index.ts            # Ponto de entrada do servidor
│   └── tsconfig.json
│
├── .github/workflows/          # Pipeline de CI/CD
│   ├── android-build.yml       # Compilação automática do APK & GitHub Releases
│   └── ci.yml                  # Validação e testes automáticos
│
├── scripts/                    # Scripts de automação
│   ├── setup-android.ps1       # Setup do ambiente Android (Windows PowerShell)
│   └── setup-android.sh        # Setup do ambiente Android (Linux/macOS)
│
└── data/                       # Armazenamento local (banco, downloads, extensões)
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js** v22.12 ou superior (Node.js 24 recomendado)
- **npm** v10 ou superior
- **Java 17+** (caso utilize o runtime Suwayomi localmente)

### 1. Instalação das Dependências
```bash
# Na raiz do projeto
npm install

# No diretório do cliente
cd client && npm install
cd ..
```

### 2. Iniciar em Modo de Desenvolvimento
```bash
# Iniciar o servidor backend (porta 4567)
npm run dev:server

# Em outro terminal, iniciar o cliente web (porta 3000)
npm run dev:client
```
Acesse no seu navegador: `http://localhost:3000`.

---

## 📱 Compilação do APK Android

### 1. Compilação Local com Capacitor & Android Studio

```bash
# 1. Compilar o frontend web
npm run build:client

# 2. Inicializar e sincronizar o projeto Android (primeira vez)
powershell -ExecutionPolicy Bypass -File ./scripts/setup-android.ps1
# Ou no Linux/macOS:
# bash ./scripts/setup-android.sh

# 3. Gerar o APK de Debug via linha de comando:
cd client/android
./gradlew assembleDebug

# O APK estará em:
# client/android/app/build/outputs/apk/debug/app-debug.apk
```

Para abrir no **Android Studio**:
```bash
cd client
npx cap open android
```

---

## 🤖 Pipeline de CI/CD no GitHub Actions

O projeto conta com automação completa via **GitHub Actions** em `.github/workflows/android-build.yml`:

### Como Gerar um Novo APK Automaticamente:
1. **Via Tag (Recomendado)**:
   ```bash
   git tag -a v1.0.0 -m "OmniYomi v1.0.0"
   git push origin v1.0.0
   ```
   O GitHub Actions irá:
   - Compilar o cliente React e sincronizar com o Capacitor.
   - Compilar o APK (`assembleDebug` e `assembleRelease`).
   - Criar uma **GitHub Release** automaticamente com o arquivo `OmniYomi-v1.0.0-debug.apk` anexado para download.
   - Disponibilizar a atualização para os usuários pelo próprio app!

2. **Via Execução Manual (Workflow Dispatch)**:
   - Acesse a aba **Actions** no seu repositório GitHub.
   - Selecione o workflow **Android Build & Release**.
   - Clique em **Run workflow** e informe a versão desejada.

### Assinatura do APK (Release Keystore)
Para gerar APKs assinados para distribuição de produção:
1. Gere um par de chaves:
   ```bash
   keytool -genkey -v -keystore omniyomi.keystore -alias omniyomi -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Converta o arquivo `.keystore` para base64:
   ```bash
   # Windows (PowerShell)
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("omniyomi.keystore")) | Set-Clipboard
   ```
3. No repositório GitHub, vá em **Settings → Secrets and variables → Actions** e adicione:
   - `KEYSTORE_BASE64`: Conteúdo em base64 da keystore.
   - `KEYSTORE_PASSWORD`: Senha da keystore.
   - `KEY_ALIAS`: Alias da chave (`omniyomi`).
   - `KEY_PASSWORD`: Senha da chave.

---

## 📱 Compatibilidade Android

| Versão Android | API Level | Suporte |
|----------------|-----------|---------|
| Android 7.0+   | API 24+   | ✅ Suportado Oficialmente |
| Android 8.0+   | API 26+   | ✅ Suportado |
| Android 10+    | API 29+   | ✅ Suportado (Scoped Storage compatível) |
| Android 12+    | API 31+   | ✅ Suportado (Material You & Splash nativo) |
| Android 14+    | API 34+   | ✅ Suportado (Target SDK atual) |

---

## 📄 Licença
Distribuído sob licença aberta com foco em software livre e preservação digital.


---

## 🖥️ OmniYomi Desktop para Windows

O repositório também oferece um inicializador desktop para Windows 10/11 x64. Ele inicia o backend local, valida o endpoint \`/api/health\`, abre a interface em uma janela própria e encerra somente os processos que ele iniciou.

### Compilar localmente

\`\`\`powershell
npm install
npm --prefix client install
npm run desktop:smoke
npm run desktop:dist
\`\`\`

Os executáveis NSIS e portátil são gerados em \`release/\`. O build automatizado ocorre no workflow **Windows Desktop Build**.

### Dados preservados

Banco, downloads, extensões e logs ficam em \`%LOCALAPPDATA%\\OmniYomi\\\`, separados do diretório de instalação para sobreviver a atualizações e desinstalações. Em ambiente de desenvolvimento, o launcher pode migrar com backup validado o banco legado da pasta \`data/\`.

Consulte [desktop/README.md](desktop/README.md) para detalhes do ciclo de vida e configuração do runtime opcional Suwayomi.



## ⚡ Instalação completa com um único comando (Windows 10/11 x64)

Abra o PowerShell e cole esta única linha:

\`\`\`powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/AlefLorenzo/OmniYomi/feature/windows-desktop-launcher/scripts/install-windows.ps1 | iex
\`\`\`

O instalador baixa a branch do Desktop, preserva a pasta de dados em \`%LOCALAPPDATA%\\OmniYomi\\data\`, verifica/instala Node.js, dependências e runtime Suwayomi, compila o instalador NSIS, instala o aplicativo e tenta abri-lo. Dependências e runtime válidos são reaproveitados.
