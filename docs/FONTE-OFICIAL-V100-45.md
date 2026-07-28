# Fonte oficial — V100.45

A fonte oficial do RealTalent V100.45 é o projeto React + TypeScript + Vite desta pasta. `dist/` e os HTMLs standalone são artefatos gerados e não devem ser editados manualmente.

A fundação oficial de integrações está em `src/services/integration-framework.ts`, `src/features/settings/integration-framework-panel.tsx`, nas Edge Functions específicas por provedor e na migration `202607280002_v100_45_integration_foundation.sql`.

As tabelas antigas `integration_connections` e `integration_events` permanecem somente para preservação histórica. O frontend, as filas e as novas gravações utilizam exclusivamente `integration_connected_accounts`, `integration_sync_jobs`, `integration_sync_attempts`, `integration_diagnostics` e `integration_audit_events`.
