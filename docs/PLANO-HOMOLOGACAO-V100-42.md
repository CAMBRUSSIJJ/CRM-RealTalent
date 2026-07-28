# Plano de homologação V100.42

## Contas

- Conectar uma conta Google de teste.
- Conectar uma conta Microsoft 365 de teste.
- Conectar um número WhatsApp Cloud de teste.
- Confirmar isolamento entre duas organizações.

## Envios

- Enviar e-mail Gmail e validar item em enviados.
- Enviar e-mail Outlook e validar item em enviados.
- Enviar WhatsApp e validar `sent`, `delivered` e `read`.
- Repetir a mesma idempotency key e confirmar envio único.
- Bloquear lead para contato e confirmar rejeição no backend.

## Recebimentos

- Responder ao Gmail e confirmar associação pelo e-mail do lead.
- Responder ao Outlook e confirmar associação pelo e-mail do lead.
- Enviar WhatsApp e confirmar associação pelo telefone.
- Criar/alterar evento no Google Calendar e Outlook Calendar.

## Falhas

- Revogar token e confirmar status de atenção.
- Interromper API e confirmar retry/dead-letter.
- Enviar webhook com verificação inválida e confirmar rejeição.
- Reprocessar fila sem duplicar eventos.
