# RealTalent CRM V101.10.9 — CSS & Design System Consolidation

V101.10.9 begins the CSS debt reduction phase without redesigning the CRM or changing business logic.

## Delivered

- canonical `src/styles/pipeline.css` replaces two Pipeline runtime layers;
- canonical `src/styles/followups.css` replaces two Follow-ups runtime layers;
- canonical `src/styles/realtalent-connect.css` replaces five Connect runtime layers;
- old versioned files remain in the repository for audit and rollback, but are no longer loaded at runtime for those domains;
- runtime CSS imports in `src/main.tsx` drop from 74 to 68;
- `qa/css-legacy-allowlist.json` freezes existing versioned CSS debt;
- `npm run css:inventory` inventories files, imports and selector duplication;
- `npm run css:governance` blocks new version-suffixed CSS debt and validates canonical source order;
- registry-independent build now follows `src/main.tsx` CSS order and excludes superseded runtime files.
- the Node runtime orchestrator now identifies V101.10.9 explicitly, recognizes V101.10.8 as its predecessor, and will not reuse a stale V101.10.8 `dist`.

## Inventory baseline

At release creation the repository contains 101 CSS files, including 93 historical version-suffixed files. The runtime entrypoint directly imports 68 stylesheets. The heuristic inventory reports 1,415 selectors defined in more than one CSS file; this is a debt map, not a claim that all are bugs.

## Compatibility

No CSS selector or declaration was intentionally rewritten in the three migrated domains. Canonical files embed the historical source content in the same order. No data/schema/API changes were introduced.

## Deferred

Contacts, workspace/global surfaces, Calls and Prospecting are not consolidated in this release because their cascade is more interdependent and requires a dedicated visual regression pass.
