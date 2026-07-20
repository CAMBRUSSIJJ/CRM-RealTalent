# RealTalent CRM V100.27 — Inicialização, Deploy e Operação

CRM comercial em React, TypeScript, Vite e Supabase. Esta versão transforma a base V100.26 em um pacote reproduzível para GitHub, desenvolvimento local, staging e produção.

## O que foi preparado

- inicialização local por duplo clique no Windows;
- Supabase CLI fixado no projeto;
- `supabase/config.toml` e `seed.sql` versionados;
- migrations e Edge Functions prontas para staging e produção;
- compatibilidade com chaves secretas novas e legadas do Supabase nas funções de servidor;
- validação de variáveis para impedir deploy hospedado em modo local;
- workflow de CI para TypeScript, testes, build, auditoria e preflight;
- workflow manual e protegido para publicar migrations e Edge Functions;
- scripts de GitHub, Supabase e validação;
- arquivo `/health.json` para verificar a publicação;
- modelo de agendamento do motor de automações com pg_cron, pg_net e Vault;
- modo standalone preservado para demonstração.

## Começar

Leia `INICIAR-AQUI.md`.

### Demonstração local

```bash
npm ci
npm run start:demo
```

### Supabase local

Requer Docker Desktop ativo:

```bash
npm ci
npm run start:stack
```

### Validação completa

```bash
npm run check
```

### Produção

1. publique o código em um repositório GitHub privado;
2. crie primeiro um projeto Supabase de staging;
3. aplique migrations e funções com `npm run supabase:deploy -- --project-ref SEU_PROJECT_REF`;
4. configure o cron conforme `supabase/cron/CONFIGURAR-AUTOMATION-RUNNER.sql`;
5. importe o repositório na Vercel;
6. cadastre `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`;
7. configure Site URL e Redirect URLs no Supabase Auth;
8. faça o primeiro cadastro e crie o workspace.

Nunca coloque `service_role`, `sb_secret_` ou outra chave administrativa no frontend, GitHub, extensão ou Vercel como variável `VITE_*`.

## Relatórios desta versão

- `CHANGELOG-V100-27.md`;
- `RELATORIO-TESTES-V100-27.md`;
- `RELATORIO-PRONTIDAO-REALTALENT-CRM-V100-27.md`;
- `TESTE-SMOKE-V100-27.json`;
- `PRE-FLIGHT-V100-27.json`.
