# Operação de produção — V100.44

## Publicação

Aplicar as migrations em ordem, incluindo `202607280001_v100_44_commercial_consolidation.sql`, publicar a aplicação e executar os contratos SQL e o preflight da release.

## Regras operacionais

- somente a revisão oficial vigente participa do forecast;
- aceite não reconhece receita e não fecha automaticamente a oportunidade;
- o fechamento ganho deve ser explícito;
- receita deve possuir competência, tipo, valor e vínculo auditável;
- produtos utilizados não são excluídos, apenas desativados;
- propostas de negócios ganhos são imutáveis;
- exportações de usuário não incluem credenciais.

## Monitoramento

Acompanhar falhas de RPC, divergências entre `official_proposal_id` e `is_official`, propostas oficiais duplicadas, lançamentos sem competência e tentativas negadas por RLS.
