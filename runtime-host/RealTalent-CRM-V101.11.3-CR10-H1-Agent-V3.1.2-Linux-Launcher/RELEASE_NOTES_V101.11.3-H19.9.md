# V101.11.3-H19.9 — WhatsApp Reliable Messaging & Groups

Base: V101.11.3-H19.8-H1 — WhatsApp Runtime Recovery.

## Corrigido

- Remove processamento duplicado de mensagens recebidas entre `message` e `message_create`.
- Deduplica eventos live por `externalMessageId` no bridge do WhatsApp.
- Adiciona idempotência real ao endpoint de envio do Communications Gateway.
- Coalesce requisições simultâneas com a mesma chave para impedir dois envios físicos.
- Bloqueia duplo clique/Enter no composer antes do próximo render React.
- Deduplica a timeline oficial por `externalMessageId`, inclusive para registros históricos já duplicados.

## Envio mais responsivo

- A mensagem aparece imediatamente no chat como envio otimista.
- O envio real continua sendo confirmado pelo gateway/WhatsApp em segundo plano.
- Falha de envio mantém estado visual de erro e permite recuperação do texto.

## Novo contato

- A Central do WhatsApp agora possui `Novo contato`.
- Cria um contato/lead real no RealTalent CRM, valida o telefone e abre a conversa imediatamente.
- Esta ação cria o contato no CRM; ela não grava na agenda nativa do telefone.

## Novo grupo

- A Central do WhatsApp agora possui `Novo grupo` para sessões QR locais.
- Permite selecionar contatos do CRM e informar números adicionais.
- O gateway usa a sessão real do WhatsApp Web para criar o grupo.
- O grupo criado entra na lista de conversas e aceita mensagens pelo próprio CRM.
- Grupos via Cloud API permanecem fora do escopo desta versão.

## Preservado

- Pure Chat H19.7.
- Control Center H19.8.
- Runtime Recovery H19.8-H1.
- QR local e Cloud API continuam separados.
- Nenhuma nova migration.

## Limitação de validação

A criação física de grupo requer uma sessão QR do usuário conectada. O contrato e a implementação foram auditados, mas não foi criado um grupo real nesta sessão de QA porque não há uma conta WhatsApp do usuário pareada no ambiente de build.
