# RealTalent CRM V101.8.4-H14 — WhatsApp Conversation Composer

## Objetivo

Transformar a conversa WhatsApp selecionada em um chat respondível **independentemente do filtro global de canal**.

## Bug corrigido

Na H13, o `WhatsAppChatPanel` era exibido apenas quando `channel === 'whatsapp'`. Assim, na view **Todos**, clicar em uma conversa WhatsApp mostrava a timeline unificada em cartões e escondia o composer, apesar de a conversa selecionada ser WhatsApp.

## Comportamento H14

A decisão de renderização passa a ser orientada pela conversa selecionada:

- `selectedConversation.channel === 'whatsapp'` → abre `WhatsAppChatPanel`;
- mensagens recebidas ficam à esquerda e enviadas à direita;
- tempo real H12/H13 permanece ativo;
- composer fica no rodapé e envia pelo QR Local ou Cloud API conectada;
- `Enter` envia e `Shift+Enter` cria nova linha;
- view **Todos** permanece como filtro de lista, sem impedir o chat;
- timeline multicanal continua disponível quando a conversa selecionada não é WhatsApp.

Nenhuma mensagem é duplicada: o chat continua lendo e gravando os mesmos `CommunicationEvent` da timeline unificada.
