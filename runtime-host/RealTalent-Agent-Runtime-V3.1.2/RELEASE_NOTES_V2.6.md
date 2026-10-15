# Release Notes — RealTalent Agent V2.6

## Adicionado
- Learning & Evaluation Intelligence.
- Failure Memory deduplicada e reabertura de regressões.
- Feedback explícito `Útil` / `Algo errado` no chat.
- Regression Dataset versionado com hash.
- Seeds de bugs históricos reais.
- Known-Failure Replay executado contra o gateway.
- Learning Release Gate.
- Comparação entre execuções, modelos/builds, novas falhas e falhas resolvidas.
- CLI `realtalent-agent.sh aprender ...`.
- Control Center com Failure Memory, dataset e learning gate.
- Response Verifier alimentando Failure Memory quando encontra/repara problemas.

## Melhorado
- Reliability Benchmark: 1.000 pontos agora também depende do replay das regressões conhecidas.
- Testes legados distinguem geração principal das chamadas internas do Verifier.
- Governança de baseline: aceitação continua explícita e auditada.

## Preservado
- V2.5 Multimodal Intelligence.
- V2.4 Memory & Knowledge / RAG.
- V2.3 Intelligence Core.
- V2.2 Grounded App Intelligence / Tool-First.
- CRM e Blue Ocean usam a mesma Agent central.

## Não adicionado
- Nenhuma nova mutação de negócio no CRM ou Blue Ocean.
- Nenhum fine-tuning automático.
- Nenhum aprendizado silencioso a partir de todo o histórico.
