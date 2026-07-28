# RealTalent CRM V100.46 — Google e Microsoft

## Implementado

- Gmail com sincronização incremental por `historyId`, paginação e recuperação de cursor inválido.
- Outlook com delta queries, paginação e recuperação de `deltaLink` expirado.
- Google Calendar com `syncToken`, canais `watch` e tratamento de HTTP 410.
- Microsoft Calendar com `calendarView/delta`, subscriptions e lifecycle notifications.
- Renovação automática de subscriptions e recuperação de notificações perdidas.
- Conta padrão pessoal ou organizacional por capacidade.
- Timeline unificada com HTML, anexos e mensagens recebidas/enviadas.
- Conflitos de calendário com decisões manter CRM, usar agenda ou ignorar.
- Templates de e-mail com variáveis comerciais.
- Envio em texto ou HTML, Cc, Cco e até 10 anexos, limitado a 5 MB por arquivo e 10 MB no total.
- Gmail MIME multipart e Outlook file attachments.
