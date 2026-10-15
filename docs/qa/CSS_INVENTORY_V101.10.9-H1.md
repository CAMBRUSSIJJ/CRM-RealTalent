# CSS Inventory — V101.10.9-H1

- CSS files in repository: **111**
- CSS bytes in repository: **1,586,499**
- Direct runtime imports in src/main.tsx: **56**
- Version-suffixed legacy CSS files: **93**
- Cross-file duplicated selectors (heuristic): **3112**
- Canonicalized in this release: **pipeline.css, followups.css, realtalent-connect.css, ui-foundation.css, app-shell.css, workspace-ui.css, interaction-ui.css, ui-polish.css, selection-controls.css**

## Runtime import order

1. `core-v100.css`
2. `dashboard-v100.css`
3. `leads-v100.css`
4. `pipeline.css`
5. `followups.css`
6. `calls-v100.css`
7. `agenda-v100.css`
8. `goals-v100.css`
9. `metrics-v100.css`
10. `automations-v100.css`
11. `prospecting-v100.css`
12. `settings-v100.css`
13. `calendar-integration-v10084.css`
14. `whatsapp-v10085.css`
15. `communications-v10086.css`
16. `legacy-overrides-v100.css`
17. `motion-system.css`
18. `actions-system.css`
19. `experience-system.css`
20. `help-center-v10091.css`
21. `full-page-audit-v10093.css`
22. `omnichannel-v10094.css`
23. `workspace-personalization-v10095.css`
24. `guided-selling-help-v10096.css`
25. `product-revenue-v10097.css`
26. `prospecting-engine-v10098.css`
27. `workspace-layout-studio-v100981.css`
28. `calls-v100982.css`
29. `calls-v1012.css`
30. `unified-sales-workspace-v1013.css`
31. `lead-workspace-v1015.css`
32. `ui-runtime-accessibility-v10152.css`
33. `performance-repository-v10153.css`
34. `visual-intelligence-v10099.css`
35. `territory-ui-system-v101.css`
36. `ui-foundation.css`
37. `contact-record.css`
38. `app-shell.css`
39. `contacts.css`
40. `workspace-ui.css`
41. `workspace-metrics-calling-convergence-v10170-h4.css`
42. `metrics-calling-structural-redesign-v10171.css`
43. `interaction-ui.css`
44. `realtalent-connect.css`
45. `ui-polish.css`
46. `settings-experience-v10110.css`
47. `prospecting-search-automation-v101101.css`
48. `prospecting-agent-v101102.css`
49. `prospecting-review-v101103-h7.css`
50. `prospecting-search-ontology-v101103-h8.css`
51. `prospecting-territory-engine-v101103-h9.css`
52. `prospecting-local-discovery-v101104.css`
53. `prospecting-ux-consolidation-v101106.css`
54. `selection-controls.css`
55. `contact-intelligence.css`
56. `prospecting-search-processing-v101103.css`

## Most repeated selectors across files

