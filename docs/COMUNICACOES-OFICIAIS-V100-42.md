# RealTalent V100.42 — Comunicações Oficiais

## Escopo

A V100.42 conecta o framework V100.39 aos canais oficiais de comunicação:

- Google Calendar e Gmail via OAuth Google;
- Outlook Mail e Calendar via Microsoft Graph;
- WhatsApp Business Platform via Cloud API;
- timeline unificada na ficha do lead e na área Comunicações.

## Fluxo seguro

1. O administrador conecta a conta em Configurações → Integrações.
2. Tokens são armazenados somente no cofre criptografado do backend.
3. Envios entram em `communication_outbox` com idempotência e novas tentativas.
4. Webhooks e sincronizações gravam `communication_events`.
5. A interface combina eventos externos, ligações, atividades e agenda.
6. Registros `do_not_contact` são bloqueados no backend.

## Edge Functions

- `official-communication-send`: valida sessão e enfileira o envio.
- `communication-dispatch-worker`: envia Gmail, Outlook ou WhatsApp.
- `communication-sync-worker`: importa e-mails e eventos de calendário.
- `google-communications-webhook`: recebe sinais de mudança Google.
- `microsoft-communications-webhook`: recebe change notifications Graph.
- `whatsapp-webhook`: recebe mensagens e status de entrega.

## Limitações de homologação

As APIs externas exigem aplicativos, consent screens, permissões e secrets próprios do cliente. O modo local simula a fila sem enviar mensagens reais. Gmail pode exigir processo de verificação do Google conforme os escopos publicados.
