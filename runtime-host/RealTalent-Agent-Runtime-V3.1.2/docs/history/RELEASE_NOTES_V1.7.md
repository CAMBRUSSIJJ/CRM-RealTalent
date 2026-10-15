# RealTalent Agent V1.7 — Project Brain

## Objetivo
Transformar o Project Awareness em um cérebro técnico incremental para CRM e Blue Ocean, aumentando a qualidade do contexto entregue ao modelo local sem exigir um modelo maior.

## Adicionado
- indexação incremental por arquivo alterado;
- Architecture Graph por módulos e imports agregados;
- Data Graph para interfaces/types/classes/enums e consumidores;
- Route Graph para rotas definidas e referências de navegação;
- UI Component Graph para componentes e arquivos TSX relacionados;
- Supabase Graph para tabelas, RPCs, buckets e migrations;
- Feature Graph com dependências e dependentes entre módulos funcionais;
- Historical Change Graph baseado no histórico técnico da Agent;
- endpoint `POST /project-brain/sync`;
- endpoint `GET /project-brain/graph`;
- contexto do chat enriquecido com Project Brain, mantendo o gate da Conversation Intelligence;
- análise de impacto enriquecida com módulos, entidades de dados, rotas e tabelas relacionadas.

## Performance
Em uma sincronização sem alterações, a Agent reutiliza registros já indexados e reprocessa apenas arquivos modificados/novos/removidos.

## Segurança e precisão
- grafos são derivados estaticamente do workspace atual;
- Project Brain não é prova de comportamento em runtime;
- Root Cause continua tratando causas como hipóteses até confirmação por logs/testes/Browser QA;
- nenhum código é alterado automaticamente pela indexação.

## Preservado
- Conversation Intelligence V1.6;
- chat/streaming local;
- Ollama local-first;
- Builder Sandbox;
- Browser QA;
- Workflow / Mission / Program;
- Governance, aprovações e rollback operacional.
