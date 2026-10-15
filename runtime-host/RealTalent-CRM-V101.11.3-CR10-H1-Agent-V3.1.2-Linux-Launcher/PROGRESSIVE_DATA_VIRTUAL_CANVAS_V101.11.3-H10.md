# H10 — Progressive Data & Virtualized Canvas

## Fluxo de dados

```text
Login / workspace
      ↓
Core slices: commercial + stages
      ↓
App Shell disponível
      ↓
Rota selecionada
      ↓
snapshotSlicesForRoute(route)
      ↓
carrega somente slices ausentes
      ↓
merge no snapshot compatível
```

A estratégia reduz a materialização simultânea de calls, activities, events, goals, proposals, revenue, playbooks e automations. O modelo `WorkspaceSnapshot` continua compatível com o restante do CRM enquanto a migração para queries por superfície avança.

## Drag

```text
pointermove
  ↓
DOM translate3d
  ↓
nenhum setGraph
  ↓
pointerup
  ↓
1 commit no conversationGraph
```

## Virtualização

```text
conversationGraph completo
        ↓
viewport + overscan
        ↓
visibleNodes / visibleGroups
        ↓
visibleEdges
        ↓
DOM reduzido
```

O grafo completo permanece em memória como dado do Playbook; virtualização reduz DOM/layout/paint. Essa separação é essencial para mapas grandes.
