# 📱 OmniYomi — Leitor & Gerenciador de Mangás, Manhwas e Manhuas

O **OmniYomi** é uma plataforma de leitura e gerenciamento de mangás, manhwas e manhuas. O projeto possui uma interface web/desktop que pode usar o backend opcional e um aplicativo Android Capacitor com recursos 100% locais (sem servidor obrigatório).

---

## ✨ Recursos Principais

### 🌐 Repositórios e extensões
- Consulta de índices JSON e Protobuf (`index.pb`) hospedados nos repositórios configurados.
- Validação do APK, package name e metadados antes do carregamento.
- **Runtime Android nativo** com suporte às ABIs Tachiyomi/Mihon 1.4 (RxJava) e 1.6 (Kotlin Coroutines).
- Extensões incompatíveis são rejeitadas com mensagem clara, em vez de serem registradas falsamente.
- A lista de fontes do Android mostra somente fontes realmente carregadas pelo runtime.

### 📱 Modo Android 100% Offline (Sem Servidor Obrigatório)
- **O APK funciona totalmente sem servidor** - todas as operações de extensão rodam nativamente no dispositivo.
- Biblioteca, favoritos, categorias, histórico e metadados de leitura usam persistência local no aparelho.
- O Android consulta os repositórios de extensões diretamente (GitHub) e executa as operações via runtime nativo.
- **Não requer Suwayomi/Tachidesk rodando em servidor** - o runtime de extensões está embutido no APK.

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
- **Independência Total**: capítulos baixados abrem instantaneamente offline (`isOffline: true`) sem depender de conexão com servidor ou internet.
- **Download nativo**: capítulos são baixados usando o cliente HTTP e cabeçalhos específicos da fonte (Referer, User-Agent, cookies).
- **Biblioteca de downloads**: lista capítulos baixados e calcula o espaço utilizado diretamente no aparelho.

### 🔄 Sistema de Atualização Integrado (In-App Updater)
- O aplicativo verifica automaticamente a existência de novas versões publicadas no **GitHub Releases**.
- Ao detectar uma atualização, apresenta um banner amigável informando a nova versão e o changelog.
- Permite o download direto do novo arquivo `.apk` com confirmação padrão de segurança do Android.
- Preserva todos os dados locais, biblioteca, favoritos, histórico e capítulos baixados ao atualizar.

### 🔐 Permissões Android (Estilo Tachiyomi)
O APK solicita as mesmas permissões essenciais do Tachiyomi para funcionamento completo:
- **Internet & Rede**: Acesso a sites de mangá e verificação de conectividade
- **Armazenamento**: Leitura/escrita de downloads offline e arquivos locais (CBZ, ZIP, pastas de imagens)
- **Notificações**: Alertas de download, atualizações e novos capítulos
- **Foreground Service**: Downloads em background que sobrevivem ao app fechado
- **Wake Lock**: Manter CPU ativa durante downloads longos
- **Boot Completed**: Reinicializar serviços após reiniciar o aparelho
- **Install Packages**: Instalar APKs de extensão baixados
- **Exact Alarms**: Agendamento preciso de verificações de atualização

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
│   ├── android/                # Projeto Android nativo (Capacitor)
│   │   ├── app/src/main/java/com/omniyomi/app/
│   │   │   ├── ExtensionManager.java        # Gerenciador de extensões nativo
│   │   │   ├── ExtensionRuntimeContext.java # Contexto de runtime
│   │   │   ├── MihonRuntimeBootstrap.kt     # Inicialização Injekt/Network
│   │   │   ├── ExtensionSuspendBridge.kt    # Bridge Kotlin suspend ↔ Java
│   │   │   ├── TachiyomiNativePlugin.java   # Plugin Capacitor ↔ Native
│   │   │   ├── DownloadForegroundService.java # Service download background
│   │   │   └── BootReceiver.java            # Receiver boot completed
│   │   └── res/xml/file_paths.xml           # FileProvider paths
│   ├── capacitor.config.json   # Configuração do Capacitor Android
│   └── package.json
│
├── server/                     # Backend Node.js + Express + TypeScript (OPCIONAL)
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
    └── extensions/
        ├── extracted/          # Extensões APK extraídas (manifests)
        ├── cache/              # Cache de repositórios
        └── weebcentral.js      # Extensão JS de exemplo
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js** v20 ou superior
- **npm** v10 ou superior
- **Java 17+** (apenas se for usar o backend Suwayomi localmente)

