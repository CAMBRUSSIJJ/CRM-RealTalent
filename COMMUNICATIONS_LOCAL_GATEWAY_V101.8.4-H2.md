# RealTalent CRM V101.8.4-H2 — Local Communications Gateway

Esta hotfix remove a falsa conexão de demonstração observada na gravação de 2026-10-01.

## O que muda no Linux local

O `start-linux.sh` sobe três processos:

- CRM em `127.0.0.1:4188`;
- RealTalent Connect em `:3001`;
- RealTalent Communications Gateway em `127.0.0.1:3002`.

O gateway guarda tokens fora do navegador e oferece OAuth local para Gmail e Outlook. O WhatsApp Cloud pode ser configurado na própria tela **Configurações → WhatsApp**, informando Access Token e Phone Number ID. A credencial é validada contra a API da Meta antes de ser aceita.

## Gmail

Execute `./configure-communications-local.sh`, informe o Client ID/Secret do aplicativo OAuth e cadastre no Google Cloud:

`http://127.0.0.1:3002/oauth/google/callback`

Depois use **Configurações → Integrações → Conectar Google**.

## Outlook

Cadastre no Microsoft Entra o redirect:

`http://localhost:3002/oauth/microsoft/callback`

Depois use **Configurações → Integrações → Conectar Microsoft**.

## WhatsApp Cloud

Em **Configurações → WhatsApp → Configurar WhatsApp Cloud**, informe:

- Access Token;
- Phone Number ID;
- WABA ID (opcional para o envio básico);
- nome da conta (opcional).

O token é enviado ao gateway local e salvo criptografado no arquivo interno de credenciais. Ele não é persistido em `localStorage`.

## Recebimento de mensagens

Gmail e Outlook são sincronizados pelo gateway em intervalos regulares e também pelo botão **Sincronizar** da Central de Comunicação.

WhatsApp Cloud recebe mensagens por webhook. Para receber eventos da Meta, o endpoint local `/webhooks/whatsapp` precisa ser publicado por HTTPS com URL estável. O envio de WhatsApp funciona sem webhook público.
