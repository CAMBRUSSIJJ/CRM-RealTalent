# RealTalent CRM V101.8.4-H8 — WhatsApp History Sync

## Objetivo

Fechar a lacuna observada depois do pareamento QR: a sessão do WhatsApp Web conectava e enviava mensagens, porém a Central de Comunicação não importava as conversas já existentes no WhatsApp.

## Implementado

- `whatsapp-web.js` passa a usar `client.getChats()` + `chat.fetchMessages()` para importar histórico recente.
- O botão **Sincronizar** varre até 60 chats recentes e até 80 mensagens por chat (limites configuráveis por ambiente).
- A importação inicial após `ready` varre um conjunto menor automaticamente.
- O gateway executa sincronização incremental em segundo plano.
- Mensagens enviadas pelo celular também entram no CRM via `message_create`.
- Atualizações de ACK atualizam `sent`, `delivered` e `read`.
- Deduplicação continua baseada no `externalMessageId` do WhatsApp.
- Nome do chat, thread, telefone da outra ponta e tipo de mensagem são preservados em metadata.
- Conversas são vinculadas ao Lead existente usando remetente, destinatário **ou peerAddress**.
- Números ainda não cadastrados permanecem como conversas independentes no WhatsApp; o CRM não cria leads automaticamente.
- Grupos são importados como conversas, mas envio para grupos permanece bloqueado nesta versão.
- Mídias sem legenda aparecem como marcadores `[Imagem]`, `[Vídeo]`, `[Áudio]`, `[Documento]`, `[Sticker]`.
- O carregamento local da timeline foi ampliado para suportar o histórico importado.
- Na primeira abertura, o launcher tenta migrar automaticamente a sessão QR, store e chave do gateway da H7/H6/H5 instalada ao lado, evitando novo pareamento quando possível.

## Observação

A quantidade de histórico disponível depende do que o próprio dispositivo vinculado/WhatsApp Web disponibiliza para a sessão. A H8 não tenta contornar limitações de sincronização impostas pelo WhatsApp.
