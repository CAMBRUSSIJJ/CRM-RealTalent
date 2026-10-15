# RealTalent CRM V101.11.3-H19.7 — WhatsApp Pure Chat

Base: V101.11.3-H19.6.

## Objetivo

Retirar do corpo do WhatsApp toda a camada comercial que estava competindo com a conversa. O workspace passa a se comportar como um mensageiro: cabeçalho do contato, histórico e composer.

## Alterações

- removidos do chat: Respostas rápidas, Proposta, estado comercial, Lead, ações Follow-up/Tarefa/Nota por mensagem;
- removido o aviso amarelo de WhatsApp desconectado do corpo da conversa;
- removido o texto visual de realtime do chat;
- desconexão é representada apenas por `Conectar` e pelo composer desabilitado;
- histórico permanece visível mesmo sem conta conectada;
- lista de conversas WhatsApp não mostra mais `Aguardando cliente / Aguardando você / Resolvido`;
- WhatsApp/E-mail permanece no topo do workspace;
- Connection Center, QR e Cloud API continuam preservados;
- Follow-up Focus H19.6, E-mail H19.5, Tarefas e Selection H19.5-H1 não foram alterados.

## Decisão de produto

Os controles comerciais de WhatsApp H19.3 continuam disponíveis como serviços/infraestrutura histórica, mas deixam de ser renderizados dentro da conversa. A próxima experiência comercial será desenhada fora do chat.
