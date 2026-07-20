# Guia de produção — RealTalent CRM V100.27

A publicação deve passar por GitHub privado, Supabase staging, testes e somente então produção.

## Comandos principais

```bash
npm ci
npm run check
npm run supabase:deploy -- --project-ref SEU_PROJECT_REF
```

## Variáveis do frontend

Use apenas URL e chave publicável do Supabase nas variáveis `VITE_*`. Chaves secretas ficam exclusivamente no Supabase ou nos secrets protegidos do GitHub.

## Automação hospedada

Defina `AUTOMATION_CRON_SECRET`, publique `automation-runner` e execute o modelo em `supabase/cron/CONFIGURAR-AUTOMATION-RUNNER.sql`.

## Vercel

O `vercel.json` já contém fallback da aplicação, cache de assets e cabeçalhos de segurança. O endpoint `/health.json` não usa cache.

## Liberação

Só libere a produção após executar o teste de isolamento entre duas organizações, perfis de permissão, recuperação de senha, backups, extensão e motor de automações em simulação.
