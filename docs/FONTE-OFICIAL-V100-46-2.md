# Fonte oficial — V100.46.2

A fonte oficial do RealTalent CRM permanece em `src/`, usando React, TypeScript e Vite.

O Mapa de Leads é composto por:

- `src/features/commercial-map/commercial-map-page.tsx`: ponte autenticada com o CRM;
- `public/commercial-map-runtime.js`: experiência cartográfica e operações do mapa;
- `src/services/geocoding.ts`: regras locais e classificação de precisão;
- `supabase/migrations/202607280004_v100_46_2_lead_map.sql`: fila, histórico, RLS e configurações;
- `supabase/functions/geocode-lead`: solicitação autenticada;
- `supabase/functions/lead-geocode-worker`: processamento de fila;
- `supabase/functions/maps-diagnostics`: diagnóstico por workspace.

Os HTMLs da raiz são artefatos gerados e não podem substituir o código-fonte.
