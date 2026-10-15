# RealTalent CRM V100.67.0 — RealTalent Assistant

## Objetivo
Transformar o CRM em um sistema consultável e acionável por linguagem natural, preservando explicabilidade, controle humano e baixo acoplamento com provedores externos de IA.

## Entregas
- Assistant global acessível pelo topo e por `Ctrl/⌘ + J`.
- Consultas determinísticas sobre Deal Intelligence: prioridades, negócios em risco, ligações recomendadas, propostas sem resposta, ausência de decisor, negócios esfriando e forecast.
- Resumo contextual por lead/empresa.
- Resultados com evidências, Deal Health, valor e motivo da recomendação.
- Navegação contextual direta para Lead, Account 360, Pipeline, Propostas, Agenda e Central de Ligações.
- Central de Ligações aceita `start-call` com `leadId`, permitindo iniciar o Lead recomendado pelo Assistant.
- Execução segura de follow-ups em lote: plano -> prévia -> confirmação -> criação.
- Revalidação no momento da execução para ignorar leads inativos, bloqueados por DNC ou follow-ups duplicados próximos do mesmo horário.
- Nenhum dado é enviado para serviços externos de IA nesta versão.
- Estrutura preparada para futuro provider/LLM sem misturar geração de linguagem com mutações do CRM.

## Segurança operacional
O Assistant nunca aplica uma mutação diretamente a partir da frase do usuário. A primeira classe de mutação suportada (`create_followups`) gera um plano explícito e exige confirmação pelo diálogo global do CRM.

## Compatibilidade
- Nenhuma migration nova.
- Nenhuma dependência nova.
- Schema de backup permanece `100.54`.
- Buyer Room, Coaching, Sales Engagement, Deal Intelligence e Sales Experience permanecem compatíveis.
