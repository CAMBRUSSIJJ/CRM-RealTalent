# RealTalent CRM V101.8.4-H7 — WhatsApp Chat Workspace

A Central de Comunicação passa a tratar o canal WhatsApp como uma experiência de chat, sem criar um segundo histórico.

## O que mudou

- ao selecionar **WhatsApp** na barra de canais, o painel principal vira um chat dedicado;
- conversas continuam vindo da **mesma fonte de dados** utilizada pela timeline unificada;
- mensagens recebidas aparecem à esquerda e mensagens enviadas à direita;
- horários, separadores por dia e estados `na fila`, `enviada`, `entregue` e `lida` aparecem no chat;
- o composer fica no rodapé e envia pela conta WhatsApp QR Local ou Cloud API conectada;
- Enter envia e Shift+Enter cria nova linha;
- é possível selecionar a conta de WhatsApp quando houver mais de uma;
- o botão Sincronizar fica disponível no cabeçalho do chat;
- a troca para o canal WhatsApp seleciona automaticamente uma conversa WhatsApp válida, evitando manter uma conversa de outro canal em foco;
- `Todos`, E-mail e os demais canais continuam usando a timeline unificada existente.

## Princípio de dados

O chat é somente uma nova visualização. Mensagens enviadas ou recebidas continuam registradas como eventos oficiais no mesmo histórico do contato, preservando métricas, auditoria e a timeline unificada.
