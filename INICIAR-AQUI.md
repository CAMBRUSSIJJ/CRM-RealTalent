# Iniciar — RealTalent CRM V100.42

1. Instale Node.js 22.
2. Execute `npm ci` ou, em contingência de registro, `npm run homologate:portable`.
3. Copie o ambiente adequado a partir dos arquivos `.env.*.example`.
4. Aplique as 24 migrations em staging.
5. Publique as Edge Functions de comunicações e configure os secrets no Supabase.
6. Configure Google, Microsoft e Meta apenas com URLs do ambiente correspondente.
7. Execute `npm run homologate` antes de promover a produção.

Documentação principal: `docs/PLANO-HOMOLOGACAO-V100-42.md`.
