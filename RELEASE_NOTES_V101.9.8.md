# RealTalent CRM V101.9.8 — Design System Consolidation

## Escopo

Consolidação visual da linha V101.9.x sem alterar os fluxos comerciais principais. **Meu Dia** e **Contatos** permanecem como referência de densidade, hierarquia, espaçamento e linguagem de interação.

## Entregue

- catálogo canônico de tokens em `src/platform/design-system/tokens.ts`;
- registry/inspector do Design System;
- camada CSS canônica carregada por último em `design-system-consolidation-v10198.css`;
- bridge dos tokens históricos (`--navy`, `--blue`, `--surface`, `--border`, etc.) para a fonte canônica;
- primitives `Button`, `IconButton`, `Input`, `Select`, `Textarea`, `Tabs`, `Drawer`, `Modal/Dialog`, `DataGrid`, `Surface` e `EmptyState`;
- `Button`, `Modal` e `EmptyState` existentes migrados sem quebra de API;
- busca global migrada para `Input` canônico;
- Data Grid principal de Contatos migrado para `DataGrid` canônico;
- densidade compact/comfortable continua suportada;
- dark theme continua mapeado pela mesma camada de tokens;
- nenhuma migration SQL nova;
- a antiga `design-system-v101.css` sai da pilha runtime, pois seus tokens/controles foram absorvidos pela camada canônica; o arquivo permanece como referência histórica;
- demais CSS históricos permanecem presentes como fallback durante a migração progressiva.

## Estratégia

A V101.9.8 não tenta remover dezenas de folhas de estilo antigas em um único release. O Design System canônico é carregado por último e governa as primitives e classes históricas equivalentes. A remoção física de CSS antigo deve ocorrer somente após cada módulo migrar para primitives e passar QA visual/runtime.

## Inspector

```js
window.__REALTALENT_DESIGN_SYSTEM__.inspect()
window.__REALTALENT_DESIGN_SYSTEM__.primitives()
```

## Migrations

Permanecem 48 migrations. Nenhuma migration foi criada nesta release.
