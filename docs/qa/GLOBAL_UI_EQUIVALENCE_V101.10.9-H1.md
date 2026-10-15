# Global UI Equivalence — V101.10.9-H1

A H1 consolida folhas globais sem reescrever seletores ou declarações. Cada folha canônica contém o conteúdo integral das fontes históricas, na mesma ordem em que eram carregadas pelo `src/main.tsx`.

## Grupos canônicos

- `ui-foundation.css` ← `realtalent-ui-system-v10154.css` → `visual-rollout-v10155.css` → `visual-consistency-hotfix-v10156.css`
- `app-shell.css` ← `myday-lock-appbar-v10162.css`
- `workspace-ui.css` ← `workspace-ui-standardization-v10166.css` → `global-workspace-ui-consistency-v10167.css` → `workspace-interaction-architecture-v10168.css` → `global-filter-view-standard-v10169.css` → `workspace-simplification-filter-engine-v10170.css`
- `interaction-ui.css` ← `interaction-surfaces-v10172.css` → `ux-consolidation-v10173.css`
- `ui-polish.css` ← `design-system-consolidation-v10198.css` → `ux-recovery-v10199-h3.css` → `workspace-appearance-v10199-h4.css`
- `selection-controls.css` ← `selection-filter-system-v101105.css`

## Guardas de cascade

Contacts continua entre Foundation/App Shell e Workspace. Metrics continua entre Workspace e Interaction. RealTalent Connect continua antes do polish final. Selection Controls continua depois do Garimpo UX e antes de Contact Intelligence.

## Escopo

Esta é uma consolidação estrutural de CSS. Não é uma validação pixel-perfect de navegador. A equivalência nesta entrega é garantida por preservação integral de fonte, ordem de cascade e regressão dos contratos existentes. A comparação visual automatizada pode ser adicionada quando o build/browser real estiver disponível no ambiente de QA.
