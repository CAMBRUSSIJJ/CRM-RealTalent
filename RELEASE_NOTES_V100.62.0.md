# RealTalent CRM V100.62.0 — Deal Intelligence & Next Best Action

## Objetivo

Transformar os dados já existentes no CRM em orientação comercial explicável. A V100.62.0 não adiciona uma “IA caixa-preta”: ela calcula saúde, risco, momentum, probabilidade e próxima ação com regras determinísticas baseadas em atividade, stakeholders, propostas, próximos passos, timing e engajamento.

## Entregas

- **Deal Health 0–100** com seis componentes ponderados e explicação de cada contribuição.
- **Probabilidade RealTalent** exibida ao lado da probabilidade do vendedor, sem sobrescrever o forecast manual.
- **Risk Engine** para ação vencida, negócio parado, ausência de decisor, relacionamento concentrado, blocker, risco de proposta, fechamento vencido/próximo e divergência de probabilidade.
- **Next Best Action** com ação executável: ligar, follow-up, reunião, mapear stakeholder, criar/revisar proposta ou revisar oportunidade.
- **Deal Momentum**: acelerando, estável ou esfriando.
- **Account Coverage / Relationship Risk** reutilizando Account 360 e relações reais do buying committee.
- **Meu Dia 2.0** com carteira priorizada, valor em risco, forecast RealTalent e negócios sem decisor/próximo passo.
- **Pipeline Intelligence** com KPIs de carteira, cards enriquecidos, ordenação por Deal Health/probabilidade RealTalent e filtros de risco.
- **Deal Inspector** com explicabilidade e timeline comercial construída apenas a partir de eventos reais do CRM.
- **Ficha do Lead** integrada ao mesmo Deal Health usado no Pipeline e Dashboard.
- **Configurações avançadas** para pesos e limites do motor, com normalização segura.
- **Contrato RealTalent Connect v1** para futuramente receber dores, objeções, buying signals, participantes e próximo passo sem mover gravação/transcrição para o CRM.

## Decisões de arquitetura

- Sem nova dependência de runtime.
- Sem migration nova: o motor é derivado do snapshot comercial atual.
- O schema de backup continua `100.54`.
- Conversation Intelligence permanece responsabilidade do RealTalent Connect; o CRM recebe somente sinais estruturados quando a integração for ativada.
- Scores são derivados e recalculáveis; não são persistidos como “verdade histórica” artificial.

## Compatibilidade

Mantém V100.56.4 Full QA & Data Consistency, V100.60.0 Sales Experience Suite e V100.60.1 Performance & Architecture.
