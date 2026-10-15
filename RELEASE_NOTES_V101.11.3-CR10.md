# V101.11.3-CR10 — Supabase Staging Bootstrap & Validation

CR10 turns the remaining staging hard stop into a reproducible operational flow rather than another static gate.

## Added

- `.env.cr10.example` for a staging-only Supabase project.
- `staging-linux.sh` as a one-step Linux entrypoint.
- `staging:cr10:migrations`: project link, migration history, mandatory dry-run, guarded remote push and remote DB lint.
- Optional staging `config push` and Edge Functions deploy.
- Idempotent Auth Admin bootstrap for synthetic Admin, Gestor and Vendedor accounts.
- Workspace creation/reuse through `create_organization_with_defaults`.
- Real invitation/acceptance flow through `create_organization_invite` and `accept_organization_invite`.
- Explicit H22 profiles for manager and seller.
- `runtime:commercial-readiness:cr10` orchestrating migrations → accounts → CR2 Auth/RLS → CR3 commercial E2E.
- Sanitized CR10 evidence under `ops/evidence/`.

## Runtime independence improvement

CR2 and CR3 staging probes now use native HTTP `fetch` against Supabase Auth/PostgREST/RPC. They no longer need the Supabase JavaScript SDK to be installed merely to prove staging behavior.

## Remote safety

Migrations are never applied unless `CR10_APPLY_MIGRATIONS=YES_APPLY_STAGING`. `db reset --linked` and automatic `migration repair` are intentionally excluded.

## Current state

The CR10 static gate is PASS, while real staging remains BLOCKED in this execution environment because no Supabase account secrets/project credentials are present. No remote PASS is fabricated.
