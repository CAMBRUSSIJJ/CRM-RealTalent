# RealTalent Brand Motion — V101.11.1-H4

## Sequência
1. Fundo navy/azul/teal entra sem flash branco.
2. As três barras verdes sobem de forma escalonada.
3. O R é revelado horizontalmente.
4. A marca final transparente faz o acabamento visual.
5. Um scan e um shine atravessam a marca uma única vez.
6. Halo e órbitas passam para movimento ambiente lento.
7. Enquanto a sessão é validada, as barras da própria marca pulsam como progresso.
8. Se o navegador suporta View Transitions, a marca central se desloca de forma compartilhada até a posição do login.

## Performance
- Transform/opacity são os principais canais de animação.
- Sem blur animado no logo.
- Scan/shine não ficam rodando continuamente.
- `prefers-reduced-motion` desativa motion não essencial.
- `contain: layout paint` e `will-change` limitam o custo de repaint.

## Assets
- `realtalent-logo.png`: original com tile claro; mantido para app/PWA.
- `realtalent-logo-transparent.png`: composição transparente usada no login.
- `realtalent-logo-r.png`: camada do R.
- `realtalent-logo-bars.png`: camada das barras verdes.
