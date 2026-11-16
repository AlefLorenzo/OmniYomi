# OmniYomi Desktop

Aplicativo desktop para Windows que gerencia o ciclo de vida do backend local e abre a interface web do OmniYomi em uma janela própria.

## Desenvolvimento

Requisitos para desenvolver/compilar: Windows 10/11 x64, Node.js 24, npm e suporte de compilação dos módulos nativos.

Na raiz do repositório:

\`\`\`powershell
npm install
npm --prefix client install
npm run desktop:dev
\`\`\`

O script compila o servidor e o cliente e abre o painel desktop.

## Gerar instalador e versão portátil

\`\`\`powershell
npm install
npm --prefix client install
npm run desktop:smoke
npm run desktop:dist
\`\`\`

Os artefatos são gerados em \`release/\`: instalador NSIS e executável portátil x64.

## Dados persistentes

O aplicativo utiliza \`%LOCALAPPDATA%\\OmniYomi\\\`:
- \`data\\omniyomi.db\`: banco SQLite.
- \`data\\downloads\\\`: capítulos baixados.
- \`data\\extensions\\\`: dados de extensões.
- \`logs\\\`: registros do inicializador.

A pasta de dados fica fora do diretório de instalação e não é removida ao desinstalar ou atualizar.

Na primeira execução em modo de desenvolvimento, se houver \`data\\omniyomi.db\` antigo no repositório e ainda não existir um banco no novo local, o inicializador valida o banco com \`integrity_check\`, usa a API de backup do SQLite e copia diretórios auxiliares sem excluir a origem.

## Ciclo de vida

- O inicializador inicia o backend compilado como processo filho gerenciado.
- O backend só é marcado como online após uma resposta válida de \`/api/health\`.
- O servidor desktop escuta apenas em \`127.0.0.1\`.
- O botão Parar envia SIGTERM e aguarda o encerramento ordenado de downloads, WebSockets, timers, Suwayomi e SQLite.
- Ao fechar o inicializador, o mesmo encerramento é solicitado.
- Uma instância OmniYomi já existente na porta padrão pode ser reutilizada, mas nunca é encerrada pelo inicializador.
- Processos externos que ocupem portas não são terminados.

## Runtime Suwayomi opcional

O caminho absoluto específico de uma máquina foi removido. Para fornecer um runtime local, defina \`SUWAYOMI_HOME\` ou \`OMNIYOMI_SUWAYOMI_HOME\` apontando para a pasta contendo \`bin\\Suwayomi-Server.jar\` e \`jre\\bin\\java.exe\`. O backend continua disponível quando o runtime opcional não está instalado.

## Limitações

O smoke test automatizado valida o processo desktop, a inicialização HTTP e o encerramento do backend em runner Windows. Ele não substitui testes de leitura, instalação de extensões reais, downloads de fontes externas ou assinatura Authenticode do instalador.
