# Produção — RealTalent CRM V100.42

A release só pode ser promovida após CI verde, staging aprovado, isolamento multiempresa validado, backup válido e teste real dos canais conectados.

Antes da promoção, confirme:

- OAuth Google e Microsoft;
- webhook e número oficial do WhatsApp Business;
- workers de envio e sincronização;
- filas sem itens presos;
- timeline associando eventos ao lead correto;
- bloqueio de contato e idempotência;
- `/health.json` com versão 100.42.
