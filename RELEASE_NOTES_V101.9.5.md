# RealTalent CRM V101.9.5 — Workflow Runtime 3.0

## Entregue

- runtime persistente para automações com `wait` e `branch_if`;
- scheduler server-side reaproveitando `automation-runner` + `pg_cron`;
- `workflow_executions` e `workflow_step_runs`;
- espera por `next_run_at`, sem `setTimeout` no navegador;
- branch condicional com salto de etapas e histórico das etapas puladas;
- retries com backoff, `max_attempts` e recuperação de lock expirado;
- idempotência por workspace + chave lógica;
- RPCs de enqueue, retry e cancel;
- webhook compatível com execução persistente;
- Realtime/Event Bus para execuções e etapas;
- nova aba **Runtime** em Automações;
- inspector `window.__REALTALENT_WORKFLOWS__`;
- regras sem controles de fluxo continuam no executor imediato para compatibilidade;
- regras duráveis preservam os gates de simulação, cooldown, limite diário e máximo de ações antes de entrar no scheduler;
- eventos locais, fila externa e `activity_overdue` convergem para o mesmo runtime quando a regra contém controles de fluxo.

## Banco

Nova migration: `202610020002_v101_9_5_workflow_runtime_3.sql`.

Total esperado: 48 migrations.

## Compatibilidade

A UX principal permanece preservada. O novo runtime é acionado apenas para regras que exigem persistência temporal/ramificação no workspace cloud.

## Operação

A persistência durável (`wait`, retry e retomada com o CRM fechado) é ativada no modo cloud/Supabase, onde `workflow_executions`, `workflow_step_runs`, `automation-runner` e `pg_cron` formam o runtime server-side. No modo local/teste, as regras antigas continuam compatíveis e os novos controles usam fallback não durável para não criar um scheduler oculto no navegador.

Para ambientes Supabase, a migration 48 e a versão V101.9.5 da Edge Function `automation-runner` devem ser publicadas pelo fluxo normal de deploy do ambiente. O launcher Linux verifica a árvore de migrations e os gates do código, mas não publica uma Edge Function remota sem credenciais explícitas.
