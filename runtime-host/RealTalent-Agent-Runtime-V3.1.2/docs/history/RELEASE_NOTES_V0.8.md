# RealTalent Agent Runtime V0.8 — Missions & Recovery

## Adicionado

- `system.run_mission` no Tool Registry central.
- modo interno `MISSION` para objetivos que atravessam CRM e Blue Ocean.
- Mission Planner estruturado com até 6 blocos por produto.
- persistência local em `missions.json` com permissão 600.
- endpoints `/missions`, `/missions/run`, `/advance`, `/reconcile`, `/retry`, `/replan` e `/cancel`.
- handoff explícito entre CRM e Blue Ocean sem persistir snapshots brutos.
- Recovery por bloco: uma reexecução segura; depois replanejamento explícito.
- até 2 replanejamentos por missão, usando apenas resumos dos blocos concluídos.
- Control Center com aba Missões, progresso, produto solicitado, sincronização, retry e replan.

## Política de autonomia

- Missão coordena workflows V0.8; não executa mutações diretamente.
- cada bloco de missão pertence a exatamente um produto e vira um workflow daquele produto.
- `ANALYZE` e `QA` continuam automáticos dentro do workflow filho.
- `ACT` e `Builder` continuam exigindo checkpoint humano.
- ao trocar de produto, a missão entra em `needs_context` até receber o contexto atual daquele produto.

## Recovery

- workflow filho concluído avança o handoff automaticamente na próxima sincronização.
- workflow filho perdido ou cancelado coloca a missão em `needs_user`.
- bloco pode ser reexecutado no máximo 2 vezes no total.
- replanejamento preserva somente os blocos já concluídos e seus resumos sanitizados.

## Segurança

- `missions.json` não recebe snapshots do CRM, Service Graph, DOM ou screenshots.
- IDs de negócio continuam resolvidos apenas no workflow do produto atual.
- nenhum shell arbitrário foi adicionado.
- delete, mensagens/e-mails, pagamento, sudo, instalação, auth, RLS, permissões e secrets continuam bloqueados.
