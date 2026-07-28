# Arquitetura comercial — V100.44

## Fonte de verdade

A oportunidade controla etapa, responsável, data esperada de fechamento, categoria do forecast e probabilidade. A proposta oficial vigente controla produtos, condições comerciais, TCV, MRR, ARR e receita única. O Pipeline e o Forecast combinam essas duas fontes sem duplicar propostas alternativas ou versões substituídas.

## Propostas e revisões

Uma oportunidade pode possuir várias propostas, mas somente uma revisão vigente pode ser oficial. Revisões antigas permanecem como histórico imutável. Negócios ganhos não podem ser revisados, cancelados ou reabertos por mudança de status; aditivos devem ser registrados em nova oportunidade ou fluxo próprio.

## Marcos comerciais

1. Aceite registrado: confirma a concordância do cliente e torna a proposta vigente oficial.
2. Fechamento ganho: encerra a oportunidade, inicia a cadência de pós-venda e trava o histórico.
3. Reconhecimento de receita: lançamento separado por competência, tipo, valor e período de serviço.

## Métricas

- TCV: receita única mais MRR multiplicado pelo prazo contratual.
- MRR: receita recorrente mensal normalizada.
- ARR: MRR multiplicado por 12.
- Forecast ponderado: TCV oficial multiplicado pela probabilidade da oportunidade.
- Receita reconhecida: somente lançamentos com status reconhecido e competência no período.
