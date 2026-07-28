# Operação em produção — V100.46

- Autorize os URIs OAuth do Google e da Microsoft para `integration-oauth-callback`.
- Crie o tópico Google Cloud Pub/Sub para o Gmail e autorize o publicador do Gmail.
- Configure a push subscription para `gmail-pubsub-webhook?token=<segredo>`.
- Garanta HTTPS público nos webhooks do Google Calendar e Microsoft Graph.
- Execute o worker de manutenção ao menos a cada hora.
- Execute os workers Google e Microsoft com o segredo de integração.
- Verifique no painel se as subscriptions de e-mail e calendário estão ativas.
- Teste envio simples, HTML, anexo, recebimento, alteração de agenda e conflito antes da liberação.
