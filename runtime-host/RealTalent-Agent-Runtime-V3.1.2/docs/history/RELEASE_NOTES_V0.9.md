# RealTalent Agent Runtime V0.9 — Autonomous Programs

## Adicionado
- Modo `PROGRAM` e tool `system.run_program`.
- `programs.json` persistente com chmod 600.
- Planejador de programas com até 8 marcos.
- Prioridades `low/normal/high/critical`.
- Dependências entre marcos sem ciclos futuros.
- 1 missão ativa por programa.
- Critérios de aceite observáveis por marco.
- Gate humano `awaiting_acceptance` antes de liberar dependências.
- Retry por marco, replanejamento, pause/resume/cancel.
- Endpoints `/programs/*` e painel Programas no Control Center.

## Preservado
- Missions & Recovery V0.8.
- Autonomous Workflows V0.7.
- Builder com backup/gates/rollback.
- Browser QA em navegador local gerenciado.
- Nenhuma escrita automática sem checkpoint.
