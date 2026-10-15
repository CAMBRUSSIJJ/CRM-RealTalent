# RealTalent Agent V2.9 — Long-Horizon Autonomous Workflows

A V2.9 adiciona uma camada de execução longa sobre Workflow → Mission → Program e preserva integralmente Execution Intelligence V2.8.

## Objetivo

Permitir que a Agent conduza trabalho composto por várias etapas sem confundir autonomia com permissão. O estado é persistente, retomável e auditável.

## Ciclo

`ready → running → awaiting_checkpoint → running → ... → completed`

Estados adicionais: `paused`, `blocked`, `recovery_required`, `failed`, `cancelled`.

## Guardrails

- zero escritas silenciosas;
- qualquer etapa `write` exige checkpoint;
- risco medium/high/critical exige checkpoint;
- ação irreversível sempre exige checkpoint;
- DAG de dependências impede avanço fora de ordem;
- lease + heartbeat detectam executor interrompido;
- lease expirado gera `recovery_required`, nunca retry cego;
- resume limitado a 3 tentativas por run;
- orçamento de autonomia padrão de 30 minutos, máximo de 240;
- conclusão exige que todas as etapas estejam concluídas.

## API

- `GET /autonomy`
- `POST /autonomy/runs`
- `GET /autonomy/runs/:id`
- `POST /autonomy/runs/:id/advance`
- `POST /autonomy/runs/:id/heartbeat`
- `POST /autonomy/runs/:id/pause`
- `POST /autonomy/runs/:id/resume`
- `POST /autonomy/runs/:id/recover`
- `POST /autonomy/runs/:id/cancel`
- `POST /autonomy/runs/:id/checkpoints/:checkpointId/approve`
- `POST /autonomy/runs/:id/stages/:stageId/complete`

## CLI

`./realtalent-agent.sh autonomia status`

O runtime não afirma que uma etapa de produto foi executada sem callback/evidência do executor responsável.
