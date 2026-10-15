# V101.6.9 Hotfix 1 — Metrics ref TypeScript

## Problema
O gate `typecheck` falhava em `src/features/metrics/metrics-page.tsx` na barra de exibições:

```text
<div ref={visualizationAnchorRef}>
```

A referência havia sido declarada como `useRef<HTMLElement | null>(null)`, mas o elemento alvo é especificamente um `HTMLDivElement`. Com React 19 / TypeScript 6, `RefObject<HTMLElement>` não é atribuível ao `ref` tipado de um `<div>`.

## Correção
A referência foi especializada para o tipo real do nó:

```ts
const visualizationAnchorRef = useRef<HTMLDivElement | null>(null)
```

Não há alteração de comportamento, dados, filtros, views ou layout. O hotfix corrige somente a tipagem estática do anchor de visualização em Métricas.
