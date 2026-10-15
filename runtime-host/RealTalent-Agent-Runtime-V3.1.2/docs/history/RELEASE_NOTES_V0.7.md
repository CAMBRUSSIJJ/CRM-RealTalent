# RealTalent Agent Runtime V0.7 — Autonomous Workflows

## Adicionado

- `system.run_workflow` no Tool Registry central.
- modo interno `WORKFLOW`.
- planner estruturado com até 8 etapas: `analyze`, `act`, `builder`, `qa`.
- persistência local em `workflows.json` com permissão 600.
- endpoints `/workflows`, `/workflows/run`, `/advance`, `/approve`, `/complete`, `/cancel`, `/resume`.
- retomada com contexto atual fornecido pela aplicação.
- Control Center com aba Workflows, progresso e cancelamento/retomada.

## Política de autonomia

- `analyze`: automático.
- `qa`: automático e somente leitura.
- `act`: checkpoint humano; execução ocorre no CRM/Blue Ocean após revalidação local.
- `builder`: checkpoint humano; backup, gates e rollback continuam obrigatórios.

## Recovery

- QA perdido por restart pode ser reiniciado com segurança.
- Builder perdido por restart entra em `NEEDS_USER`; o runtime não inicia outro Builder sem nova decisão humana.

## Segurança

- nenhum snapshot bruto do CRM ou Service Graph é persistido em workflows.
- nenhum shell arbitrário foi adicionado.
- delete, mensagens/e-mails, pagamento, sudo, instalação, auth, RLS, permissões e secrets continuam bloqueados.
