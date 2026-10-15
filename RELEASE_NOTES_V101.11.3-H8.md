# V101.11.3-H8 — Playbook Canvas Autonomy

Hotfix funcional/UX sobre a V101.11.3-H7. Não altera schema SQL, migrations, Calling, Communications ou RealTalent Connect.

## Objetivo

Transformar o mapa do Playbook em um canvas de autoria mais livre sem perder a fonte única de verdade `guidance.conversationGraph`.

## Adicionado

- seleção múltipla com Ctrl/Cmd/Shift;
- seleção por área com Shift + arrastar no fundo;
- movimento conjunto de blocos selecionados;
- ações em lote: agrupar em fase, alinhar, distribuir, duplicar e excluir;
- grupos/fases visuais persistidos dentro do conversation graph;
- fases renomeáveis e movíveis com seus nós;
- conexão manual nó → nó por handle lateral;
- prevenção de conexão duplicada entre o mesmo par;
- modo visual de conexão com indicação de origem e destino;
- `Ajustar conteúdo` para enquadrar o mapa;
- painel de atalhos de teclado;
- atalhos Ctrl/Cmd+A, D, G, S, Delete, Escape e setas;
- Inspector contextual para seleção múltipla.

## Preservado

- Mapa / Estrutura / Script / Simular continuam lendo o mesmo grafo;
- criação rápida `+ Caminho` da H7;
- Playbook Studio 2.0 da H6;
- Calling Workspace H3-H5;
- runtime recovery H1/H2;
- 50 migrations existentes.
