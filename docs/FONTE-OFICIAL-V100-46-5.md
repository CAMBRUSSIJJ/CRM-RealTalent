# Fonte oficial — V100.46.5

A fonte oficial do CRM está em `src/`. O build de produção é criado por `scripts/build-registry-independent.mjs` e publicado em `dist/`.

A Central de Ligações está em:

- `src/features/calls/calls-page.tsx`;
- `src/features/calls/call-session-preparation-modal.tsx`;
- `src/features/calls/call-workspace-modal.tsx`;
- `src/services/call-display-preferences.ts`;
- `src/services/realtalent-connect.ts`.

A integração de banco do RealTalent Connect está em `supabase/migrations/202607280005_v100_46_5_connect_call_sessions.sql`.
