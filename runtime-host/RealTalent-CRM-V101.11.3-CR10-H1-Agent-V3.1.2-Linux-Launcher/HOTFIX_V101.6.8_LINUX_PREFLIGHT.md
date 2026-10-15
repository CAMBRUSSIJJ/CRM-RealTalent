# V101.6.8 — Linux Preflight Hotfix 1

## Problema corrigido

O launcher Linux interrompia a execução em `1/4 — Preflight Linux` com:

`V100.95: seletor de página sem alvo TSX: .advanced-filters--pipeline`

A V101.6.8 substituiu o antigo bloco de filtros avançados do Pipeline por um drawer, chips de filtros ativos e a faixa de visões salvas, mas o registro de personalização de páginas ainda apontava para a classe histórica `.advanced-filters--pipeline`.

## Correção

O registro da seção `pipeline.filters` em `src/features/experience/experience-registry.ts` agora aponta para os alvos reais da V101.6.8:

- `.pipeline-filter-drawer-v10168`
- `.pipeline-filter-chips-v10168`
- `.pipeline-saved-strip`

Não houve remoção de funcionalidade nem alteração de dados. A correção apenas alinha o contrato de personalização/preflight com a estrutura atual do Pipeline.

## Validação

- `node scripts/linux-release-preflight.mjs`: OK
- Auditorias V101.5.1 a V101.6.8: OK
- V101.6.8 Workspace Interaction Architecture: 36/36 contratos aprovados

Observação: a tentativa de executar typecheck/test/build no ambiente de empacotamento ficou sem uma instalação npm completa, pois `npm ci` foi interrompido pelo limite do ambiente. No Linux do usuário, o launcher instala as dependências antes dos gates.
