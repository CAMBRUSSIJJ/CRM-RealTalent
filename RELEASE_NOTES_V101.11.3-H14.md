# RealTalent CRM V101.11.3-H14 — Commercial Management Foundation

## Added
- Product Taxonomy 2.0: controlled categories + commercial type.
- Metric Registry with grouped, explainable CRM metrics.
- Goals 3.0 scope: Workspace / Team / User.
- Team goals roll up member production automatically.
- Team 360: Overview / Goals / People / Performance.

## Improved
- Goal creation now starts by choosing what the CRM will measure.
- Product category/type selection replaces free-text classification in primary product flows.
- Product deletion safety from H13 remains: used products cannot be hard-deleted.

## Database
- Migration 202610070004 adds products.commercial_type and goal scope/team fields.

## UX consistency
- Team member selection now uses clickable RealTalent-blue cards instead of native green checkboxes.
- New teams default to the RealTalent blue rather than the former green accent.
- Goals preserve quarter/year presets and explicitly explain workday-aware pace and projection.

## Validation
- H14 gate 28/28 PASS.
- qa:architecture PASS.
- Goals 2.0 regression 49/49, Teams & Tasks 42/42, Selection System 32/32.
- Linux preflight 371 TS/TSX.
- Official Vite/Vitest/typecheck remain dependency-blocked in this environment; see QA report.
