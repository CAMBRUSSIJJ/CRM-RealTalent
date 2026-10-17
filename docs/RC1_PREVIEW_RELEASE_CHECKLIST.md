# RealTalent CRM — RC1 Preview Foundation

Source baseline: `12f222e831c797f94b5a6111b7cae68c1e0be102` (raw-source human review).
Release is **PREVIEW-ONLY**. Do not promote Production without sign-off.

## Included fixes
- Keep the human review of raw web sources integrated with the CRM review queue.
- Stop rapid 1-second Garimpo polling; refresh at most every 4s during a running job and every 20s otherwise.
- Suspend polls for background browser tabs, refresh upon focus, and block overlapping polls.
- Allow 12 seconds for the initial Garimpo health check.
- Map Vercel Deployment Protection HTML/login responses to a distinct JSON service error.
- Run CI gates on the release branch, including typecheck and Vite production bundle build.

## Known blockers before Production
- CRM Preview proxy requires a **verified** non-interactive authentication method to reach the protected separate Vercel Garimpo Service. A missing `VERCEL_AUTOMATION_BYPASS_SECRET` (or equivalent supported protection-bypass configuration) can block requests. Do not copy share URLs or bypass tokens into public client code. Verify with an authenticated user session.
- Source triage decisions `rawSourceDecisions` currently persist **locally per browser** and are not a server-synchronized team workflow.
- Runtime job state primarily lives in a Vercel Sandbox and snapshots, not a durable multitenant queue/database; sudden outages or snapshot expiry can affect history.
- Supabase Preview and Production may point to the **same live database**. Never use test delete/mutations against real records. Prepare a staging database before destructive end-to-end checks.
- Do not enable WhatsApp/e-mail sending or duplicate automation schedulers on Preview without isolation.

## Manual acceptance checklist (must use a real browser/user account)
1. Login, logout, permissions (ordinary salesperson vs administrator).
2. Prospecting — open real map, draw a polygon with the mouse, preview territory, submit a job.
3. Fetch results incrementally, inspect raw/rejected sources, promote one manually, reject one.
4. Refresh page and verify status; repeat in a second browser to detect local-only state.
5. Approve selected company, send to CRM, verify Contact/Company records and permissions.
6. Create a task from Agent, ensure it appears in Agenda, Meu Dia, and Tasks once.
7. Update Pipeline stage and owner, refresh, and verify Supabase persisted values.
8. Communication send/retry/receive without duplicates using a safe test account.
9. Check production URL remains unchanged and do not promote Preview.

Release CI is necessary, **not sufficient**, for Production approval.
