# Communications Core — V101.11.0

Camada compartilhada para webhooks oficiais de WhatsApp Cloud, Gmail Pub/Sub e Microsoft Graph.

Princípios:
- validação específica por provider antes de qualquer mutação;
- fail-closed quando segredos obrigatórios não existem;
- idempotência baseada em IDs externos ou digest estável, nunca em `Date.now()` como fallback;
- erros de persistência retornam 5xx para permitir retry do provedor;
- correlation ID e logs estruturados em toda requisição;
- URLs legados permanecem como wrappers durante a migração;
- `communications-gateway` é a nova entrada unificada, sem misturar regras de autenticação entre providers.
