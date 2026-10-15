# RealTalent CRM V101.8.4-H4 — WhatsApp QR Local

## Objetivo
Adicionar um segundo modo de conexão do WhatsApp no Linux local sem remover a WhatsApp Cloud API oficial.

## Modos disponíveis
- **WhatsApp QR Local (experimental/não oficial):** vincula o computador como dispositivo multi-device, salva a sessão somente no Linux e usa a mesma Central de Comunicação.
- **WhatsApp Business Cloud:** integração oficial Meta, indicada para produção, equipes, templates e automações oficiais.

## H4
- geração de QR Code em Configurações → WhatsApp;
- sessão persistida em `.realtalent-whatsapp-qr/` com permissões locais;
- envio pelo composer existente da Central de Comunicação;
- recebimento de mensagens na timeline local;
- conta identificada por `metadata.transport = qr`;
- desconexão e remoção da sessão local;
- Cloud API preservada integralmente;
- dependências fixadas: `@whiskeysockets/baileys 7.0.0-rc14` e `qrcode 1.5.4`.

## Limite importante
O modo QR usa a camada WhatsApp Web multi-device via biblioteca de terceiros e não é uma API oficial da Meta. Pode sofrer mudanças ou bloqueios do WhatsApp. Para implantação comercial/empresarial, a Cloud API continua sendo o caminho recomendado.
