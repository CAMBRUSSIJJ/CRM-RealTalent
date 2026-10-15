# RealTalent CRM V101.11.3-H19.5 — Channel Workspaces & Collaborative Tasks

Base direta: **V101.11.3-H19.4 — Communication Focus Experience**.

## Objetivo

Separar a Central de Comunicação em experiências realmente dedicadas por canal e evoluir Tarefas para um modelo colaborativo ligado a Equipes/Pessoas, com checklist operacional item a item.

## Comunicações

### WhatsApp dedicado

- A Central abre em **WhatsApp** por padrão.
- A antiga barra com Caixa de entrada, WhatsApp, E-mail, Ligações e Atividades deixa de ocupar a tela.
- O workspace visível trabalha somente com conversas WhatsApp quando WhatsApp está ativo.
- H19.2/H19.3/H19.4 continuam preservados: Connection Center, QR/Cloud, realtime, respostas rápidas, propostas, estados comerciais e Lead Context Drawer.

### E-mail dedicado

- Novo workspace de e-mail com lista de threads + conversa.
- Histórico organizado cronologicamente e diferenciado entre recebido/enviado.
- Composer integrado a contas Google/Microsoft já conectadas pelo framework existente.
- Seleção da conta remetente, destinatário do lead, assunto e corpo.
- Envio usa `sendOfficialEmail`; não cria transporte paralelo.
- Estado de conexão e sincronização ficam no próprio workspace.
- Contexto do lead continua disponível sob demanda pelo drawer H19.4.

## Tarefas colaborativas

- Equipe e Responsável deixam de ser seletores independentes.
- Escolher uma equipe filtra responsáveis pelos memberships reais daquela equipe.
- Trocar para uma equipe incompatível limpa o responsável anterior.
- Ao escolher uma pessoa ligada a uma única equipe, a equipe pode ser preenchida automaticamente.
- Resumo visual explicita **Equipe → Pessoa**.

## Checklist inspirado no Trello

O textarea com `[ ]` e `[x]` foi removido. O checklist passa a ter:

- checkbox por item;
- edição inline;
- adicionar item;
- remover item;
- reordenar por arraste;
- ocultar/mostrar concluídos;
- percentual e barra de progresso;
- progresso também visível na lista e no quadro de tarefas.

A persistência continua usando `task_checklist_items` e sua posição existente; não houve migration nova.

## Preservado

- Work Management V101.11.2 e tabelas atuais.
- Equipes, memberships, tarefas, relações CRM e comentários.
- WhatsApp oficial/QR e gateway de comunicações.
- E-mail oficial já suportado por Gmail/Outlook no Integration Framework.

## Limitações

- O composer de e-mail continua enviando pelo contrato oficial atual e não adiciona anexos nesta hotfix.
- O checklist permite reordenação dentro da edição da tarefa; drag-and-drop entre tarefas não faz parte desta versão.
