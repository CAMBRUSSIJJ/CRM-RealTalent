# RealTalent CRM V101.7.0 — Workspace Simplification & Unified Filter Engine

## Objetivo
Reduzir camadas redundantes de interface e transformar filtros/exibições em uma linguagem operacional única em todo o CRM.

## Entregas
- Remove `GuidedSellingStrip` do shell global. O Assistant permanece na topbar, Meu Dia e contextos do registro.
- Elimina a faixa permanente de selects de filtros rápidos. O padrão passa a ser **Exibições → Barra de trabalho → chips de filtros ativos → conteúdo**.
- Novo `WorkspaceFilterMenu`: catálogo pesquisável, Recentes / Mais usados / Todos, propriedades agrupadas e edição direta do valor.
- Filtros ativos continuam visíveis como chips e desaparecem quando não há filtro.
- Filtros avançados existentes continuam acessíveis por “Mais opções de filtro”.
- Popovers de filtros, exibição e menus de views usam `createPortal(document.body)` no React, com fechamento por clique externo/Escape e reposicionamento em scroll/resize.
- Contatos preserva “Todos os contatos” como exibição estrutural e permite criar novas exibições a partir do recorte atual.
- Pipeline: presets viram Saved Views persistentes; filtros + modo + escopo + ordenação são salvos juntos; renomear, duplicar, definir padrão, mover e excluir.
- Follow-ups e Playbooks: views criadas pelo usuário podem ser renomeadas, duplicadas e excluídas.
- Playbooks mantém Cards / Texto completo / Mapa mental / Fluxo dentro de **Exibição**.
- Propostas move Cards/Lista para **Exibição**; Catálogo e Receita adotam o mesmo botão Filtro.
- Agenda, Comunicação, Automações, Metas, Garimpo e Métricas passam a usar o mesmo `WorkspaceFilterMenu` na barra principal.
- Território remove a faixa permanente de filtros e abre o catálogo de propriedades em overlay; opções geográficas avançadas permanecem no drawer.
- O runtime do Território mantém views, camadas, seleção espacial, raio e fila de localização separados dos filtros comerciais.

## Compatibilidade
- `WorkspaceQuickFilters` continua exportado apenas como wrapper deprecated para extensões antigas.
- Storage de V101.6.9 é lido para preservar preferências anteriores.
- Nenhuma migration de banco é adicionada nesta release.
