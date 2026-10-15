# RealTalent CRM V101.6.8 — Workspace Interaction Architecture

Release construída sobre a V101.6.7 após revisão funcional de Território, Follow-ups, Pipeline e Playbooks. O objetivo é estabelecer uma gramática operacional comum — **Buscar → Filtrar → Visão → Visualizar → Executar** — sem reestruturar o modelo de dados do CRM.

## Território
- separa filtros comerciais/geográficos das configurações visuais do mapa;
- adiciona drawer de filtros e chips removíveis;
- adiciona visões territoriais salvas no workspace local;
- preserva raio, seleção por área, seleção visível e fila de localização como ferramentas espaciais;
- reorganiza os KPIs para contas na visão, pipeline territorial, risco comercial e gaps de cobertura;
- mantém mapa + carteira lateral + contexto da conta como núcleo do workspace.

## Follow-ups
- separa **estado da fila**, **visualização** e **ferramentas** (Cadências/Desempenho);
- padroniza busca, filtros, visões salvas e ação principal;
- mantém filtros avançados no drawer e chips removíveis;
- reestrutura Nova atividade em **Relacionar → Próxima ação → Orientação**;
- adiciona atalhos de agenda `+2h`, `Amanhã 09:00` e `Próximo dia útil`.

## Pipeline
- reduz o resumo superior aos sinais operacionais essenciais;
- mantém Pipeline Intelligence recolhível e move a fila de atenção para dentro dessa camada;
- adiciona filtro explícito por etapa, drawer e chips removíveis;
- mantém visões salvas e Kanban / Lista / Previsão / Calendário / Funil;
- organiza Nova oportunidade como **Conta e contato → Negócio e Pipeline → Próxima ação**.

## Playbooks
- amplia a busca para conteúdo, segmento, persona, discovery, objeções e tags;
- adiciona filtros por etapa, objetivo, temperatura, segmento, persona, tipo, status, modo de execução e contextualização;
- adiciona visões salvas da Biblioteca por workspace local;
- adiciona visualizações **Cards**, **Texto completo**, **Mapa mental** e **Fluxo**;
- todas as visualizações usam a mesma entidade de Playbook, evitando duplicação de conteúdo;
- preserva Estratégia, Execução e Coaching.

## UI compartilhada
- nova camada `workspace-interaction-architecture-v10168.css` aplicada após V101.6.7;
- novos padrões de saved views, drawers, chips, criação guiada e leitura multi-view;
- mantém responsividade e o padrão visual já consolidado em Meu Dia/Contatos.

## Compatibilidade
- sem migration de banco;
- porta Linux permanece `4188` e RealTalent Connect `3001`;
- dados existentes e preferências anteriores continuam válidos;
- visões de Follow-ups/Território são persistidas localmente por workspace.
