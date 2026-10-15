# RealTalent Agent V0.6 — Production Agent + Control Center

## Adicionado
- Control Center único em `http://127.0.0.1:8791/control`.
- Estado agregado de Runtime/OpenAI/CRM/Blue Ocean/Browser QA.
- Histórico persistente de tarefas Builder/QA em `tasks.json`.
- Cancelamento e reexecução pelo painel.
- Pausa de novas execuções Builder/QA sem bloquear ASK/ANALYZE.
- Memória e atividade visíveis no painel.
- Visão explícita da allowlist e bloqueios permanentes.
- Formulários para iniciar QA e Builder pelo Control Center.
- Link para o Control Center nos drawers do CRM e Blue Ocean.

## Preservado
- Uma única identidade: RealTalent Agent.
- Memória compartilhada CRM + Blue Ocean.
- 6 tools CRM e 7 tools Blue Ocean.
- Builder restrito a `src/**`, backup, gates e rollback.
- Browser QA em loopback/CDP dedicado.
- Confirmação humana para escrita.

## Limite deliberado
“Pausar” bloqueia novas execuções Builder/QA. Não congela subprocessos já iniciados, porque isso seria inseguro com gates e processos-filho. Tarefas ativas devem ser canceladas explicitamente.
