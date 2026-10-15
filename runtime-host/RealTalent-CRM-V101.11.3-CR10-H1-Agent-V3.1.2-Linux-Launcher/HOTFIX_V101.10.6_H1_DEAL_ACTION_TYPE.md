# V101.10.6-H1 — Deal Action Type Hotfix

Correção pontual de TypeScript em `src/features/leads/lead-details-drawer.tsx`.

## Causa
A linguagem visível foi padronizada para “pessoa”, mas o discriminante interno de `DealActionKind` continua sendo `map_stakeholder`. Um `if` foi renomeado indevidamente para `map_pessoa`, produzindo TS2367.

## Correção
`action.kind === 'map_pessoa'` → `action.kind === 'map_stakeholder'`.

Nenhuma mudança de UX, banco, Garimpo, Account/Conta 360 ou comportamento comercial.