### 1. Instalação das Dependências
```bash
# Na raiz do projeto
npm install

# No diretório do cliente
cd client && npm install
cd ..
```

### 2. Iniciar em Modo de Desenvolvimento

#### Opção A: Apenas Cliente Web (Sem Backend)
```bash
cd client && npm run dev
```
Acesse no seu navegador: `http://localhost:5173`.
> **Nota**: O cliente web em modo dev conecta ao backend se disponível, mas o APK Android NÃO precisa do backend.

#### Opção B: Cliente + Backend (Servidor Opcional)
```bash
# Terminal 1 - Iniciar o servidor backend (porta 4567)
npm run dev:server

# Terminal 2 - Iniciar o cliente web (porta 5173)
cd client && npm run dev
```

#### Opção C: Backend com Suwayomi (Avançado)
```bash
# Configure as variáveis de ambiente (copie .env.example para .env)
cp .env.example .env
# Edite .env e configure SUWAYOMI_DIR, SUWAYOMI_JAVA_PATH, SUWAYOMI_JAR_PATH

npm run dev:server
```
> O Suwayomi é **totalmente opcional**. O Android usa runtime nativo embutido.

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

### 2. Permissões do APK Gerado
O APK compilado inclui automaticamente todas as permissões necessárias (ver `AndroidManifest.xml`):
- `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`
- `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `MANAGE_EXTERNAL_STORAGE`
- `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`
- `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `REQUEST_INSTALL_PACKAGES`
- `VIBRATE`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`

---

## 🤖 Pipeline de CI/CD no GitHub Actions

O projeto conta com automação completa via **GitHub Actions** em `.github/workflows/`:

### Workflows Disponíveis

#### `android-build.yml` - Build & Release do APK
- Trigger: push para `master`/`main`, tags `v*`, ou manual (`workflow_dispatch`)
- Compila APK Debug e Release
- Executa testes instrumentados em emulador Android (API 30)
- Publica Release no GitHub com APKs anexados

#### `ci.yml` - Validação Contínua
- Trigger: push e PR para `master`/`main`
- Instala dependências, valida TypeScript, compila cliente

### Como Gerar um Novo APK Automaticamente:

1. **Via Tag (Recomendado)**:
   ```bash
   git tag -a v1.1.8 -m "OmniYomi v1.1.8"
   git push origin v1.1.8
   ```
   O GitHub Actions irá:
   - Compilar o cliente React e sincronizar com o Capacitor
   - Compilar o APK (`assembleDebug` e `assembleRelease` se keystore configurada)
   - Executar testes instrumentados
   - Criar uma **GitHub Release** automaticamente com o arquivo `OmniYomi-v1.1.8.apk` anexado

2. **Via Execução Manual (Workflow Dispatch)**:
   - Acesse a aba **Actions** no seu repositório GitHub
   - Selecione o workflow **Android Build & Release**
   - Clique em **Run workflow** e informe a versão desejada

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
   # Linux/macOS
   base64 -i omniyomi.keystore | pbcopy
   ```
3. No repositório GitHub, vá em **Settings → Secrets and variables → Actions** e adicione:
   - `KEYSTORE_BASE64`: Conteúdo em base64 da keystore
   - `KEYSTORE_PASSWORD`: Senha da keystore
   - `KEY_ALIAS`: Alias da chave (`omniyomi`)
   - `KEY_PASSWORD`: Senha da chave

