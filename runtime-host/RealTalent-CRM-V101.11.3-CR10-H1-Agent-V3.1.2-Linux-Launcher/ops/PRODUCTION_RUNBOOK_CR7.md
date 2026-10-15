# RealTalent CRM — CR7 Production Runbook

## Objetivo
Este runbook separa liveness (frontend publicado) de readiness (frontend + Supabase/Auth utilizáveis).

## Pré-deploy obrigatório
1. `VITE_APP_ENV=production` e `VITE_DATA_MODE=supabase`.
2. `VITE_PUBLIC_APP_URL` usando HTTPS e domínio canônico.
3. `VITE_SUPABASE_URL` HTTPS e somente chave publicável no frontend.
4. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
5. `npm run migrations:verify`, `npm run qa:commercial-readiness:cr7`.
6. Criar snapshot: `npm run release:snapshot`.
7. Backup do banco antes de migration destrutiva/alteração crítica: `npm run backup:production`.

## Pós-deploy
Execute com variáveis CR7 configuradas:
`npm run runtime:commercial-readiness:cr7`

O probe valida HTTPS, `/health.json`, headers de segurança e Supabase Auth endpoint.

## Rollback
1. Interromper novas mudanças.
2. Identificar o último deployment aprovado e o `release-snapshot-*.json` correspondente.
3. Reverter o deployment pelo provedor de hospedagem para esse artefato imutável.
4. Não restaurar banco automaticamente. Banco só deve ser restaurado se a mudança de schema/dados exigir e houver decisão explícita.
5. Se restore for indispensável, confirme checksum e use `CR7_ALLOW_RESTORE=YES_I_UNDERSTAND` com `npm run restore:production -- <dump>`.
6. Rodar `migrations:verify`, CR2/CR3 probe e CR7 production probe após rollback.

## Incidente
- Frontend abre, Supabase falha: readiness = FAIL, liveness pode continuar OK.
- Auth indisponível: bloquear novos logins e investigar Supabase antes de promover nova release.
- Comunicação/WhatsApp degradada: tratar como serviço degradado; CRM core não deve ser declarado totalmente indisponível se os módulos principais estiverem íntegros.
- Nunca expor service_role, DB URL ou dumps no navegador/log público.
