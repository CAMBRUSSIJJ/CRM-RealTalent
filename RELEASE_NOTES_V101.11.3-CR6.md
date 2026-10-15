# RealTalent CRM V101.11.3-CR6 — Performance Optimization & Payload Reduction

## Objetivo
Reduzir custo de boot e impedir regressão de payload nas superfícies comerciais críticas.

## Mudanças
- CSS de Garimpo, Contatos e Propostas removido do `main.tsx` e carregado junto ao chunk de cada rota.
- Prefetch ocioso e deduplicado para rotas comerciais prováveis.
- Carregamento progressivo de slices do workspace preservado.
- Budgets de fonte para Garimpo, Propostas, Contatos e App Context.
- Budgets de `dist`: JS individual <= 400 KB, CSS individual <= 300 KB e payload inicial referenciado <= 900 KB quando houver build real.
- CR5 Observability preservada para comparar P95, long tasks e recursos grandes.

## Limitação
Os budgets de bundle só podem ser comprovados depois de `vite build`. Sem instalação completa das dependências, o gate de `dist` deve permanecer BLOCKED, não PASS.
