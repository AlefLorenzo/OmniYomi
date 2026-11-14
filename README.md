# OmniYomi — Plataforma Completa de Leitura de Mangás, Manhwas e Manhuas

> Inspirado no ecossistema **Tachidesk Server** e **Tachiyomi/Mihon**, com identidade visual própria, arquitetura modular local-first, gerenciamento completo de downloads, leitor especializado (Webtoon vertical contínuo e Mangá paginado) e suporte a leitura 100% offline.

---

## 🚀 Visão Geral do Sistema

O **OmniYomi** foi desenvolvido para proporcionar controle absoluto ao usuário sobre suas fontes, catálogos, biblioteca, downloads e experiência de leitura.

```
┌─────────────────────────────────────────────────────────────┐
│                 OmniYomi Web Interface                      │
│        (React 19 + TypeScript + Vite + Tailwind CSS)        │
│   Início • Catálogo • Fontes • Biblioteca • Downloads ...   │
└──────────────────────────────▲──────────────────────────────┘
                               │ HTTP REST + WebSockets (ws://)
┌──────────────────────────────▼──────────────────────────────┐
│                    OmniYomi Core Server                     │
│               (Node.js v22 + Express + TSX)                 │
├──────────────────────────────┬──────────────────────────────┤
│      Database & Storage      │      Download & Queue        │
│    SQLite (better-sqlite3)   │   Concurrent Image Worker    │
│    Data Directory: data/     │   Magic Number Validation    │
├──────────────────────────────┴──────────────────────────────┤
│                  Modular Extension Engine                   │
│   • MangaDex (Official API v5: Multi-lang, High-Res)        │
│   • WeebCentral (Community Scraper Extension)               │
│   • Armazenamento Local (Offline CBZ, ZIP & Folder Scanner) │
│   • Sandbox VM Loader (Dynamic .js Extensions)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🌟 Funcionalidades Principais

### 1. Sistema de Fontes e Extensões Modulares
- **Suporte Multiformato a Repositórios Tachiyomi / Mihon / Suwayomi**:
  - **Protocol Buffers (`index.pb`)**: Decodificação nativa com descompressão Gzip automática (usado por repositórios modernos como **FelipeGFA** e **Cursed Yūzōnō**).
  - **JSON Moderno (`index.json`)**: Formato hierárquico com manifesto e metadados completos (usado pelo catálogo principal do **Keiyoushi** com mais de 1.600 extensões).
  - **JSON Legado (`index.min.json`)**: Formato clássico em array (usado por **Suwayomi** e **Kavita**).
- **Repositórios Pré-configurados**:
  1. **Keiyoushi**: Maior catálogo comunitário global com 1.600+ extensões.
  2. **FelipeGFA**: Projeto com foco especial em extensões e scanlations em Português (PT-BR).
  3. **Cursed Yūzōnō**: Catálogo adicional com fontes especiais.
  4. **Kavita**: Extensões para integração com servidores de quadrinhos Kavita.
  5. **Suwayomi Official**: Extensão de conexão com servidores Suwayomi/Tachidesk.
- **Descompactador e Extrator de APKs**:
  - Baixa e descompacta arquivos `.apk` com extração de `classes.dex`, `AndroidManifest.xml`, ícones e fontes.
  - Carrega as fontes em tempo real através do **`ApkSourceAdapter`** sem necessidade de reiniciar.
- **MangaDex Oficial (API v5)**: Milhares de títulos em múltiplos idiomas (Português PT-BR, Inglês, Espanhol), sinopses, capas em alta definição e lista completa de capítulos.
- **WeebCentral**: Extensão dinâmica para lançamentos rápidos de manhwas e webtoons populares.
- **Armazenamento Local (Offline)**: Suporte a arquivos locais em formato `.cbz`, `.zip` e pastas com imagens (`.jpg`, `.png`, `.webp`). Basta adicionar seus títulos na pasta `data/local_manga/` para leitura instantânea sem internet!
- **Motor de Extensões em Sandbox**: Permite adicionar novas fontes dinamicamente na pasta `data/extensions/` sem necessidade de recompilar o núcleo da aplicação.
- **Verificação de Saúde**: Teste de conectividade com resposta em tempo real (`Online` / `Falha`).

> **Nota Técnica de Compatibilidade com Tachiyomi/Suwayomi:**  
> Extensões originais do Tachiyomi são pacotes Android compilados em bytecode Dalvik (`.apk` / `classes.dex`), que exigem emuladores ou stubs do framework Android (como o Suwayomi implementa em Java/Kotlin). O OmniYomi adota a especificação moderna de **Extensões Modulares JavaScript/TypeScript** (padrão adotado por projetos modernos como Aidoku e Paperback), garantindo execução nativa, ultrarrápida, segura e isolada sem sobrecarga de máquina virtual Dalvik.

### 2. Catálogo e Pesquisa Global
- Grade responsiva com capas de alta qualidade (adaptando-se de 2 até 6 colunas dependendo do monitor).
- Pesquisa instantânea por título com debounce.
- Filtros por demografia (Shounen, Seinen, Shoujo, Josei) e idiomas (PT-BR, EN, ES).
- Abas rápidas para obras mais populares e atualizações recentes.

### 3. Página de Detalhes da Obra
- Capa em destaque, autores, artistas, sinopse expansível, gêneros e status de publicação.
- Lista completa de capítulos com numeração precisa e data de lançamento.
- Indicador visual de capítulo **Lido** e capítulo **Baixado (Offline)**.
- **Seleção Flexível de Intervalos**:
  - Selecionar todos os capítulos com um clique.
  - Seleção por intervalos pré-definidos: `1 a 50`, `51 a 100`, `101 a 200`.
  - Seletor de intervalo personalizado (`De: X Até: Y`).
- Download em lote e marcação de status em lote.

### 4. Gerenciador de Downloads Robusto
- Fila concorrente com controle configurável de downloads simultâneos (1 a 5).
- Atualização em tempo real via **WebSockets** (barra de progresso individual e geral).
- Capacidade de pausar, retomar, cancelar e limpar downloads concluídos.
- **Prevenção de duplicatas**: Capítulos já baixados são identificados e protegidos.
- **Validação de Integridade**: Verificação de assinaturas mágicas de bytes (`JPEG`, `PNG`, `WEBP`, `GIF`) para impedir que arquivos corrompidos ou páginas de erro 403 sejam salvas como imagens.
- Estrutura organizada no disco: `data/downloads/{sourceId}/{mangaTitle}/{chapterTitle}/page-XXX.ext`.
- Medidor de espaço em disco ocupado.

### 5. Leitor de Capítulos Avançado
- **Modo Manhwa (Rolagem Vertical Contínua - Webtoon)**:
  - Rolagem infinita, fluida e contínua ideal para webtoons coreanos.
  - Ajuste de espaçamento entre páginas (0px gapless até 32px).
  - Rastreamento em tempo real da página visível por observação de interseção.
  - Avanço contínuo para o próximo capítulo sem sair do leitor.
- **Modo Mangá (Paginado)**:
  - Leitura página por página com transições instantâneas.
  - Direção de leitura: **Direita para Esquerda (RTL)** para mangás japoneses ou **Esquerda para Direita (LTR)** para quadrinhos ocidentais.
  - Modos de ajuste: Ajustar à largura, Ajustar à altura, Ajustar à tela inteira e Tamanho original.
  - Controles de Zoom (- / + / reset).
  - Navegação por teclado (`←` / `→`, `A` / `D`, `F` para tela cheia) e zonas de toque nas bordas laterais.
- **Memorização de Posição**: Salva automaticamente a última página e posição de leitura.
- **Marcação Automática como Lido**: Marca o capítulo como lido quando o usuário atinge o limite configurável (padrão: 85%).
- **Suporte Offline**: Capítulos baixados são servidos diretamente do sistema de arquivos local sem qualquer conexão externa.

### 6. Biblioteca e Organização
- Gerenciamento de status: Não iniciados, Em andamento, Concluídos, Favoritos.
- Categorias personalizadas (criar, renomear, excluir, mover obras).
- Badges de capítulos não lidos em tempo real.
- Visualização em Grade ou Lista.

### 7. Atualizações Automáticas
- Verificação programada periódica (15min, 30min, 1h, 6h, 24h).
- Botão de checagem manual na biblioteca.
- Comparação inteligente com controle de requisições para evitar rate-limiting das fontes.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js v22, TypeScript, Express, Better-SQLite3, Axios, Cheerio, Adm-Zip, WebSockets (`ws`).
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons.
- **Banco de Dados**: SQLite embarcado com modo WAL (Write-Ahead Logging) persistido em `data/omniyomi.db`.

---

## 📦 Como Executar

### 1. Iniciar o Servidor Completo (Produção integrada)
O servidor Express já está configurado para servir tanto a API quanto o frontend compilado na porta `4567`:

```bash
npm start
```
Acesse no seu navegador: **`http://localhost:4567`**

