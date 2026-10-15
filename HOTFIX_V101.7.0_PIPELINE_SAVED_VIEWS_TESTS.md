# Hotfix V101.7.0 — Pipeline Saved Views Tests

## Problema

A V101.7.0 introduziu exibições iniciais do Pipeline baseadas em filtros (`Meus negócios`, `Em risco`, `Propostas sem retorno` e `Sem próxima ação`).

O comportamento de produção já retornava essas exibições para workspaces novos, mas os testes históricos de `pipeline-preferences.test.ts` ainda esperavam `savedViews: []`, causando 2 falhas no Vitest.

## Correção

- O teste de workspace novo agora valida `DEFAULT_PIPELINE_SAVED_VIEWS`.
- O teste de isolamento entre workspaces agora valida que um workspace novo recebe o mesmo conjunto inicial.
- Foi adicionado um contrato explícito de exclusão: se o usuário remover todas as exibições e `savedViewsInitialized=true`, a lista vazia é preservada e os starters não reaparecem.

## Escopo

Hotfix apenas de testes/contrato. Nenhuma mudança de layout, dados, filtros ou comportamento de produção.
