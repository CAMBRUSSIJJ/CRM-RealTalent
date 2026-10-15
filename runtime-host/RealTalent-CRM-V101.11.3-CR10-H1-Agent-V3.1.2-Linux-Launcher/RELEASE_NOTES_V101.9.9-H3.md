# V101.9.9-H3 — UX Recovery & Operational Fixes

Hotfix de estabilização operacional sobre V101.9.9-H2. Esta release corrige regressões visuais/operacionais observadas no uso real sem iniciar ainda um novo ciclo V102.

## A. Global Shell Recovery

- Topbar passa a usar `#04342C` como superfície de alto contraste;
- texto, ícones, busca e utilidades recebem contraste explícito;
- Sidebar permanece clara, com ativo em `#E8F6F0` + `#1D9E75`;
- bridge visual mantém compatibilidade com classes antigas;
- regras desktop protegem superfícies críticas contra `display:none` acidental.

## B. Feature Recovery Matrix

`qa/feature-recovery-matrix.json` cataloga 15 áreas críticas e aponta evidências de código para impedir que uma consolidação visual esconda capacidades silenciosamente.

Cobertura: shell, Meu Dia, Contatos, Pipeline, Comunicação, Propostas, Agenda, Garimpo, Ligações, Follow-ups, Playbooks, Território, Automações, Métricas e Configurações.

## C. Proposal Wizard Recovery

Corrigido o caso em que `initialLeadId=""` bloqueava o fallback para a primeira oportunidade/contato apesar do select parecer preenchido.

A etapa 1 agora valida explicitamente:
- oportunidade/contato existente;
- título não vazio;
- categoria de forecast válida;
- probabilidade entre 0 e 100.

Quando a etapa está inválida, o wizard mostra o motivo em vez de deixar apenas o botão `Continuar` desabilitado. Ao salvar, `OpportunityRecord` canônica é priorizada para resolver `opportunityId`.

Novos testes: `src/services/proposal-pipeline-h3.test.ts`.

## D. Prospecting Browser Gateway

O antigo conceito “Extensão Chrome” passa a ser `RT Capture Browser` e ganha caminhos complementares:
- provider/API direto quando configurado;
- RT Capture Browser/companion;
- captura universal por URL/clipboard;
- Capturador Universal via bookmarklet;
- retorno seguro para `#/prospecting?action=browser-capture&capture=...`.

O bookmarklet envia somente URL, título e texto selecionado ao próprio CRM via fragmento/hash. Ele não implementa scraping automático nem exige credenciais de terceiros.

O clipboard passa pela camada central `src/lib/browser-actions.ts`, preservando secure-context + fallback e os contratos antigos de UI Reliability.

Novos testes: `src/services/prospecting-browser-capture-h3.test.ts`.

## Banco

Nenhuma migration H3 nova. A migration 49 da H2 permanece intacta e verificada.

## QA executado nesta montagem

- H3: 21/21;
- H2: 13/13;
- H1: 6/6;
- V101.9.9 base: 19/19;
- Release Manifest: 25/25;
- Capability Matrix: 15 capacidades / 32 evidências / 25 executáveis;
- Repository parity: Local 96/96 + Supabase 96/96;
- Browser E2E Contract: 7/7;
- sintaxe: 378 arquivos;
- integração: 349 arquivos;
- migrations: 49/49;
- `check:legacy`: PASS — 3.939 OK / 0 FAIL observados;
- `bash -n start-linux.sh`: OK.

O ambiente de montagem não possui `node_modules`; portanto typecheck global, Vitest completo e build não são declarados como executados aqui. O `start-linux.sh` mantém esses gates no Linux após instalar as dependências.
