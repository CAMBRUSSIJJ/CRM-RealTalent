# RealTalent CRM V101.6.3 — Contact Views 2.0

## Objetivo
Transformar as abas de Contatos em visualizações reais da mesma base, no modelo de databases configuráveis: cada view possui identidade, tipo, filtros, colunas, ordem e preferências próprias.

## Entregas
- `Todos os contatos`, `Contatos quentes`, `Retornos pendentes` e `Sem próxima ação` deixam de ser tabs hard-coded e passam a ser views iniciais persistidas.
- Cada view possui **nome, cor, ícone, tipo, posição, visibilidade e padrão**.
- Tipos disponíveis em Contatos: **Tabela, Quadro e Lista compacta**.
- Views podem ser **configuradas, renomeadas, duplicadas, excluídas e definidas como padrão**.
- Reordenação por **drag-and-drop** e por comandos de mover esquerda/direita.
- Uma view compartilhada por outro usuário permanece somente leitura; pode ser duplicada para personalização própria.
- Exclusão dos presets iniciais usa arquivamento, impedindo que reapareçam no próximo carregamento.
- O sistema impede excluir a última view visível.
- Editor de view usa estado isolado: alterar configuração não muda a tela atual antes de salvar.
- Nova migration adiciona metadados visuais e de ordenação à persistência Supabase.

## Preservado
Meu Dia bloqueado, Global App Bar, Contato Workspace, Account 360, organograma, Calling, Pipeline e compatibilidade de rotas permanecem inalterados.
