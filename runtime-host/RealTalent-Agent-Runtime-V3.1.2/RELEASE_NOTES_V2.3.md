# Release Notes — RealTalent Agent V2.3 Intelligence Core

## Adicionado
- Intelligence Core V2.3.
- Complexity Classifier Instant / Standard / Deep.
- Cognitive Model Router Fast / General / Reasoning / Coder / Vision.
- Context Engine relevance + recency.
- Verifier/Critic com reparo seletivo.
- Reference Resolver com estado `unresolved`.
- Endpoints `/intelligence-core` e `/intelligence-core/classify`.
- `v2.3-selftest.mjs` e `intelligence-core-selftest.mjs`.

## Melhorado
- `/agent` e `/chat` agora compartilham o mesmo plano cognitivo.
- Tarefas deep recebem orçamento de contexto/resposta maior e verificação.
- Mudanças de assunto deixam de carregar histórico irrelevante.
- Pedidos de código podem selecionar o Coder; tarefas complexas usam Reasoning.
- Vision não é simulada quando o modelo visual não está configurado.

## Preservado da V2.2
- Tool-First server-side.
- App Context Bridge.
- Native app tools.
- Histórico com renomear/arquivar/excluir/limpar.
- Memórias Conversation / Project / Operational.
- Commercial Readiness e Evidence Gate.

## Limitações conhecidas
- RAG/embeddings/reranker ainda não fazem parte da V2.3.
- O Browser Conversation E2E não pôde ser reexecutado neste ambiente final porque o Chromium do sistema bloqueia loopback por política administrativa. O gate estrutural e de gateway permaneceu verde; o bloqueio é externo e foi registrado como UNVERIFIED nesta release.
