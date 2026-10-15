# RealTalent Agent V1.0 — Production Governance

A V1.0 mantém a mesma RealTalent Agent e adiciona uma camada transversal de governança ao Runtime.

- perfis operacionais: operator, manager e admin
- risco: low, medium, high e critical
- orçamento por créditos em janela de 24h por equipe
- fila persistente com prioridade
- aprovações persistentes
- audit log JSONL encadeado por SHA-256
- snapshots e rollback do estado operacional do Agent
- objetivos permanentes persistidos sem execução silenciosa em background

O CRM continua enviando apenas contexto compacto atual ao Runtime. Snapshots do CRM não são persistidos pela camada Program/Mission/Workflow/Governance.

O rollback global da V1.0 NÃO reverte dados de negócio já gravados no CRM. Para código, o Builder mantém backup e rollback transacional próprio.

A aprovação final de marcos continua humana e é feita no Control Center.
