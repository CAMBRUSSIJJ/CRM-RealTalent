# V101.7.1 Hotfix 1 — Linux preflight / Calling experience selector

Corrige o contrato de personalização/experiência usado pelo preflight Linux após o redesenho estrutural de Ligações da V101.7.1.

## Causa

O registro de experiência ainda apontava para a classe removida `.calls-operation-kpis-v10171`, enquanto a V101.7.1 renderiza os KPIs dentro de `.calls-command-center-v10171__kpis`.

## Correção

- `src/features/experience/experience-registry.ts`
  - antes: `.calls-operation-kpis-v10171`
  - agora: `.calls-command-center-v10171__kpis`
- Nenhuma alteração de layout, dados, migrations ou comportamento comercial.
- O alvo do registro volta a corresponder a um elemento TSX realmente renderizado.
