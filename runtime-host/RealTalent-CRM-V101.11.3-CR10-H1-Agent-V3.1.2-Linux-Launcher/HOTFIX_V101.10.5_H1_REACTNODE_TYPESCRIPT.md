# RealTalent CRM V101.10.5-H1 — ReactNode TypeScript Hotfix

Base: V101.10.5 — Selection & Filter System.

## Correção

Corrige o typecheck em `src/features/prospecting/prospecting-page.tsx`:

- adiciona `type ReactNode` ao import de `react`;
- mantém `let mapPane: ReactNode` tipado explicitamente;
- elimina `TS2304: Cannot find name 'ReactNode'`;
- não altera lógica do Garimpo, mapa, Local Workspace, Selection System ou Territory Engine.

O semver interno permanece `101.10.5`; este pacote é um hotfix de compilação da mesma release.
