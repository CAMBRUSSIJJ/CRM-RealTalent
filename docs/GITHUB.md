# GitHub — RealTalent CRM

## Estrutura recomendada

Use um repositório privado, branch principal `main`, sem licença enquanto o produto permanecer proprietário.

O pacote inclui `PREPARAR-GITHUB.bat`, que inicializa o Git, cria o primeiro commit e, quando o GitHub CLI estiver autenticado, pode criar o repositório privado `realtalent-crm`.

## Conteúdo versionado

Versione código-fonte, testes, migrations, Edge Functions, documentação, `package-lock.json`, `vercel.json` e `supabase/config.toml`.

Não versione `.env`, `.env.local`, `.env.supabase-local`, segredos de funções, `.vercel`, `node_modules`, `dist` ou dados temporários do Supabase CLI.

## CI

`.github/workflows/ci.yml` executa:

- instalação reproduzível com `npm ci`;
- TypeScript;
- testes;
- build;
- auditoria de release;
- preflight operacional;
- `npm audit` para vulnerabilidades altas ou críticas.

## Publicação do Supabase

`.github/workflows/deploy-supabase.yml` é manual e usa ambientes protegidos `staging` ou `production`.

Cadastre em cada ambiente do GitHub:

- `SUPABASE_ACCESS_TOKEN`;
- `SUPABASE_DB_PASSWORD`;
- `SUPABASE_PROJECT_REF`;
- `AUTOMATION_CRON_SECRET`.

Exija aprovação manual no ambiente `production` antes de permitir o workflow.
