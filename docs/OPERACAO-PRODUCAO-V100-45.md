# Operação de produção — V100.45

## Publicação

1. Configurar todos os secrets exigidos em `supabase/functions/.env.example`.
2. Aplicar as migrations em ordem, incluindo `202607280002_v100_45_integration_foundation.sql`.
3. Publicar as Edge Functions pelo script `scripts/deploy-supabase.mjs`.
4. Configurar os runners em `supabase/cron/CONFIGURAR-INTEGRATION-RUNNERS.sql`.
5. Executar `npm run audit:integrations`, `npm run homologation:static` e o preflight.

## Regras operacionais

- nenhum token é entregue ao navegador;
- estados OAuth são de uso único e expiram;
- contas pessoais só podem ser usadas pelo proprietário;
- contas compartilhadas exigem autorização explícita;
- cada worker possui allowlist de trabalhos;
- leases vencidos retornam à fila com auditoria;
- renovação e revogação de tokens ocorrem no backend;
- a central antiga não recebe novas gravações.

## Monitoramento

Acompanhar diagnósticos críticos, falhas de refresh, contas em atenção, leases recuperados, dead-letter, tentativas negadas por permissão e secrets ausentes.