---

## 📱 Compatibilidade Android

| Versão Android | API Level | Suporte | Observações |
|----------------|-----------|---------|-------------|
| Android 7.0 (Nougat) | 24 | ✅ Total | minSdkVersion |
| Android 8.0-8.1 (Oreo) | 26-27 | ✅ Total | |
| Android 9 (Pie) | 28 | ✅ Total | |
| Android 10 | 29 | ✅ Total | Scoped Storage parcial |
| Android 11 | 30 | ✅ Total | Scoped Storage total |
| Android 12 | 31 | ✅ Total | Exact Alarms, Notifications |
| Android 13 | 33 | ✅ Total | POST_NOTIFICATIONS, Media Permissions |
| Android 14 | 34 | ✅ Total | targetSdkVersion |
| Android 15 | 35 | ✅ Total | Compilado contra API 36 |
| Android 16 | 36 | ✅ Total | compileSdkVersion |

---

## ⚙️ Configuração do Servidor (Opcional)

O backend Node.js/Express é **opcional** e serve apenas para:
- Interface web/desktop acessível via navegador
- Sincronização de biblioteca entre dispositivos (via conta)
- Proxy de imagens para contornar CORS/Referer
- Gerenciamento centralizado de extensões

### Variáveis de Ambiente
Copie `.env.example` para `.env` e configure:

```bash
cp .env.example .env
```

Principais variáveis:
| Variável | Obrigatória? | Descrição |
|----------|--------------|-----------|
| `PORT` | Não | Porta do servidor (padrão: 4567) |
| `SUWAYOMI_ENABLED` | Não | Habilitar Suwayomi (padrão: true se SUWAYOMI_DIR configurado) |
| `SUWAYOMI_DIR` | Se Suwayomi habilitado | Diretório base do Suwayomi Server |
| `SUWAYOMI_JAVA_PATH` | Não | Caminho para java.exe do Suwayomi |
| `SUWAYOMI_JAR_PATH` | Não | Caminho para Suwayomi-Server.jar |

> **Importante**: O APK Android **NÃO** usa essas variáveis. Ele roda 100% offline com runtime nativo.

---

## 🔧 Solução de Problemas Comuns

### APK não instala / "App não instalado"
- Verifique se `minSdkVersion 24` (Android 7.0+) é compatível com seu dispositivo
- Permita "Instalar apps desconhecidos" nas configurações do Android
- Se atualizando, desinstale a versão anterior primeiro (assinaturas diferentes)

### Extensões não carregam / "API não suportada"
- Extensões modernas (Mihon/TachiyomiX 1.6) exigem runtime 1.6
- O OmniYomi suporta ABIs 1.4 e 1.6 - verifique `tachiyomi.extensionLib` no manifest da extensão
- Extensões com `tachiyomix.extensionLib` typo também são suportadas

### Downloads falham / "HTTP 403"
- O download nativo usa headers da fonte (Referer, User-Agent, cookies)
- Algumas fontes exigem headers específicos - verifique logs do `ExtensionManager`
- Use `downloadChapterFromSource` para baixar via cliente HTTP da própria extensão

### Erro de build no GitHub Actions
- Verifique se `gradlew` tem permissão de execução (`chmod +x`)
- Java 21 é necessário (configurado no workflow)
- Cache do Gradle acelera builds subsequentes

---

## 📄 Licença
Distribuído sob licença aberta com foco em software livre e preservação digital.

---

## 🤝 Contribuindo
1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/nova-funcionalidade`
3. Commit suas mudanças: `git commit -m 'feat: adiciona nova funcionalidade'`
4. Push para a branch: `git push origin feature/nova-funcionalidade`
5. Abra um Pull Request

---

## 📞 Suporte
- **Issues**: [GitHub Issues](https://github.com/AlefLorenzo/OmniYomi/issues)
- **Discussões**: [GitHub Discussions](https://github.com/AlefLorenzo/OmniYomi/discussions)