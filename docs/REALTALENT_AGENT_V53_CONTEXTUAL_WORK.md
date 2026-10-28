# RealTalent Agent V5.3 — Conversa, criação, pesquisa e memória contextual

This branch resolves the actual user failure "Consegue personalizar com o contexto de jardinagem?" on an existing Script Studio output.

## Delivered in code
1. Script output creates an identifiable **active work document**, with full body and up to 20 versions, scoped to the authenticated user and workspace.
2. Explicit follow-up and a short LLM intent classifier recognize revisions, and route to the Ollama revision endpoint instead of the CRM action planner.
3. Ollama revision preserves prior document, uses relevant permitted Playbook excerpts and focused lead context, and returns a revised body. When unavailable it shows a truthful warning and does **not** invent a successful edit.
4. UX indicates which document is active, whether memory is local or cloud, revision count, restore previous version, and end work.
5. Quality checks flag placeholder fields, unchanged documents and unsupported "I researched" claims.
6. Existing V5.2 SearXNG research and source handling remain optional and must not be called a verified web search when disabled.
7. Migration for user-private Supabase working documents is included but **not applied** to any database.

## Preconditions for cross-device memory
Apply the staged migration **only after testing RLS** for anon/user-A/user-B and applying it to a non-production project first. The frontend detects if the table is missing and keeps work locally. This is local-first until database migration is applied. No service_role key in frontend.

## Boundaries
- Retrieval currently supports keyword-ranked authorized CRM Playbooks and focused lead facts. Full semantic vector ingestion (PDF, embeddings and pgvector) is **not claimed** in this increment; requires document import, chunking, embed model choice, access policies and source readback.
- Ollama rewrite service is loopback-only; Vercel preview runs the existing frontend but cannot reach the local endpoint without an authenticated gateway deployment.
- No remote browsing without the previously configured SearXNG research adapter.
- No CRM mutations are performed in the document revision tool.
- The branch does not merge or change production, Railway, or Supabase.

## Required acceptance
- User creates a script, says "Consegue personalizar com o contexto de jardinagem?", receives edited text and revision count increments.
- Ask "deixe mais consultivo" next; then restore previous version and verify full body.
- Ask "quais negócios estão em risco?" while a script is active; Agent must NOT rewrite.
- Disconnect Ollama: original text preserved, honest error without spurious claim.
- Change workspace/user: previous work must not be visible.
- Once migration exists in test DB, verify persistence across devices. Test RLS isolation, anonymous denial and user-owned updates.
- Confirm Vercel/Firefox interaction, multi-request race behavior, Qwen models and source accuracy before production.
