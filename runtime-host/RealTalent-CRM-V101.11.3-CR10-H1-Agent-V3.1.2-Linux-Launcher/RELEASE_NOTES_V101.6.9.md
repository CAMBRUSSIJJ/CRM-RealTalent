# RealTalent CRM V101.6.9 — Global Filter & View Standard

## Objetivo

Padronizar a lógica de navegação, exibições e filtros do CRM tomando a experiência de **Contatos** e a gravação de referência como régua de interação. A release não cria um segundo sistema de filtros: ela conecta a nova camada visual aos estados de filtro já existentes em cada workspace.

## Padrão global

A anatomia adotada passa a ser:

1. **Barra de exibições** — presets/visões do workspace e, quando disponível, criação de nova exibição.
2. **Barra de comando** — busca, filtro, classificação/exibição e ações principais do módulo.
3. **Filtros rápidos configuráveis** — propriedades selecionadas pelo usuário e persistidas por workspace.
4. **Filtros avançados** — drawer/painel para combinações menos frequentes.
5. **Filtros ativos** — chips/estado existente do módulo, sem duplicar a fonte de verdade.

O seletor **Adicionar filtro rápido** possui pesquisa por propriedades, agrupamento por categoria e seleção/deseleção dos campos exibidos. A configuração dos filtros rápidos é persistida localmente por workspace.

## Workspaces cobertos

- Contatos
- Território
- Pipeline
- Follow-ups
- Ligações
- Playbooks
- Agenda
- Metas
- Automações
- Métricas
- Propostas / Catálogo / Receita
- Comunicação
- Garimpo / Resultados

## Território

O runtime do mapa agora recebe a mesma gramática: barra de exibições, filtros rápidos configuráveis e acesso aos filtros avançados. Foram preservados filtros espaciais, seleção de área, seleção visível, camadas, raio comercial e visões salvas existentes.

## Compatibilidade

- Sem migration de banco.
- Sem alteração destrutiva na estrutura dos registros do CRM.
- Filtros rápidos apenas espelham e atualizam os estados de filtro de cada módulo.
- A V101.6.8 permanece como baseline de Workspace Interaction Architecture.
- O launcher Linux passa a identificar o canal `global-filter-view-standard`.
