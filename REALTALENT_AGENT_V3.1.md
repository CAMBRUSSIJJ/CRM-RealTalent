# RealTalent Agent V3.1 — Intelligence Quality

Este aplicativo usa o mesmo gateway central da RealTalent Intelligence Platform. A V3.1 melhora a qualidade percebida sem criar um cérebro separado por aplicativo.

- Platform kernel atual: `3.1`; contrato estável de integração: `3.0`.
- App adapter contract: `realtalent-app-adapter-v3`.
- Intelligence Quality: Natural Conversation, Context Precision 2.0, Reference Resolution 2.0 e Tool Selection 2.0.
- Memory/RAG: Semantic Memory conflict-aware + RAG 2.0 com thresholds dinâmicos e diversidade de fontes.
- Vision: Vision Understanding 2.0 preserva grounding visual e continuidade entre turnos.
- Latency Engine escolhe orçamento de resposta conforme complexidade.
- Escrita externa continua com `maxSilentWrites = 0`.
- V2.9 Long-Horizon Autonomous Workflows permanece como componente interno preservado.
- Execution Intelligence V2.8 permanece responsável por preview/confirm/receipt/postcondition.
- O app despacha ações no próprio domínio e devolve recibo + pós-condição ao gateway.
