# V101.11.3-H14-UI1 — Commercial Management UI Recovery

Correção visual da H14 após regressão em `/goals` e `/teams`.

## Causa raiz
Os estilos dos novos controles da H14 (`goal-metric-groups`, `goal-scope-choice`, `team-360-tabs` e cards do Team 360) foram adicionados por engano a `calling-workspace-operational.css`. Esse arquivo é route-loaded por Calling/Playbooks, portanto Goals e Teams renderizavam os componentes novos sem a camada visual correspondente.

## Correções
- stylesheet global dedicado `commercial-management-ui.css` importado pelo shell;
- Metric Registry em cards 2-colunas, com estado selecionado azul e descrição legível;
- cards de escopo Workspace / Equipe / Pessoa;
- seletor de período padronizado;
- Team 360 tabs convertidas em segmented control profissional;
- diretório/seleção de equipes em azul;
- cards de Metas, Pessoas e Performance do Team 360 padronizados;
- barra de workload em azul, mantendo verde apenas como semântica de disponibilidade/sucesso;
- responsividade para modal e Team 360.

Não há migration nova nem alteração de regra de negócio.
