# V101.1.0 — Consolidation & Runtime QA

## Objetivo
Congelar a expansão funcional e consolidar a base V101 antes de novas features.

## Correções
- `BACKUP_SCHEMA_VERSION` restaurado em `100.54`.
- Gates históricos adaptados para reconhecer V101 como sucessora de V100.
- Gate V100.79 ajustado para a troca intencional de CARTO por OpenStreetMap/Leaflet na V101.
- README volta a registrar explicitamente V100.92 e V100.93.

## Release gate
O launcher Linux agora exige:
- auditorias sintáticas e de integração;
- integridade de migrations;
- gates históricos;
- gate V101.1;
- TypeScript typecheck;
- Vitest;
- build Vite;
- auditoria de `dist`;
- smoke HTTP do build.

A aplicação só é aberta após aprovação do gate.
