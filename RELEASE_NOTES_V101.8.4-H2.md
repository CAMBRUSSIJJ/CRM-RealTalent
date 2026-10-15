# V101.8.4-H2 — Local Communications Gateway

Hotfix funcional criado após validação da V101.8.4-H1 no Linux. A H1 exibia a experiência oficial, porém o modo local ainda caía em demonstração porque não havia backend local para OAuth, tokens, envio e sincronização.

## Corrigido
- Remove o fallback de “Modo demonstração” para Gmail e Outlook no modo Linux local.
- Adiciona `realtalent-communications-gateway.mjs` em `127.0.0.1:3002`.
- OAuth local real para Google/Gmail e Microsoft/Outlook com PKCE.
- Tokens OAuth armazenados fora do navegador e criptografados com AES-256-GCM.
- Envio de e-mail pelo Gmail API e Microsoft Graph dentro da Central de Comunicação.
- Sincronização de e-mails recebidos para a timeline oficial.
- Configuração do WhatsApp Cloud API dentro do CRM com validação do Access Token e Phone Number ID.
- Envio de WhatsApp pelo composer oficial dentro da conversa.
- Webhook local para mensagens/status do WhatsApp (`/webhooks/whatsapp`).
- Timeline oficial habilitada no modo local e atualização automática.
- Ações rápidas E-mail/WhatsApp usam o composer oficial quando existe conta conectada; o modo assistido permanece como fallback.
- Vínculo inbound por Lead e ContactRecord.
- Launcher Linux inicia e verifica Connect + Communications Gateway.
- Novo assistente `configure-communications-local.sh` para credenciais OAuth.

## Observação operacional
Gmail e Outlook exigem um Client ID OAuth do proprietário do CRM. O WhatsApp exige Access Token e Phone Number ID da conta Meta. Para receber WhatsApp, a Meta precisa alcançar o webhook por HTTPS público; envio não depende desse webhook.

## Compatibilidade preservada
- V101.8.3-H1 Contact Identity Sync.
- V101.8.3 Connect One-Tap para iPhone.
- V101.8.4 Official Communications/Supabase continua disponível.
