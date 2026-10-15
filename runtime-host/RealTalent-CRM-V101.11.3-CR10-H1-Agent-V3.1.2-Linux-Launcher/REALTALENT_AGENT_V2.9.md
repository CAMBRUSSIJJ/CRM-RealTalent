# RealTalent Agent V2.9 — Long-Horizon Autonomous Workflows

Integração CRM com o mesmo gateway central em `127.0.0.1:8791`.

A V2.9 preserva Execution Intelligence V2.8, Advanced Reasoning & Planning V2.7, Learning & Evaluation V2.6, Multimodal Intelligence V2.5, Memory & Knowledge V2.4 e Grounded App Intelligence V2.2.

## Regras

- `maxSilentWrites = 0`; escrita continua exigindo confirmação explícita.
- Tarefas longas usam checkpoints persistentes.
- Etapas respeitam DAG de dependências.
- Heartbeat/lease detecta interrupção e muda para `recovery_required`, sem repetir cegamente uma escrita.
- Execuções podem ser pausadas e retomadas com limite de tentativas.
- Orçamento de autonomia impede trabalho indefinido.
- Ações irreversíveis nunca atravessam checkpoint automaticamente.
- Completion só ocorre após evidência/resultado de todas as etapas.