- `@media(max-width:760px)` — 20 files: src/styles/account-360.css, src/styles/account-intelligence.css, src/styles/calendar-integration-v10084.css, src/styles/calls-v10070.css, src/styles/commercial-map-v10079.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/guided-selling-help-v10096.css…
- `:root` — 18 files: src/styles/calls-ui-standard-v10071.css, src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/experience-system.css, src/styles/interaction-surfaces-v10172.css, src/styles/interaction-ui.css, src/styles/motion-system.css…
- `@media(max-width:1180px)` — 16 files: src/styles/app-shell.css, src/styles/calls-v10069.css, src/styles/deal-intelligence-v10062.css, src/styles/global-workspace-ui-consistency-v10167.css, src/styles/guided-selling-help-v10096.css, src/styles/legacy-overrides-v100.css, src/styles/metrics-calling-structural-redesign-v10171.css, src/styles/myday-lock-appbar-v10162.css…
- `@media(max-width:720px)` — 16 files: src/styles/contact-record.css, src/styles/contact-views-v10163.css, src/styles/contacts-experience-completion-v10161.css, src/styles/contacts-views-record-v1016.css, src/styles/contacts.css, src/styles/deal-intelligence-v10062.css, src/styles/global-filter-view-standard-v10169.css, src/styles/interaction-surfaces-v10172.css…
- `}
@media(max-width:720px)` — 12 files: src/styles/app-shell.css, src/styles/contact-data-grid-view-settings-v10164.css, src/styles/contacts.css, src/styles/global-workspace-ui-consistency-v10167.css, src/styles/interaction-ui.css, src/styles/myday-lock-appbar-v10162.css, src/styles/ui-foundation.css, src/styles/ux-consolidation-v10173.css…
- `.sidebar` — 11 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css…
- `@media(max-width:1100px)` — 11 files: src/styles/calendar-integration-v10084.css, src/styles/calls-v100982.css, src/styles/contact-record.css, src/styles/contacts-experience-completion-v10161.css, src/styles/deal-intelligence-v10062.css, src/styles/interaction-ui.css, src/styles/legacy-overrides-v100.css, src/styles/omnichannel-v10094.css…
- `@media(max-width:900px)` — 11 files: src/styles/calls-v10069.css, src/styles/deal-intelligence-v10062.css, src/styles/global-filter-view-standard-v10169.css, src/styles/legacy-overrides-v100.css, src/styles/omnichannel-v10094.css, src/styles/realtalent-connect-v1018.css, src/styles/realtalent-connect-v10181.css, src/styles/realtalent-connect.css…
- `@media(max-width:980px)` — 11 files: src/styles/coaching-playbooks-v10065.css, src/styles/commercial-map-v10079.css, src/styles/contact-record.css, src/styles/contacts-experience-completion-v10161.css, src/styles/contacts-views-record-v1016.css, src/styles/help-center-v10091.css, src/styles/legacy-overrides-v100.css, src/styles/settings-v100.css…
- `.app-content` — 10 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/experience-system.css, src/styles/full-page-audit-v10093.css, src/styles/leads-v100.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css…
- `.modal-backdrop` — 10 files: src/styles/calls-v100.css, src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/experience-system.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css…
- `}
@media (max-width: 760px)` — 10 files: src/styles/automations-v100.css, src/styles/calls-focus-simplification-v100731.css, src/styles/calls-intelligence-workspace-v10072.css, src/styles/followups-v100.css, src/styles/followups-v10077.css, src/styles/followups.css, src/styles/metrics-v100.css, src/styles/pipeline-v100.css…
- `select` — 10 files: src/styles/contact-intelligence-v101105-h3.css, src/styles/contact-intelligence.css, src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/full-page-audit-v10093.css, src/styles/motion-system.css, src/styles/selection-controls.css, src/styles/selection-filter-system-v101105.css…
- `.button` — 9 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/full-page-audit-v10093.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css…
- `.field select` — 9 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/selection-controls.css, src/styles/selection-filter-system-v101105.css, src/styles/ui-foundation.css…
- `.icon-button` — 9 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/full-page-audit-v10093.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css…
- `.panel` — 9 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/full-page-audit-v10093.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css…
- `.sidebar__collapse` — 9 files: src/styles/core-v100.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css…
- `.sidebar__group-label` — 9 files: src/styles/core-v100.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css…
- `.sidebar__item` — 9 files: src/styles/core-v100.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css…
- `.sidebar__item.is-active` — 9 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css…
- `.sidebar__profile` — 9 files: src/styles/core-v100.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css…
- `}
@media(max-width:980px)` — 9 files: src/styles/app-shell.css, src/styles/contact-data-grid-view-settings-v10164.css, src/styles/contacts.css, src/styles/myday-lock-appbar-v10162.css, src/styles/ui-foundation.css, src/styles/visual-rollout-v10155.css, src/styles/workspace-layout-studio-v100981.css, src/styles/workspace-ui-standardization-v10166.css…
- `body` — 9 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css…
- `select:focus-visible` — 9 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/selection-controls.css, src/styles/selection-filter-system-v101105.css, src/styles/ui-foundation.css, src/styles/ui-polish.css…
- `.app-shell__main` — 8 files: src/styles/core-v100.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/workspace-appearance-v10199-h4.css, src/styles/workspace-layout-studio-v100981.css
- `.button--primary` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/visual-consistency-hotfix-v10156.css
- `.button--primary:hover` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/visual-consistency-hotfix-v10156.css
- `.modal` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ui-runtime-accessibility-v10152.css
- `.page-stack` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/full-page-audit-v10093.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css
- `.sidebar__brand` — 8 files: src/styles/core-v100.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css, src/styles/workspace-appearance-v10199-h4.css
- `.sidebar__brand-copy span` — 8 files: src/styles/core-v100.css, src/styles/design-system-v101.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css, src/styles/workspace-appearance-v10199-h4.css
- `.sidebar__brand-copy strong` — 8 files: src/styles/core-v100.css, src/styles/design-system-v101.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css, src/styles/workspace-appearance-v10199-h4.css
- `.sidebar__more-toggle` — 8 files: src/styles/core-v100.css, src/styles/full-page-audit-v10093.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css, src/styles/workspace-appearance-v10199-h4.css
- `.sidebar__more-toggle.is-open` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css, src/styles/ux-recovery-v10199-h3.css, src/styles/visual-consistency-hotfix-v10156.css, src/styles/workspace-appearance-v10199-h4.css
- `.status-pill` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/legacy-overrides-v100.css, src/styles/motion-system.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css
- `.toolbar-card` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/full-page-audit-v10093.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css
- `.topbar__title h1` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/full-page-audit-v10093.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css
- `.topbar__title p` — 8 files: src/styles/core-v100.css, src/styles/design-system-consolidation-v10198.css, src/styles/design-system-v101.css, src/styles/full-page-audit-v10093.css, src/styles/legacy-overrides-v100.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css, src/styles/ui-polish.css
- `@media (max-width: 1100px)` — 8 files: src/styles/calls-focus-simplification-v100731.css, src/styles/calls-intelligence-workspace-v10072.css, src/styles/core-v100.css, src/styles/goals-v100.css, src/styles/pipeline-v10076.css, src/styles/pipeline.css, src/styles/realtalent-ui-system-v10154.css, src/styles/ui-foundation.css

## Policy

Version-suffixed CSS is frozen as legacy debt. New visual work must use canonical, versionless stylesheets or existing design-system primitives. Existing legacy files may only leave the runtime after equivalence checks and regression gates pass.
