# Framework de Integrações V100.39

## Contrato

1. **OAuth** é iniciado por Edge Function autenticada.
2. **Tokens** nunca chegam ao frontend e são armazenados criptografados pelo backend.
3. **Contas conectadas** pertencem a uma organização.
4. **Sincronizações** entram em fila com chave de idempotência.
5. **Tentativas** possuem limite, backoff e dead-letter.
6. **Logs** são imutáveis para usuários comuns.
7. **RLS** restringe contas, jobs e logs ao workspace correto.

## Secrets esperados

- `APP_PUBLIC_URL`
- `OAUTH_STATE_SECRET`
- `INTEGRATION_TOKEN_ENCRYPTION_KEY`
- `INTEGRATION_WORKER_SECRET`
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET`
- `META_OAUTH_CLIENT_ID` / `META_OAUTH_CLIENT_SECRET`

A callback de troca de código por token deve ser publicada junto dos conectores oficiais escolhidos para produção.
