# V101.11.3-H9 — Playbook Performance & Interactive Whiteboard

Hotfix/evolução sobre a V101.11.3-H8. Mantém o mesmo `conversationGraph`, sem migration nova.

## Performance e FPS
- monitor de FPS via `requestAnimationFrame`, atualizado em janela de ~1 segundo;
- contagem de long frames (>34 ms) para diagnosticar travamentos perceptíveis;
- pointer move do whiteboard passa a ser processado no máximo uma vez por animation frame, evitando centenas de `setState` por segundo em mouse/trackpad rápidos;
- listeners de pointer deixam de ser recriados a cada movimento do grafo;
- lookups de nós e contagem de saídas são memoizados;
- modo adaptativo reduz sombras, labels de arestas e transitions quando o FPS cai;
- `contain`, `backface-visibility` e `overscroll-behavior` reduzem paint/reflow e scroll chaining.

## Whiteboard
- cards continuam livremente arrastáveis;
- cada card pode receber uma das seis cores editoriais;
- recoloração em seleção múltipla;
- grade visual pode ser ligada/desligada;
- Snap opcional em grade de 20 px;
- Ctrl/Cmd + scroll controla zoom;
- pan, zoom, seleção múltipla, fases/grupos, conexão manual, distribuição, alinhamento e atalhos H8 permanecem preservados;
- Mapa / Estrutura / Script / Simular continuam lendo o mesmo grafo.

## Login interativo
- novo campo de pontos brancos/ciano distribuídos por toda a tela;
- pontos são clicáveis e geram uma explosão curta com onda + 8 partículas;
- máximo de três explosões simultâneas para limitar custo visual;
- animações usam principalmente `transform` e `opacity`;
- se o monitor detectar FPS reduzido, o campo mostra menos pontos e pausa orbits secundárias;
- `prefers-reduced-motion` é respeitado.

## Observação sobre FPS do vídeo
Uma gravação de tela não prova o FPS real da aplicação: o encoder pode limitar a captura. A H9 adiciona medição em tempo real no próprio Playbook Workspace para separar FPS do navegador de FPS do vídeo.