### 2. Modo Desenvolvimento
Para desenvolvimento ativo com hot-reload no backend e frontend:

```bash
# Terminal 1: Backend com monitoramento de arquivos
npm run dev:server

# Terminal 2: Frontend Vite
npm run dev:client
```

### 3. Executar a Suíte de Testes Automatizados
O projeto conta com uma suíte de testes ponta a ponta validando banco de dados, fontes reais, downloads e leitura offline:

```bash
npm test
```

---

## 📂 Estrutura de Diretórios

```
apkmanhwa/
├── client/                     # Frontend React + TypeScript
│   ├── src/
│   │   ├── components/         # Layout (Sidebar), UI (Cards, Modals, Badges)
│   │   ├── pages/              # Início, Catálogo, Detalhes, Leitor, Biblioteca, etc.
│   │   ├── lib/                # Cliente API REST e WebSockets
│   └── dist/                   # Build de produção do cliente
├── server/                     # Backend Node.js + TypeScript
│   ├── src/
│   │   ├── db/                 # Banco SQLite e modelos de dados
│   │   ├── sources/            # Implementações de fontes (MangaDex, Local, ExtensionManager)
│   │   ├── services/           # DownloadManager, LibraryManager
│   │   ├── routes/             # Rotas REST da API
│   │   ├── websocket.ts        # Servidor de eventos em tempo real
│   │   └── index.ts            # Ponto de entrada do servidor
├── data/                       # Diretório persistente do usuário
│   ├── omniyomi.db             # Banco de dados SQLite
│   ├── downloads/              # Capítulos baixados organizados por obra
│   ├── extensions/             # Extensões externas dinâmicas (.js)
│   └── local_manga/            # Pasta para mangás/manhwas offline (pastas, .cbz, .zip)
└── test/
    └── system.test.ts          # Suíte de testes automatizados ponta a ponta
```

---

## 📄 Licença
Desenvolvido como software livre sob a licença MIT.
