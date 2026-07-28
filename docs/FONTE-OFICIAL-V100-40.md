# Fonte oficial — RealTalent CRM V100.40

A única fonte oficial desta versão é o código React + TypeScript + Vite presente em `src/`, com banco, RPCs e Edge Functions em `supabase/`.

O módulo Central de Extensões está em:

- `src/features/settings/extension-center-panel.tsx`
- `src/services/integration-framework.ts`
- `supabase/migrations/202607270001_v100_40_extension_center.sql`
- `supabase/functions/extension-register/index.ts`
- `supabase/functions/extension-ingest/index.ts`
- `extension-sdk/`

Arquivos HTML compilados, quando gerados, são artefatos de distribuição e nunca devem ser editados como fonte.
