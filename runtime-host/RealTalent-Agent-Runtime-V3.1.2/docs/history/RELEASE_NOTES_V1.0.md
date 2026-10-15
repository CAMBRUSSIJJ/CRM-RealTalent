# RealTalent Agent Runtime V1.0 — Production Governance

## Adicionado

- Governance como camada transversal acima de Program/Mission/Workflow/Task.
- perfis operacionais locais `operator`, `manager` e `admin`;
- matriz de risco `low`, `medium`, `high`, `critical`;
- orçamento por equipe em janela móvel de 24h;
- fila persistente e ordenada por prioridade;
- aprovações persistentes e consumo único de aprovação delegada;
- audit log JSONL encadeado por SHA-256 com verificação da cadeia completa;
- snapshots do estado operacional do Agent;
- rollback governado do estado operacional;
- objetivos permanentes persistentes;
- abas Governança e Objetivos no Control Center;
- CLI `governanca-agent.sh` no bundle completo;
- `governance:selftest`.

## Melhorado

- fila pode despachar explicitamente o próximo item por prioridade;
- item bloqueado por aprovação retorna à fila após aprovação;
- rollback preserva o estado Pausado e não restaura o audit log;
- cobrança de rollback ocorre após a restauração, evitando que o custo seja apagado pelo próprio snapshot;
- hash canônico inclui estruturas aninhadas de ator/metadata;
- verificação de auditoria percorre todo o arquivo, não apenas uma janela recente;
- Programs, Missions, Workflows, Builder e QA passam por autorização de governança antes da execução.

## Limites intencionais

- os perfis são uma política local do Runtime, não autenticação/SSO;
- rollback global não reverte dados de negócio já gravados no CRM/Blue Ocean;
- objetivos permanentes não iniciam execução silenciosa em background;
- identidade corporativa, RBAC remoto e trilha de auditoria centralizada em servidor permanecem integrações futuras.
