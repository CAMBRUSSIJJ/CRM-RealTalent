# RealTalent CRM V101.11.3-H19.4 — Communication Focus Experience

Base direta: **V101.11.3-H19.3 — WhatsApp Sales Workspace**.

## Objetivo

Transformar a Central de Comunicação em um workspace de conversa com foco: a tela principal passa a trabalhar com **Conversas + Conversa**, enquanto o contexto comercial do lead é aberto somente quando necessário em um drawer lateral.

## Adicionado

- Lead Context Drawer lateral, aberto pelo nome do contato ou pelo atalho **Lead**.
- Abas **Resumo**, **Negócio** e **Histórico** dentro do drawer.
- Contexto de contato, responsável, temperatura e próxima ação.
- Oportunidade, valor, etapa e proposta atual no drawer.
- Histórico recente da conversa sem abandonar o chat.
- Atalhos para Follow-up, Reunião, Pipeline, Proposta e contato completo.

## Melhorado

- Workspace principal passa de três colunas fixas para duas áreas: **Conversas + Conversa**.
- Busca, prioridades e filtros migram para a coluna Conversas.
- Header geral fica mais compacto.
- Estado comercial do WhatsApp vira um seletor único no header.
- Se houver apenas uma conta WhatsApp, a barra de seleção de conta deixa de ocupar uma linha permanente.
- Chat ganha mais largura e mais altura útil.

## Preservado

- H19.2 Connection Center, QR Local, Cloud API, realtime e sincronização.
- H19.3 respostas rápidas, proposta no composer, Buyer Room, ações por mensagem e estados comerciais persistidos.
- Histórico oficial/assistido, identity binding e gateway de comunicações.

## Limitação

O estado comercial manual da conversa continua persistido localmente pelo mecanismo H19.3; sincronização desse estado entre navegadores/equipe permanece fora do escopo desta hotfix.
