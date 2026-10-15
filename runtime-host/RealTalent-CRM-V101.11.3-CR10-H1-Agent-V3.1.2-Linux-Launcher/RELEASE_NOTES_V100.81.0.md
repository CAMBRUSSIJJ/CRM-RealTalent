# V100.81.0 — Revenue Intelligence 2.0

## Objetivo
Eliminar a ambiguidade entre venda fechada, receita reconhecida e previsão comercial.

## Entregas

- Receita realizada separada de receita prevista cadastrada.
- Bookings fechados exibidos como TCV ganho, sem tratá-los como receita reconhecida.
- Pipeline ponderado separado do Forecast RealTalent.
- Forecast RealTalent mantém Deal Health, momentum e probabilidade própria como base.
- Win rate mensal e ticket médio dos negócios ganhos.
- Receita por responsável, origem e produto.
- Alocação proporcional de receita vinculada a propostas para os respectivos itens do catálogo.
- Identificação de receita sem vínculo comercial.
- Correção de datas puras `YYYY-MM-DD` para preservar o mês local.
- Filtro de lançamentos de receita por status.

## Limitações conhecidas

- Negócios perdidos ainda não possuem `closedLostAt`; a análise usa `updatedAt` como referência operacional.
- Cortes por produto/origem ficam incompletos quando lançamentos são manuais e sem vínculo.
- Não há faturamento, contas a receber ou conciliação financeira nesta versão.

## Dados

Nenhuma migration nova. `BACKUP_SCHEMA_VERSION` permanece `100.54`.
