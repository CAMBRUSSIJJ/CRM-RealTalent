# V101.7.1 Hotfix 2 — Interaction Surfaces 2.0

Esta atualização não adiciona módulos de negócio. Ela padroniza as superfícies de interação que aparecem ao selecionar filtros, classificação, exibição, menus e configurações.

## Entregas

- Filter Builder com 430 px, header/body/footer, pesquisa, Recentes/Mais usados/Todos e navegação em dois níveis: propriedade → valor.
- Value Picker sem `select` nativo dentro do filtro principal; valores aparecem como lista selecionável com estado claro.
- contador de filtros ativos no trigger e chips compactos ao fechar.
- `WorkspaceSortMenu` compacto para Contatos, Pipeline e Propostas.
- `WorkspaceDisplayMenu` revisado com modo atual no trigger e lista visual consistente.
- menus `...` com superfície única e hierarquia mais limpa.
- drawers reservados a configurações complexas, com backdrop e largura maior.
- Overlay Engine compartilhado: Portal no `body`, flip/limites, resize/scroll, Escape, clique fora e restauração de foco.
- escala global de z-index para sticky/dropdown/popover/drawer/modal/toast.
- responsividade mobile para popovers e drawers.

## Compatibilidade

Mantém package/runtime em `101.7.1` para ser um hotfix da linha estrutural já validada. Não adiciona migrations e não altera schema ou serviços de dados.
