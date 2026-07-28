# Fonte oficial — RealTalent CRM V100.41

A única fonte oficial é `src/` em React + TypeScript, com Vite, migrations e Edge Functions versionadas em `supabase/`.

## Regras

- Não editar `dist/` ou HTML standalone manualmente.
- Todo artefato deve ser gerado por `npm run homologate`.
- Toda migration nova precisa entrar em `supabase/migrations.lock.json`.
- Staging é obrigatório antes de produção.
- A promoção para produção exige backup, health check e environment protegido no GitHub.
