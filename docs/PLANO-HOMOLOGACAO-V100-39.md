# Plano de homologação — V100.39

1. Aplicar migrations em ambiente de homologação.
2. Validar RLS com duas organizações e três perfis de usuário.
3. Configurar secrets das Edge Functions.
4. Conectar uma conta de teste por provedor habilitado.
5. Confirmar que tokens não aparecem no frontend, logs ou backups.
6. Enfileirar sincronização e validar idempotência.
7. Simular falha temporária, nova tentativa e dead-letter.
8. Confirmar logs e isolamento por organização.
9. Executar `npm ci && npm run homologate` antes de produção.
