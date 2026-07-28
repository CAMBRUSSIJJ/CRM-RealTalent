# automation-webhook-dispatch

Despacha uma entrega individual quando chamado pelo CRM e processa novas tentativas pendentes quando chamado pelo `pg_cron`.

## Segredos da função

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTOMATION_WEBHOOK_CRON_SECRET`

## Segurança

- chamadas individuais exigem JWT válido e vínculo do usuário com a organização da entrega;
- execução da fila exige `x-cron-secret`;
- somente HTTPS é aceito em produção;
- destinos locais e faixas privadas são bloqueados;
- o corpo pode ser assinado com HMAC SHA-256;
- redirects são bloqueados;
- respostas e erros são truncados antes de entrar no log.

Configure o agendador com `supabase/cron/CONFIGURAR-WEBHOOK-RUNNER.sql`.
