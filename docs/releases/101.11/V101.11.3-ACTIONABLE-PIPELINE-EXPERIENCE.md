# V101.11.3 — Actionable Pipeline Experience

## Objetivo
Transformar o Pipeline de uma tela informativa em um centro operacional acionável, sem alterar o modelo comercial, dados, stages ou drag & drop existentes.

## 1. KPIs acionáveis
- Oportunidades: remove recortes rápidos e volta ao universo atual.
- Valor do Pipeline: exibe progresso contra a meta mensal quando há meta válida.
- Forecast RealTalent: exibe atingimento da meta e abre a visualização de Forecast.
- Em risco: filtra por conjunto único de oportunidades críticas / proposal risk, evitando dupla contagem.
- Sem próxima ação: filtra instantaneamente os negócios sem próxima atividade.

A barra de progresso usa `calculateRevenueIntelligence`, portanto a referência de meta é a mesma fundação já usada pelo Revenue Intelligence.

## 2. Single Action Bar
A tela passa a concentrar em uma única faixa:
- Smart Views: Todos, Meus negócios, Em risco, Sem ação e Atrasadas;
- views personalizadas salvas;
- busca;
- filtros;
- ordenação;
- modo de exibição;
- densidade Compacta / Confortável;
- ações secundárias;
- `+ Nova oportunidade` como ação primária.

O antigo empilhamento vertical deixou de ser a superfície principal, recuperando altura útil para o Kanban.

## 3. Kanban Card 3.0
O corpo padrão do card prioriza apenas:
- título do negócio;
- contato / empresa;
- valor financeiro;
- próxima ação.

Deal Health continua existindo no motor, mas a comunicação padrão no card passa a ser visual:
- saudável: borda verde discreta;
- atenção / cooling / estagnação: borda amarela e fundo suave;
- crítico / ação vencida: borda vermelha e fundo suave.

Não há frase longa `Ação vencida` no card padrão.

## 4. Hover actions
No desktop, ao passar o mouse ou focar o card:
- Ligar;
- Mensagem / e-mail;
- Concluir próxima atividade.

O terceiro botão chama `completeActivity` sobre a próxima atividade pendente real do contato. Em mobile, as ações permanecem visíveis porque não existe dependência de hover.

## 5. Preservado
- Drag & drop entre etapas;
- regras de mudança de etapa;
- motivo de perda;
- automações;
- Deal Intelligence;
- Revenue Intelligence;
- Lista / Forecast / Calendário / Funil;
- Saved Views;
- filtros avançados;
- Teams & Tasks V101.11.2;
- Communications Architecture V101.11.0;
- 50 migrations existentes.

## 6. Sem mudança estrutural de dados
A V101.11.3 não cria migration e não modifica schema, repository contracts ou objetos canônicos. É uma evolução de interação e apresentação do Pipeline.
