# RealTalent CRM V101.11.3-H20.6 — Core Sales Workspace Cohesion

Base: **V101.11.3-H20.5 — Settings & Calling Cohesion**.

## Objetivo

Concluir a migração das três superfícies centrais de operação comercial — **Pipeline, Contatos e Agenda** — para a arquitetura visual H20, eliminando headers, KPIs e toolbars paralelos sem alterar as regras comerciais existentes.

## Pipeline

O Pipeline passa a usar o shell canônico:

```text
Page Header
Summary Strip
Command Bar
Saved Views / View Switcher
Workspace
```

Foram preservados:

- Kanban, Lista, Forecast, Agenda e Funil;
- visualizações salvas;
- filtros avançados, ordenação e exibição;
- Intelligence e Action Center;
- criação e edição de oportunidades;
- Forecast RealTalent e indicador de meta.

O progresso de meta/forecast agora é capacidade nativa do `WorkspaceSummaryMetric`, em vez de depender de um KPI exclusivo do Pipeline.

## Contatos

Contatos passa a usar:

- `WorkspacePageHeader`;
- `WorkspaceSummaryStrip`;
- `WorkspaceCommandBar`;
- grupos canônicos de comandos.

Continuam preservados:

- visualizações salvas;
- drag/reorder de views;
- configurações avançadas da visualização;
- DataGrid;
- cards e board;
- seleção em massa;
- importação e exportação;
- filtros e ordenação.

A ação **Novo contato** passa a ocupar a posição principal no header.

## Agenda

A Agenda teve a maior simplificação de navegação da H20.6.

Antes havia sobreposição entre quick views, KPIs, seletor de visualização e toolbar. Agora existe:

```text
Page Header
Summary Strip acionável
Ano | Mês | Semana | Dia
Command Bar
Calendário
```

A Command Bar concentra:

- Hoje;
- navegação anterior/próxima;
- período atual;
- busca;
- filtros;
- lembretes;
- integrações.

Ano, Mês, Semana e Dia continuam preservados, assim como edição de compromisso, inspector, chips e integrações.

## Personalização de páginas

O registry de experiência foi atualizado para não tentar manipular elementos removidos pelas migrações H20.

Agora utiliza:

```text
.contacts-summary-strip-h20
.pipeline-summary-strip-h20
.agenda-summary-strip-h20
```

Isso evita que **Personalizar página** tente ocultar ou reordenar blocos que não existem mais.

## Design System

`WorkspaceSummaryMetric` agora suporta oficialmente:

- estado ativo;
- progresso de 0–100;
- label de progresso.

Essa capacidade foi criada para substituir implementações locais de KPIs clicáveis e barras de progresso.

## QA

```text
qa:architecture                         PASS
H20.6                              39/39 PASS
H20.5                              28/28 PASS
H20.4                              27/27 PASS
H20.3                              26/26 PASS

Source Syntax                418 arquivos PASS
Integration Contracts       386 arquivos PASS
Migrations                         54/54 PASS
Release Manifest                   96/96 PASS
CSS Governance                     65/65 PASS
Linux preflight               379 TS/TSX PASS

Capability Matrix
42 capacidades
154 evidências
102 executáveis

Repository Local                  100/100
Repository Supabase               100/100
Browser E2E Contract             11 fluxos
```

O build registry-independent percorreu **303 módulos**.

`npm ci` não concluiu neste ambiente e não criou `node_modules`; por isso **typecheck, Vitest e Vite build oficiais permanecem BLOCKED e não são classificados como PASS**. O `dist` produzido pelo fallback foi rejeitado pelo auditor por `HTML legado reapareceu` e removido do artefato.

## Runtime marker

O launcher abre com:

```text
rt_cohesion=101.11.3-h20-6-core-sales-workspace-cohesion
```

A linhagem funcional do WhatsApp permanece:

```text
rt_ui=101.11.3-h19-13-whatsapp-work-management
```

## Próxima etapa recomendada

Após Pipeline, Contatos e Agenda, a próxima fase deve ser a **passagem transversal final**: sidebar/header global, modais, drawers, tabelas, checkboxes/radios, estados vazios, loaders, toasts, densidade e responsividade.
