# RealTalent CRM V101.8.4-H5 — WhatsApp Web QR Reliability

Hotfix de confiabilidade para o QR Local.

## Problema corrigido

O motor H4 usava `@whiskeysockets/baileys@7.0.0-rc14`. Em contas afetadas por mudanças recentes do handshake de dispositivos vinculados, o QR era lido pelo celular, mas o WhatsApp respondia “Tente novamente” / “Não foi possível vincular o dispositivo”.

## Nova arquitetura

O QR Local da H5 usa `whatsapp-web.js@1.34.7` e uma instância real do WhatsApp Web executada em Chromium/Puppeteer. A sessão usa `LocalAuth` e fica salva apenas no Linux em `.realtalent-whatsapp-browser/`.

O transport H4/Baileys permanece no código somente para compatibilidade histórica e auditorias; ele não é mais o motor padrão do QR.

## Fluxo

1. Configurações → WhatsApp → Gerar QR Code.
2. O gateway inicia WhatsApp Web em Chromium headless.
3. O QR oficial gerado pela sessão web é exibido no CRM.
4. O usuário lê em WhatsApp → Dispositivos conectados → Conectar dispositivo.
5. Após `ready`, a conta QR passa a `connected` e o mesmo composer/timeline é usado para enviar e receber mensagens.

## Segurança e escopo

Esta continua sendo uma integração não oficial baseada no WhatsApp Web. A Cloud API oficial da Meta continua disponível separadamente e é a recomendada para produção comercial/equipes.
