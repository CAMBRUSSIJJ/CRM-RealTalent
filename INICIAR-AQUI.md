# Iniciar — RealTalent CRM V100.45

1. Instale Node.js 22.
2. Configure o frontend com `.env.production.example`.
3. Configure todos os secrets descritos em `supabase/functions/.env.example`.
4. Execute `node scripts/deploy-supabase.mjs --project-ref SEU_PROJECT_REF`.
5. Aplique `supabase/cron/CONFIGURAR-INTEGRATION-RUNNERS.sql`.
6. Abra Configurações → Integrações e execute **Executar diagnóstico**.
7. Conecte uma conta e use **Testar conexão** antes de ativar sincronizações.
8. Execute `npm run homologate:portable` antes da promoção.

Documentação principal: `docs/FUNDACAO-INTEGRACOES-V100-45.md`.
