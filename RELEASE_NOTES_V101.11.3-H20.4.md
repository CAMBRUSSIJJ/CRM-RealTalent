# RealTalent CRM V101.11.3-H20.4 — Proposals & Prospecting Cohesion

Base funcional: **V101.11.3-H19.13 — WhatsApp Work Management**  
Base visual: **V101.11.3-H20.3 — Global UI & Product Cohesion**

## Objetivo

Aplicar a fundação H20 às duas maiores dívidas visuais restantes identificadas na auditoria: **Propostas** e **Garimpo**, eliminando linguagens paralelas de header/KPI/navegação e reduzindo concorrência de CSS sem alterar a lógica comercial existente.

## H20.4 — Propostas

- `WorkspacePageHeader` substitui o header V101.6.6 específico da página.
- `WorkspaceSummaryStrip` + `WorkspaceSummaryMetric` substituem o resumo proprietário.
- `WorkspaceViewStrip` passa a controlar Propostas / Buyer Rooms / Catálogo / Receita realizada / Revenue Intelligence.
- `WorkspaceCommandBar` + `WorkspaceCommandGroup` passam a organizar busca, filtros, classificação e modo Cards/Lista.
- Filtros avançados, seleção em massa, Buyer Rooms, Catálogo, Revenue Intelligence e criação/edição de propostas são preservados.
- Cards e painéis usam borda/radius/sombra da fundação H20.

### CSS de Propostas

Quatro folhas carregadas pela feature deixaram de ser injetadas de forma lazy:

- `proposal-experience-v10060.css`
- `proposals-v10078.css`
- `proposals-v10081.css`
- `proposal-catalog-operational.css`

A ordem histórica foi preservada em um único owner canônico:

- `proposals-workspace.css`

Os arquivos históricos continuam no fonte para auditoria/rollback, mas **não são mais runtime-owned pela página de Propostas**.

## H20.4 — Garimpo

- `WorkspacePageHeader` substitui `toolbar-card` como cabeçalho principal.
- `WorkspaceSummaryStrip` substitui a grade própria de métricas.
- `WorkspaceViewStrip` controla Buscar / Local / Revisar / Histórico.
- Importar / Mais ações / Nova busca ficam no mesmo padrão de actions do restante do CRM.
- Busca, mapa local, revisão por exceção, revisão guiada, histórico e integração com CRM permanecem intactos.
- Metadados de revisão antes abaixo de 10px recebem piso tipográfico H20.
- Painéis de campanha, revisão, resultados, histórico e Local convergem para border/radius/surface canônicos.

## Cascade guard

O runtime de coesão foi promovido para `H20.4`. Durante a validação foi corrigida uma divergência real: o `dataset` já era H20.4, mas os seletores internos do cascade guard ainda apontavam para H20.3. O gate H20.4 agora bloqueia essa inconsistência.

## Preservado

- H19.13 WhatsApp Work Management / Pure Chat.
- H20.1 Design System Truth.
- H20.2 CSS Cascade Recovery.
- H20.3 Global Workspace Shell.
- 54 migrations; nenhuma migration nova.
- Repositórios Local e Supabase.
- Contratos históricos de Propostas/Catálogo e Garimpo.

## Limitação conhecida herdada

`runtime:prospecting-search` continua falhando no cenário de fallback de área com `completed/0` quando o smoke espera 2 resultados. A mesma falha foi reproduzida diretamente na **H20.3 original**, portanto não é regressão introduzida pela H20.4. Outros smokes do motor (Engine, Drawn Territory, Local Discovery e Strict Scope) passam.

## Build oficial

A instalação de dependências (`npm ci`) não concluiu neste ambiente e não criou `node_modules`. Assim:

- `typecheck`: **BLOCKED** — React/Supabase/tipos ausentes.
- `vitest`: **BLOCKED** — `vitest: not found`.
- `vite build`: `validate:env` PASS; build **BLOCKED** — `vite: not found`.

O build registry-independent percorreu **303 módulos**. O `dist` fallback foi rejeitado pelo bundle audit por `HTML legado reapareceu` e removido antes do empacotamento.
