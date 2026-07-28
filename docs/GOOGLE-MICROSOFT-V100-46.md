# Google e Microsoft — V100.46

A V100.46 conclui a primeira camada operacional de comunicações oficiais do RealTalent.

## Fluxos

1. O OAuth cria a conta, define padrões pessoais quando ainda não existem e agenda a primeira sincronização.
2. Gmail utiliza `historyId`; Google Calendar utiliza `syncToken`.
3. Outlook e Microsoft Calendar utilizam delta links.
4. Subscriptions são criadas para e-mail e agenda e renovadas pelo worker de manutenção.
5. Mensagens e compromissos alimentam a timeline do lead.
6. Alterações simultâneas de calendário abrem um conflito explícito.
7. E-mails são enviados por fila idempotente com texto, HTML, Cc, Cco, templates e anexos.

## Limites de anexos

- máximo de 10 arquivos;
- máximo de 5 MB por arquivo;
- máximo de 10 MB no total.

## Secrets adicionais

- `GOOGLE_GMAIL_PUBSUB_TOPIC`;
- `GMAIL_PUBSUB_WEBHOOK_SECRET`;
- `SUPABASE_PUBLIC_FUNCTIONS_URL`.
