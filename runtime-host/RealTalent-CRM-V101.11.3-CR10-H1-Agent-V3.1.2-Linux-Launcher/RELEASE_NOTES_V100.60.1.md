# RealTalent CRM V100.60.1 — Performance & Architecture

Esta versão mantém integralmente a Sales Experience Suite da V100.60.0 e reduz acoplamento, peso de rota e renderizações desnecessárias sem alterar o schema de dados.

## Performance de interface

- Divide o antigo `AppContext` em assinaturas de navegação, workspace/dados, UI e ações.
- Mantém `useApp()` para compatibilidade, mas migra as telas principais para hooks específicos.
- Usa uma facade estável para ações, evitando que toast ou navegação recriem callbacks em toda a árvore.
- O Call Workspace passa a ser carregado por `React.lazy` somente quando uma sessão de ligação é aberta.
- CSS de Ligações, Account Intelligence, Lead Experience e Proposal Experience deixa o bootstrap global e acompanha a feature correspondente.

## Arquitetura

- Extrai tipos de `app-context.tsx` para `app-context-types.ts`.
- Extrai o executor de automações para `services/automation-event-executor.ts`.
- Extrai restauração de backup para `services/workspace-backup-restore.ts` com rollback compensatório preservado.
- Divide o repositório local em `local-crm-repository.ts` + `local-repository-core.ts`.
- Divide o repositório Supabase em repositório + `supabase-repository-mappers.ts`.

## CSS

- O antigo `styles/index.css` de aproximadamente 478 KB foi decomposto em 13 módulos sequenciais.
- A ordem original da cascata foi preservada deliberadamente para evitar regressões visuais.
- Foram removidas duplicatas exatas conhecidas da sidebar.
- O antigo `sales-experience-v10060.css` tornou-se apenas um stub de compatibilidade; Leads e Propostas possuem CSS próprios.

## Compatibilidade

- Sem nova dependência de runtime.
- Sem alteração de migrations: permanecem 35.
- `BACKUP_SCHEMA_VERSION` permanece em `100.54`.
- Mantém as correções de Full QA & Data Consistency da V100.56.4 e todas as features da V100.60.0.
