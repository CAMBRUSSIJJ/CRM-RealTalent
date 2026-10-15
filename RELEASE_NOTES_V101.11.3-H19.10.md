# V101.11.3-H19.10 — Rich Messaging & Reliable Delivery

Base: V101.11.3-H19.9 — WhatsApp Reliable Messaging & Groups.

## WhatsApp — rich messaging

- envio de imagens, vídeos, áudios e documentos;
- gravação de mensagem de voz no composer com `MediaRecorder`;
- seleção de arquivo e colagem via clipboard/Ctrl+V;
- preview do anexo antes do envio;
- limite operacional de mídia de 8 MB nesta release;
- renderização nativa de imagem, vídeo, áudio e documento na timeline;
- mídia recebida por sessão QR é materializada no runtime local;
- mídia recebida pela Cloud API é baixada da Meta e materializada no armazenamento privado local quando a credencial permite;
- arquivos de mídia não são gravados como base64 no store JSON: ficam no diretório privado do Communications Gateway.

## Respostas citadas

- mensagens com `externalMessageId` real podem ser respondidas;
- QR usa quoted message real do WhatsApp Web;
- Cloud API usa `context.message_id`;
- respostas citadas recebidas por QR e Cloud preservam a referência da mensagem original;
- composer mostra a mensagem que está sendo respondida e permite cancelar a citação.

## Entrega confiável

- mantém a idempotência da H19.9;
- mantém proteção contra clique duplo/Enter repetido;
- mensagem otimista aparece imediatamente no chat;
- estados suportados: `queued`, `sent`, `delivered`, `read` e `failed`;
- mensagens enviadas enquanto o WhatsApp está offline entram em outbox persistente;
- worker do Gateway tenta reenviar automaticamente após a reconexão;
- backoff em falhas transitórias;
- retry manual disponível para mensagens com falha;
- anexos e contexto de reply permanecem vinculados durante a fila/retry.

## Cloud API

- upload de mídia pelo endpoint oficial da Meta antes do envio;
- envio por media ID;
- contexto de reply oficial;
- webhook de mídia inbound reconhece imagem/vídeo/áudio/documento;
- download da mídia inbound para o armazenamento privado local quando disponível;
- ACK oficial continua atualizando enviado/entregue/lido/falhou.

## Preservado

- Pure Chat: proposta, follow-up, tarefa e contexto comercial continuam fora do corpo do WhatsApp;
- criação de contatos e grupos da H19.9;
- deduplicação de mensagens;
- Runtime Recovery H19.8-H1;
- Connection Center, QR e Cloud API;
- E-mail e demais módulos do CRM.

## Limitações conhecidas

- grupos continuam disponíveis somente pelo transporte QR local;
- o navegador precisa conceder permissão ao microfone para gravação de voz;
- mídia histórica antiga que não tenha sido materializada anteriormente pode continuar sem arquivo local até nova sincronização/evento compatível;
- typecheck/Vitest/Vite build oficiais dependem das dependências npm instaladas; no ambiente de geração desta release o registry npm não respondeu.
