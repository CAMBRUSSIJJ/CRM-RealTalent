# RealTalent CRM V101.9.9-H2 — Duplicate Merge Canonical Value Hotfix

## Motivo

No Linux, a suíte Vitest da V101.9.9-H1 encontrou uma regressão em `LocalCrmRepository.mergeLeads()`:

- esperado: `9000`
- recebido: `7488.6`

O `mergeLeadRecords()` preservava corretamente o maior valor, mas `synchronizeStructureInDatabase()` reconciliava o Lead com a `OpportunityRecord` canônica antiga. Depois, a proposta oficial elevava o valor apenas para `7488.6`, já com o `9000` perdido.

## Correção local

A fusão agora calcula um `consolidatedOpportunityValue` usando Lead principal, Lead duplicado e oportunidades relacionadas. Esse valor é promovido para a oportunidade sobrevivente **antes** da reconciliação canônica.

Se o Lead principal ainda não possuir oportunidade própria, a oportunidade do duplicado pode ser retargetada para o Lead principal antes da sincronização.

A proposta oficial continua podendo elevar o valor, mas nunca reduzir o maior valor comercial preservado pelo merge.

## Correção Supabase

Foi adicionada a migration:

`202610030001_v101_9_9_h2_duplicate_merge_canonical_value.sql`

Ela redefine `merge_duplicate_leads()` para preservar um piso comercial `v_consolidated_value` antes e depois de `reassign_official_sales_proposal_v10044()`.

## Regressão adicionada

O teste de merge agora exige simultaneamente:

- `Lead.value === 9000`
- `Opportunity.value === 9000`

## Compatibilidade

- H1 Realtime Type Hotfix preservado.
- 49 migrations verificadas por checksum.
- Nenhuma alteração visual.
- Nenhuma alteração no schema de backup.
