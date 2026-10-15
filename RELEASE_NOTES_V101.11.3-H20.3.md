# RealTalent CRM V101.11.3-H20.3 — Global UI & Product Cohesion

Base funcional preservada: **V101.11.3-H19.13 — WhatsApp Work Management**.

Esta release inicia a macrofase H20 para transformar o Design System em infraestrutura real do CRM, reduzir regressões de cascade e colocar as principais áreas operacionais sob um mesmo shell visual.

## H20.1 — Design System Truth

- Azul passa a ser a cor canônica de interação da RealTalent.
- Verde deixa de competir com a marca e passa a representar sucesso/estado positivo.
- Tokens de brand, success, canvas, surface, texto, borda, controles, tipografia e radius são reassertados em uma camada final única.
- Aliases históricos como `--blue`, `--accent` e `--primary` passam a apontar para a mesma verdade de marca.
- A camada H20 não introduz tipografia operacional abaixo de 10 px.

## H20.2 — CSS Cascade Recovery

- Adicionado `src/styles/h20-product-cohesion.css` como última folha global do runtime.
- Adicionado `ui-cohesion-runtime.ts`, que mantém os tokens canônicos e a pequena camada crítica de primitives no final do `<head>` quando um módulo lazy injeta CSS posteriormente.
- CSS específico de módulos continua lazy; a solução não transforma todo o bundle de estilos em carregamento global.
- CSS Governance passa a reconhecer o orçamento global H20 sem liberar crescimento irrestrito.
- O objetivo é impedir que abrir Propostas, Ligações ou outra feature reintroduza visual antigo por ordem de importação.

## H20.3 — Global Workspace Shell

Criados primitives canônicos de workspace:

- `WorkspacePageHeader`
- `WorkspaceSummaryStrip`
- `WorkspaceSummaryMetric`
- `WorkspaceViewStrip`
- `WorkspaceCommandBar`
- `WorkspaceCommandGroup`

### Tarefas

- Migra para o Page Header canônico.
- KPIs passam para Summary Strip canônico.
- Lista/Quadro/Hoje/Atrasadas/Concluídas usam View Strip unificado.
- Filtros usam Command Bar sem alterar o modelo funcional de tarefas.

### Equipes

- Migra para o Page Header canônico.
- Visão geral/Metas/Pessoas/Performance usam View Strip unificado.
- Dados e comportamento do Team 360 permanecem preservados.

### Follow-ups

- Corrigida a regressão visual identificada na auditoria.
- Volta a ter resumo compacto e navegação canônica.
- Fila/Quadro/Calendário/Cadências/Desempenho usam View Strip H20.
- Drawer avançado, views salvas, contexto e ações continuam preservados.

## WhatsApp / H19.13

A linha funcional H19.13 permanece intacta:

- Pure Chat preservado.
- Etiquetas, status, responsável, tarefas e follow-ups continuam na camada operacional externa ao corpo da conversa.
- Normalização, mídia, voz, contatos, grupos, idempotência e lineage recovery continuam preservados.

A URL mantém o marcador funcional H19.13 e adiciona um marcador específico da coesão H20.3.

## Escopo intencional

H20.3 é a **fundação + primeira migração real**, não a formatação final de cada tela do CRM. Propostas, Garimpo, Configurações, Ligações e outros módulos ainda possuem layouts internos legados que devem migrar progressivamente em H20.4+; entretanto, já passam a herdar a verdade semântica de cor/tokens e a proteção de cascade.

## Dados e migrations

- Nenhuma migration nova.
- Baseline continua com 54 migrations.
- A release não altera schema comercial nem entidades H19.13.

## Validação

- `qa:architecture`: PASS.
- H20.3: 26/26 PASS.
- V101.6.7 Workspace Consistency: 31/31 PASS.
- V101.6.8 Interaction Architecture: 36/36 PASS.
- CSS Governance: 65/65 PASS.
- H19.12: 19/19 PASS.
- H19.13: 27/27 PASS.
- Transpile independente: 302 módulos PASS.

Os gates oficiais dependentes de `node_modules` **não são classificados como PASS** neste ambiente. `npm ci` não concluiu; typecheck ficou sem React/Supabase types, `vitest` não está instalado e `vite` não está instalado. O `validate:env` passou. O `dist` produzido pelo fallback independente foi recusado pelo bundle audit por HTML legado e removido do pacote.
