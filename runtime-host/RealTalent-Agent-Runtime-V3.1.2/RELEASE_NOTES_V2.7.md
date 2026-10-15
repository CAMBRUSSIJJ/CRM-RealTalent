# Release Notes — RealTalent Agent V2.7

## Advanced Reasoning & Planning

A V2.7 evolui o cérebro compartilhado da RealTalent Agent sem adicionar novas mutações de negócio ao CRM ou ao Blue Ocean. O novo pipeline é **Planner → Executor → Critic → Finalizer**, ativado apenas quando complexidade, evidência ou política justificam o custo.

### Adicionado
- `advanced-reasoning.mjs` com classificação de tarefa de raciocínio.
- critérios de sucesso explícitos antes da execução.
- hipóteses concorrentes curtas para diagnóstico, comparação e decisão.
- checkpoints de evidência e verificação de contradições.
- replanejamento adaptativo limitado a **1** tentativa.
- endpoint `POST /advanced-reasoning/classify`.
- CLI `raciocinio-agent.sh` / `reasoning-agent-linux.sh`.
- resumo público de raciocínio operacional em metadata, sem cadeia de pensamento.
- caso permanente de regressão para comparação profunda no dataset de Learning & Evaluation.

### Privacidade cognitiva
A V2.7 **não armazena e não expõe cadeia de pensamento**. Os únicos artefatos persistíveis/observáveis são objetivo, critérios de sucesso, rótulos curtos de hipóteses, evidências necessárias, etapas operacionais, checkpoints e resultado do Finalizer.

### Preservado
- Tool-First e App Context Bridge V2.2.
- Intelligence Core V2.3.
- Memory & Knowledge/RAG V2.4.
- Multimodal Intelligence V2.5.
- Failure Memory, Regression Dataset e Release Gate V2.6.
- integrações existentes de CRM e Blue Ocean sem nova ação de escrita.

### Validação principal
- Runtime contract audit: **275/275 PASS**.
- Advanced Reasoning Core: **9/9 PASS**.
- V2.7 integration: **8/8 PASS**.
- Runtime self-tests MJS: **32/32 PASS**.
- Reliability Benchmark full: **1000/1000 (100%) PASS**.
- Known-Failure Regression: **PASS**.
- CRM V2.7 integration: **5/5 PASS**.
- Blue Ocean V2.7 integration: **5/5 PASS**.
- TypeScript parser (`tsc --noEmit --noCheck`): **PASS** nos dois produtos.
- Shell syntax: **84/84 PASS**.
- MJS syntax: **516/516 PASS**.
- Python compile: **18/18 PASS**.
- Browser QA self-test: **PASS**.
- Deep Visual QA: **PASS**.
- Builder sandbox self-test: **PASS**.

### Limitações não mascaradas
- Browser Conversation E2E: **UNVERIFIED neste ambiente** porque o Chromium administrado bloqueia `localhost` com `ERR_BLOCKED_BY_ADMINISTRATOR` antes de a aplicação carregar.
- `vite build`, Vitest e typecheck semântico completo de CRM/Blue Ocean: **UNVERIFIED neste pacote**, pois os fontes distribuídos não incluem `node_modules`. O parser TypeScript sem checagem semântica passou.
