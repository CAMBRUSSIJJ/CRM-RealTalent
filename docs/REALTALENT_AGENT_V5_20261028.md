# RealTalent Agent V5.0 — Cognitive Tools Foundation (2026-10-28)

The new V5 orchestrator adds:
- Safe read-only routing with a hard mutating-intent veto; CRM changes still use the existing permission-gated capability planner and verified receipts.
- Deterministic calculation + script composition, preserving both results instead of silently returning only the first tool.
- CRM fact relevance ranking limited to a focused lead that belongs to the current user or is visible to owner/admin. Grounding uses existing buildCommercialMemory.
- Optional Ollama script refinement through POST /tools/generate-script, with 10s timeout, structural checks, and deterministic fallback.
- No arbitrary code execution, WhatsApp sending, or side effects when generating content.
- Integration into the existing Assistant without another UI panel.

## Operational limits
The Ollama endpoint needs the matching local runtime upgrade before generative refinement becomes available; until then, Script Studio uses the local structured fallback. This does not implement full LLM tool calling or durable cross-device RAG. Persistent memory requires an access-controlled repository and explicit retention policy.

## Checks
npm ci && npm run typecheck && npx vitest run src/services/realtalent-agent-v5-cognitive.test.ts && npm run build.
Verify authorization, request routing, browser behavior, script review, and production access controls before merging.
