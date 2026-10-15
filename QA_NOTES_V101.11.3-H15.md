# V101.11.3-H15 — Commercial Management UI Recovery

Hotfix para a regressão visual da H14 em Metas e Equipes.

Causa raiz: os estilos `.goal-metric-groups`, `.goal-scope-choice`, `.team-360-tabs` e componentes do Team 360 foram adicionados ao `calling-workspace-operational.css`, carregado por Calling/Playbooks, e não pelo shell global. Assim `/goals` e `/teams` renderizavam os componentes H14 sem a camada visual H14.

Correção: stylesheet global `commercial-management-ui.css`, importado em `main.tsx`, com linguagem azul RealTalent, estados ativos, cards, tabs, responsividade e preservação de verde apenas para estados semânticos de sucesso/disponibilidade.
