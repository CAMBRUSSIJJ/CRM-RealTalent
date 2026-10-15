# RealTalent CRM V101.10.3-H7 — Review Workspace 2.0

## Entregue

- Revisão com modos **Lista | Guiada**;
- Lista torna-se a operação principal para alto volume;
- filtros por status, origem, qualidade e duplicidade;
- resumo de registros visíveis, prontos, duplicados e bloqueados;
- seleção múltipla respeita os filtros ativos;
- ações em lote: analisar, reprocessar enrichment, aprovar, descartar, enviar ao CRM e remover;
- abertura de qualquer linha diretamente na revisão Guiada;
- reprocessamento em lote preserva tarefas de enrichment já concluídas;
- `agentJobId` passa a acompanhar candidatos importados do Agent para permitir reprocessamento posterior;
- H6 Progressive Processing preservado integralmente;
- envio canônico H4 preservado: CompanyRecord → ContactRecord → oportunidade opcional.

## Compatibilidade

Sem migration nova. Permanecem 49/49 migrations. O Prospecting Agent runtime permanece em H6 porque H7 é uma evolução de workspace/frontend; o launcher exige o Agent H6 e o marker visual H7.
