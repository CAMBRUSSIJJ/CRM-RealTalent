# RealTalent CRM V101.5.3 — Performance & Repository Parity

Release de hardening focada em custo de atualização, histórico pesado e equivalência entre os modos Local e Supabase.

## Mudanças principais

- `refreshData()` integral ficou reservado para operações destrutivas/importações e atualização manual; operações comuns usam refresh por domínio.
- novo `snapshot-refresh.ts` carrega slices em paralelo e aplica um único patch no snapshot.
- histórico inicial de ligações limitado a 500 registros em Local e Supabase, com paginação de blocos antigos de 200.
- gravações deixaram de ser hidratadas durante a listagem; URL/Blob é resolvido somente quando o usuário solicita o áudio.
- `automationRuns` local agora segue o mesmo teto operacional de 300 registros do Supabase.
- exportação continua completa: o limite operacional do snapshot não trunca backups.
- testes adicionados para refresh seletivo e paginação/paridade local.

## Compatibilidade

Nenhuma migration nova. `BACKUP_SCHEMA_VERSION` permanece 100.54. Calling, Lead Workspace 3.2, Account 360 e RealTalent Connect permanecem compatíveis.
- A leitura/paginação de chamadas Supabase foi extraída para `src/repositories/supabase-call-history.ts`, mantendo o repositório principal abaixo do teto arquitetural histórico de 80 KiB.

