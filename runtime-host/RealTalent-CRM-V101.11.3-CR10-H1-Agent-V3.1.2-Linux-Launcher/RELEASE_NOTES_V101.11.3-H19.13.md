# RealTalent CRM V101.11.3-H19.13 — WhatsApp Work Management

Base: V101.11.3-H19.12 — Communication Workspace Lineage Recovery.

## Objetivo

Transformar o WhatsApp em uma caixa de trabalho organizada sem desfazer o Pure Chat. A conversa continua sendo header + histórico + composer; a operação comercial fica em uma camada compacta entre o cabeçalho e a timeline e em filtros da Inbox.

## Adicionado

- **Etiquetas de conversa**: Lead, Cliente, Quente, Retornar, Pós-venda e VIP, além de etiquetas personalizadas com cor.
- **Status operacional**: Novo, Em atendimento, Aguardando cliente, Retorno agendado e Concluído.
- **Responsável por conversa**, usando membros reais do workspace.
- **Follow-up do WhatsApp** com data/hora e atalhos. Quando existe contato CRM vinculado, cria uma atividade de follow-up e atualiza `nextActionAt`.
- **Tarefa pelo WhatsApp** usando o serviço real do módulo Tarefas, com prazo, prioridade, responsável, tags e relação com o lead quando disponível.
- **Inbox operacional** com Para responder, Follow-ups hoje, Vencidas, Aguardando cliente e Sem responsável.
- **Filtros por etiqueta** com contagem.
- Indicadores compactos de status, etiquetas, retorno e tarefa vencida na linha da conversa.

## Preservado

- H19.7 Pure Chat: proposta, nota e ações comerciais por mensagem continuam fora do corpo da conversa.
- H19.8 canvas contínuo e Control Center.
- H19.9 idempotência, novo contato e novo grupo.
- H19.10 rich messaging, reply, ACK e fila.
- H19.10-H1 Media Delivery Fix.
- H19.11 normalização, agenda WhatsApp e player/gravação de voz.
- H19.12 lineage recovery e proteção contra retorno da Central antiga.

## Persistência

- Tarefas usam `work-management` e, portanto, o repository configurado do CRM.
- Follow-ups vinculados usam `ActivityItem`/lead do repository do CRM.
- Nesta entrega, etiquetas/status/responsável/follow-up visual da Inbox são metadados operacionais locais por workspace no navegador. Isso evita uma migration destrutiva na H19.13, mas esses metadados ainda não sincronizam entre navegadores diferentes.

## Sem nova migration

A baseline permanece em 54 migrations.
