# Release Notes — V2.9

## Adicionado
- Long-Horizon Autonomous Workflows.
- DAG de dependências de até 24 etapas.
- checkpoints persistentes por risco/capacidade.
- heartbeat + lease de executor.
- recuperação segura após interrupção (`recovery_required`).
- pausa/retomada persistente com limite de tentativas.
- orçamento temporal de autonomia.
- CLI `autonomia`.
- oitavo caso de Known-Failure Regression: escrita de tarefa longa precisa de checkpoint.

## Preservado
- Execution Intelligence V2.8.
- Advanced Reasoning V2.7.
- Learning & Evaluation V2.6.
- Multimodal V2.5, RAG V2.4, Intelligence Core V2.3 e Grounded App Intelligence V2.2.

## Limitações
- Browser Conversation E2E não pôde ser atestado neste ambiente por política administrativa do Chromium (`ERR_BLOCKED_BY_ADMINISTRATOR`).
- `vite build`/Vitest completos dos produtos não foram executados; `tsc --noEmit --noCheck` passou em CRM e Blue Ocean.
- A camada V2.9 não executa escrita de produto silenciosamente; apps continuam responsáveis por aplicar mutações e devolver evidência/recibo.
