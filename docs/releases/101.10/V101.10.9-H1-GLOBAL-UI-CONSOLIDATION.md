# RealTalent CRM V101.10.9-H1 — Global UI Consolidation

Hotfix estrutural da linha V101.10.9. Não altera regras de negócio, dados, integrações, schema ou fluxos funcionais.

## Adicionado
- `ui-foundation.css`: fundação visual canônica (UI system + rollout + consistency hotfix).
- `app-shell.css`: shell/topbar canônico preservando a camada V101.6.2.
- `workspace-ui.css`: workspace, command bar, filtros e interação consolidados.
- `interaction-ui.css`: superfícies interativas e UX consolidation.
- `ui-polish.css`: design-system consolidation, UX recovery e workspace appearance.
- `selection-controls.css`: controles de seleção canônicos.
- Gate `qa:v101.10.9:h1` com equivalência byte-preservada e ordem de cascade.

## Melhorado
- Imports CSS diretos em `src/main.tsx`: **68 → 59**.
- O build registry-independent deixa de anexar as folhas globais versionadas preservadas, evitando CSS duplicado no bundle alternativo.
- O inventário CSS passa a reconhecer nove folhas canônicas de runtime.

## Preservado
- Arquivos CSS históricos permanecem no repositório para rollback/auditoria.
- Ordem relativa do cascade em relação a Contacts, Metrics, Connect e Prospecting.
- Pipeline, Follow-ups e RealTalent Connect consolidados na V101.10.9.
- Nenhuma migration nova.

## Não feito nesta H1
- Nenhuma remoção física de CSS legado.
- Nenhuma renomeação de classes React/TSX.
- Nenhum redesign visual.
- Nenhuma alteração em Supabase, localStorage/IndexedDB ou integrações.

## QA adicional
- Architecture gate completo aprovado.
- CSS parser: 107 arquivos, 0 erros.
- Linux preflight: 354 TS/TSX.
- Selection System passou a ter gate próprio (`qa:v101.10.5:selection`), corrigindo uma colisão histórica de nome de script sem mudar a funcionalidade.
- Runtime da H1 reconhece a pasta V101.10.9 como predecessora preferencial para migrar estado local.

## Limitação do ambiente de build
O registry `registry.npmjs.org` não resolveu neste ambiente (`EAI_AGAIN`). Por isso não foi possível instalar as dependências reais. O `doctor` reporta lockfile inconsistente, dependências ausentes e build ausente; a recuperação automática de lockfile permanece ativa no launcher. O typecheck executado sem `node_modules` acusou módulos React/Supabase ausentes e não é tratado como regressão de fonte da H1.
