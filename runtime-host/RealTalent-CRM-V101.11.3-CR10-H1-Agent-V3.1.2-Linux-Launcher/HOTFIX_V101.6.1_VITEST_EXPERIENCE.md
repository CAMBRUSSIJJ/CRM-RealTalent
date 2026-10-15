# V101.6.1 — Vitest Experience Compatibility Hotfix

Corrige a migração de preferências antigas do Meu Dia para a arquitetura Meu Dia 3.0.

- `hero` legado passa a `day` (Central do dia).
- `health` legado passa a `day-health` (Resumo do dia).
- `day` continua obrigatório e não pode ser ocultado por preferências antigas.
- `day-health` continua opcional, preservando a intenção de usuários que ocultavam Saúde comercial.
- O teste `experience-context.test.ts` passa a validar a migração atual, não IDs removidos da UI.
