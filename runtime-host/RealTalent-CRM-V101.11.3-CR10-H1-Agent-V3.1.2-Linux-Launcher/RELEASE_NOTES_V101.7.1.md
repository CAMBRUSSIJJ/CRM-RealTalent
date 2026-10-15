# RealTalent CRM V101.7.1 — Metrics & Calling Structural Redesign

## Objetivo
Esta versão substitui a abordagem incremental do Hotfix 4 por uma reestruturação visual e de interação em **Métricas** e **Ligações**, preservando serviços, dados, migrations e integrações existentes.

## Métricas
- Mantém as áreas analíticas fixas: Visão executiva, Funil, Perdas, Atividades e Previsão.
- Garante a presença do shell/topbar global na rota de Métricas.
- Substitui o funil trapezoidal alto por uma leitura compacta em barras, com largura por quantidade ou valor.
- Preserva o inspector lateral por etapa.
- Remove a faixa azul de resumo do Funil e usa quatro KPIs compactos em superfície neutra.
- Mantém o Unified Filter Engine para período, equipe, origem, etapa, prioridade, temperatura e status.

## Ligações
- Substitui a composição `Próximo da fila + card grid separado` por um único **Centro operacional**.
- Os quatro sinais essenciais — Hoje, Atrasadas, Retornos e Conexão — ficam integrados ao mesmo bloco do próximo contato.
- Mantém Operação, Histórico, Inteligência e Configurações como seções estruturais.
- Mantém views da fila, busca, Filter Engine, densidade e seleção, com menor altura total antes da fila.

## Preparar ligações
- Passa a funcionar como wizard real de quatro passos.
- O footer oferece `Voltar` e `Continuar`; `Começar ligações` aparece apenas na etapa Revisar.
- Preserva seleção de fila, RealTalent Voice, objetivo, modo, roteiro, Strategy Hub e validações.

## Modo Foco
- Pré-ligação, conexão, conversa e pós-ligação recebem hierarquias visuais distintas.
- Durante a conversa, a pergunta/fala recomendada vira o elemento principal.
- Fala completa e coaching ficam sob disclosure para reduzir carga cognitiva.
- Assistant continua seletivo e resultado/próxima ação permanecem no pós-ligação.

## Dados e compatibilidade
- Sem migration nova.
- 44 migrations históricas preservadas.
- Release channel continua `workspace-simplification-filter-engine` para compatibilidade com o launcher e gates históricos.
