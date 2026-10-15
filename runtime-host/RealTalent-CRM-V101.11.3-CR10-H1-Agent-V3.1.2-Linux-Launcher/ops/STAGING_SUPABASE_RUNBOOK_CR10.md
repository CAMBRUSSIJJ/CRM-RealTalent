# CR10 — Supabase Staging Bootstrap & Validation

Objetivo: transformar as 58 migrations e os probes CR2/CR3 em uma homologação Supabase reproduzível, sem confundir preparação local com prova remota.

## Pré-requisitos

Use um projeto Supabase **exclusivo de staging**. Não aponte este fluxo para produção. O Supabase CLI atual suporta `link --project-ref`, `migration list`, `db push --dry-run`, `db push`, `db lint` e deploy de Edge Functions.

Segredos ficam apenas no ambiente do terminal. `CR10_SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente pelo bootstrap administrativo e jamais pode entrar em `VITE_*`, frontend, logs ou artefatos.

## Atalho Linux

```bash
chmod +x staging-linux.sh
./staging-linux.sh
```

Na primeira execução ele cria `.env.cr10` com permissão `600` e para. Preencha o arquivo e execute novamente.

## 1. Preparar variáveis

```bash
cp .env.cr10.example .env.cr10
chmod 600 .env.cr10
# edite .env.cr10
set -a
source .env.cr10
set +a
```

## 2. Auditar sem tocar no remoto

```bash
npm run qa:commercial-readiness:cr10
npm run staging:cr10:preflight
```

## 3. Conferir migrations no remoto (dry-run)

```bash
npm run staging:cr10:migrations
```

O script sempre executa `migration list` e `db push --dry-run`. Ele **não aplica** mudanças enquanto `CR10_APPLY_MIGRATIONS` não for exatamente `YES_APPLY_STAGING`.

## 4. Aplicar as 58 migrations em staging

```bash
export CR10_APPLY_MIGRATIONS=YES_APPLY_STAGING
npm run staging:cr10:migrations
```

Depois do push, o script repete `migration list` e roda `db lint --linked --fail-on error`. Não use `migration repair` automaticamente; divergência de histórico é um hard stop que deve ser investigado antes de alterar a tabela `supabase_migrations.schema_migrations`.

## 5. Configuração e Edge Functions (opcional, staging)

```bash
export CR10_PUSH_CONFIG=YES_PUSH_STAGING_CONFIG
export CR10_DEPLOY_FUNCTIONS=YES_DEPLOY_STAGING_FUNCTIONS
npm run staging:cr10:migrations
```

`config push` aplica o `supabase/config.toml` ao projeto linkado. O deploy de Functions usa `supabase functions deploy --project-ref ... --use-api`. Faça isso apenas depois de revisar URLs/secrets específicos de OAuth, WhatsApp, Google e Microsoft.

## 6. Criar workspace e contas sintéticas

```bash
npm run staging:cr10:accounts
```

O bootstrap:

1. cria/reutiliza Admin, Gestor e Vendedor via Auth Admin;
2. autentica o Admin com chave publicável;
3. cria/reutiliza o workspace por `create_organization_with_defaults`;
4. usa `create_organization_invite` + `accept_organization_invite`;
5. fixa os H22 profiles `system-manager` e `system-seller`;
6. grava apenas IDs/evidência não secreta em `ops/evidence/CR10_STAGING_CONTEXT.json`.

## 7. Rodar tudo

```bash
npm run runtime:commercial-readiness:cr10
```

O orquestrador só retorna `CR10 STAGING READY` quando estes gates passarem na mesma execução:

- CR10 static audit;
- migration push/lint;
- bootstrap das contas;
- CR2 Auth/RLS com Admin/Gestor/Vendedor;
- CR3 E2E comercial completo.

Depois disso, o workspace ID produzido pode alimentar o CR9.

## Segurança

- staging deve ser descartável e separado de produção;
- `service_role` nunca vai para `VITE_*`;
- os logs redigem chaves, tokens e passwords conhecidos;
- o bootstrap não armazena passwords;
- `db reset --linked` não é usado;
- `migration repair` não é executado automaticamente;
- dados CR3 são sintéticos e prefixados para identificação.
