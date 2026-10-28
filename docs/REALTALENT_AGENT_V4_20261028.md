# RealTalent Agent V4.0 — semantic core (initial slice)

Branch: feat/realtalent-agent-v4-semantic-core-20261028, based on fix/ui-stability-functional-qa-20261028.

## Implemented
1. Read-only, grounded queries that are unambiguous can return immediately from the CRM snapshot without waiting up to 120s for Ollama. Mutating or compound requests never use this shortcut; they continue to the tool planner with all existing permissions/confirmation requirements.
2. The operational firewall does not misclassify an explicit question as an attempted write solely due to words like "ligar". The existing model-based interpretation remains the fallback for ambiguous requests.
3. Model plans are rejected **as a whole** if they contain unknown/guided tools, duplicated IDs, >8 steps, no steps when marked executable, unresolved clarifications, or low-confidence write operations. No silent partial execution.
4. Conversation context now retains up to six bounded turn pairs in per-workspace sessionStorage. This is **temporary**, not durable cross-device memory; the existing CRM is still the sole source of facts.
5. Added deterministic Vitest cases, including Portuguese read vs write intent, plan integrity and bounded chat context. Isolated V4 workflow runs typecheck, tests and bundle.

## Still needed before production
- Actual Ollama test with REALTALENT_OLLAMA_E2E=1 and a connected gateway, including model quality/latency.
- Authenticated browser flows for 17 areas, complex multi-operation requests, permissions and readbacks.
- Durable memory needs an explicit access-controlled repository design and privacy/data-retention review; no new Supabase migration was deployed.
- Separate QA for operations requiring human review, external messages or high-risk changes.
