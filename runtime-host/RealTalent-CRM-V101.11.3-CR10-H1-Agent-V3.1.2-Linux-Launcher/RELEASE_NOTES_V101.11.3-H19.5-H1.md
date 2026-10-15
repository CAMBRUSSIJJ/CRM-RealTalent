# V101.11.3-H19.5-H1 — Selection Overlay Runtime Fix

Hotfix sobre a H19.5.

## Corrigido

- Menus do RealTalent Selection System dentro de modais agora ficam acima da camada do modal.
- Status, prioridade, equipe, responsável e relação CRM voltam a exibir suas opções normalmente na Nova tarefa.
- O menu de seleção fica abaixo da região de notificações/toasts para preservar a hierarquia global.
- Equipe vazia passa a mostrar explicitamente `Nenhuma equipe cadastrada`.
- Responsável vazio passa a mostrar `Nenhuma pessoa disponível` ou `Nenhuma pessoa nesta equipe`.
- Checklist Trello-style e vínculo Equipe → Pessoa foram preservados.

## Causa raiz

`SelectionSelect` usa portal em `document.body`. O menu estava em `z-index: 9999`, enquanto `.modal-backdrop` usa `z-index: 13000`. O menu abria corretamente, porém ficava atrás do modal e parecia não ter opções.

## Correção

O CSS canônico do Selection System permanece intacto. Uma camada posterior já existente (`work-management.css`) aplica `z-index: 13550` ao menu global, acima dos modais e abaixo dos toasts (`14000`).
