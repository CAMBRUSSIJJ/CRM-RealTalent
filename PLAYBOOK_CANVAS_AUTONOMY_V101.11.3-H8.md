# Playbook Canvas Autonomy — V101.11.3-H8

## Modelo operacional

O canvas agora suporta dois estilos de autoria simultaneamente:

1. **Guiado** — `+ Caminho` cria o próximo nó e a conexão automaticamente.
2. **Livre** — o usuário posiciona nós, seleciona vários, cria fases e conecta qualquer nó manualmente.

## Seleção

- clique: seleciona um bloco;
- Ctrl/Cmd/Shift + clique: adiciona/remove da seleção;
- Shift + arrastar no fundo: cria uma caixa de seleção;
- arrastar qualquer item selecionado move todo o conjunto.

## Fases

Uma seleção de dois ou mais nós pode virar uma fase visual. A fase possui título próprio e é salva em `conversationGraph.groups`. Os nós guardam `groupId`, sem migration SQL.

## Conexões

O handle lateral ativa `connectFromId`. O próximo nó clicado vira o destino e uma aresta é adicionada ao mesmo `conversationGraph.edges` já usado por Script, Estrutura e Simular.

## Atalhos

- Ctrl/Cmd + A: selecionar todos;
- Ctrl/Cmd + D: duplicar seleção;
- Ctrl/Cmd + G: criar fase;
- Ctrl/Cmd + S: salvar;
- Delete/Backspace: excluir seleção (raiz protegida);
- Setas: mover seleção; Shift + Setas: passo maior;
- Escape: cancelar conexão/caminho/seleção.
