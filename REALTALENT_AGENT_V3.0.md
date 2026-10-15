# RealTalent Agent V3.0 — Intelligence Platform

Este aplicativo usa o mesmo gateway central da RealTalent. A V3.0 adiciona contratos estáveis de plataforma, capability registry, app adapter registry, model-role registry, execution profiles e policy engine.

- Não existe cérebro separado por aplicativo.
- App adapter contract: `realtalent-app-adapter-v3`.
- Escrita externa continua com `maxSilentWrites = 0`.
- V2.9 Long-Horizon Autonomous Workflows permanece como componente interno preservado.
- Execution Intelligence V2.8 permanece responsável por preview/confirm/receipt/postcondition.
- O app despacha ações no próprio domínio e devolve recibo + pós-condição ao gateway.
