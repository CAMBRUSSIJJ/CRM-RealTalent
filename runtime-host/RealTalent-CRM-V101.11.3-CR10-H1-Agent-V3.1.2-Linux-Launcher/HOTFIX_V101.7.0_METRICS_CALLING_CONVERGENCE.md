# V101.7.0 Hotfix 4 — Metrics & Calling Workspace Convergence

Este hotfix aplica a arquitetura de interação da V101.7.0 às áreas de **Métricas** e **Ligações**, sem migration de banco e sem alterar o canal da release.

## Métricas

- As cinco áreas `Visão executiva`, `Funil`, `Perdas`, `Atividades` e `Previsão` passam a ser tratadas como **seções analíticas fixas**, e não como exibições salvas.
- O `WorkspaceFilterMenu`, os chips e o drawer avançado passam a controlar o mesmo estado de filtros.
- O catálogo de filtros inclui período, responsável, origem, etapa, prioridade, temperatura e status.
- Os filtros passam a afetar indicadores, funil, perdas, atividades, forecast, alertas, tendência, ranking por responsável e origem.
- O funil deixa de expor `Visual Intelligence · V100.99` na interface.
- O usuário escolhe explicitamente se a largura do funil representa **quantidade de negócios** ou **valor atual**.
- O conteúdo dentro das faixas é reduzido; conversão, probabilidade, valor, tempo médio, risco e negócios permanecem no inspector lateral.
- A faixa escura de KPIs abaixo do funil volta à linguagem de superfícies claras do CRM.

## Ligações

- `Operação`, `Histórico`, `Inteligência` e `Configurações` são tratados como áreas estruturais do módulo.
- Em Operação, `Toda fila`, `Hoje`, `Atrasadas`, `Retornos`, `Quentes` e `Propostas` funcionam como views operacionais baseadas em filtro.
- O bloco redundante de presets rápidos foi removido.
- O resumo operacional é reduzido a quatro sinais: Hoje, Atrasadas, Retornos e Conexão.
- A fila usa o mesmo Filter Engine do CRM e adiciona filtros por etapa, temperatura, tentativas e último resultado.
- `Exibição` permite alternar a densidade da fila entre compacta e confortável.

## Preparação e Modo Foco

- `Preparar ligações` vira um fluxo de quatro passos: **Quem ligar → Como ligar → Roteiro e objetivo → Revisar**.
- A revisão final mostra quantidade, alertas, Call Health, próximo contato, roteiro, objetivo e modo.
- Existe somente um CTA principal `Começar ligações`, no footer.
- O roteiro escolhido/automático fica explícito antes da sessão.
- Durante `dialing`, o tempo de conexão exibe apenas objetivo, último contexto e roteiro, evitando a tela vazia.
- Durante a conversa, script e Assistant continuam seletivos; no pós-ligação, resultado, resumo e próxima ação são preservados.

## Compatibilidade

- Nenhuma migration nova.
- A release continua `101.7.0` e o canal continua `workspace-simplification-filter-engine`.
- Auditorias históricas de Calling e Visual Intelligence foram atualizadas apenas para reconhecer a evolução arquitetural, mantendo seus contratos funcionais.
