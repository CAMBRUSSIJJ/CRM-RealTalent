# RealTalent CRM V101.10.8 — Runtime & Developer Experience Consolidation

Base: **V101.10.7-H1 — Lockfile Recovery**.

## Objetivo

Reorganizar a inicialização e a experiência de desenvolvimento sem alterar UX, schema, modelo comercial, CSS funcional ou contratos de dados do CRM.

## Alterações

- `scripts/start.mjs` passa a ser o orquestrador multiplataforma do runtime.
- `start-linux.sh` vira wrapper fino; o launcher anterior fica preservado em `start-linux-legacy.sh`.
- adicionados `start-macos.sh` e `start-windows.cmd`.
- comandos padronizados: `npm run start`, `npm run start:dev`, `npm run verify`, `npm run rebuild`, `npm run doctor` e `npm run health`.
- validação de lockfile acontece antes de `npm ci`; inconsistência conhecida entra no fluxo de recuperação da H1.
- estado local de Communications/WhatsApp e Prospecting Agent é migrado de releases vizinhas quando a nova pasta ainda está limpa.
- token de runtime continua fora do bundle e é compartilhado apenas com serviços locais.
- Runtime Control local em `127.0.0.1:3003`, com `/health`, `/readiness` e `/status`; `/status` exige o token de runtime.
- cleanup de processos filhos em SIGINT/SIGTERM.
- abertura de navegador adaptada para Linux, macOS e Windows.
- documentação passa a ter estrutura `docs/releases`, `docs/qa`, `docs/security` e `docs/architecture`, sem mover os documentos históricos ainda exigidos por gates de regressão.

## Deliberadamente não alterado

- nenhuma migration V101.10.8;
- nenhuma troca de `localStorage` por IndexedDB;
- nenhuma consolidação CSS;
- nenhum redesign de Pipeline, Contatos, Meu Dia, Comunicações ou Calling;
- nenhuma remoção de Edge Functions;
- nenhum ajuste de schema Supabase.

## Compatibilidade

No Linux:

```bash
./start-linux.sh
./start-linux.sh --verify
./start-linux.sh --rebuild
./start-linux.sh --legacy
```

Cross-platform:

```bash
npm run start
npm run start:dev
npm run verify
npm run rebuild
npm run doctor
npm run health
```

## Validação final desta entrega

- `start-linux.sh` reduzido a 13 linhas executáveis/estruturais; contratos históricos consultam `start-linux-legacy.sh` explicitamente.
- `qa:architecture`: aprovado após a refatoração final do wrapper.
- `check:legacy`: aprovado em dois segmentos (até V101.6.8 e V101.6.9 → V101.9.8) para respeitar o limite de execução do ambiente.
- gates atuais: V101.10.6 `40/40`, V101.10.6-H2 `27/27`, V101.10.7 `22/22`, V101.10.7-H1 `9/9`, V101.10.8 `25/25`.
- o ambiente de empacotamento não possui acesso DNS ao `registry.npmjs.org`; por isso a árvore real de dependências, `npm audit`, Vitest completo e build Vite final não foram executados aqui.
- o `package-lock.json` herdado continua deliberadamente detectado como inconsistente até a primeira execução com registry disponível; o fluxo H1 repara uma vez com `npm install`, revalida o lock e retorna a `npm ci` nas execuções estáveis.
