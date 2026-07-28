# Propostas e Forecast — V100.43

## Escopo
- catálogo de produtos e serviços;
- cobrança única ou recorrente;
- propostas versionadas e vinculadas ao lead/oportunidade;
- aceite, recusa, expiração e cancelamento;
- receita única e MRR;
- categorias Pipeline, Melhor cenário, Comprometido, Fechado e Omitido;
- previsão ponderada por proposta.

## Regras críticas
- proposta aceita reconhece a receita e marca a oportunidade como ganha;
- alterações de itens em propostas encerradas exigem nova revisão;
- a mesma transição de status é idempotente;
- produtos usados em propostas devem ser desativados em vez de excluídos;
- todas as tabelas são isoladas por organização com RLS.
