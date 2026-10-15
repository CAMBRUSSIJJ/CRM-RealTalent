# V101.11.1-H4 — Transparent Logo & Optimized Motion

## Adicionado
- Variante transparente da marca RealTalent para splash/login.
- Camadas separadas do R e barras verdes para animação de construção.
- View Transition opcional entre splash e tela de entrada.
- Indicador de carregamento inspirado nas três barras da própria marca.

## Melhorado
- Fundo full-screen unificado em navy/azul/teal da logo.
- Card de entrada em vidro escuro para manter toda a experiência dentro da paleta da marca.
- Animações priorizam `transform` e `opacity` e evitam filtros pesados em loops contínuos.
- Abertura mínima otimizada para 1,45 s quando há movimento normal e 180 ms com `prefers-reduced-motion`.

## Preservado
- Ícone original com tile claro para app/PWA.
- Login Gate local, logout sem apagar dados e autenticação Supabase.
- V101.11.0 Communications Architecture, dados, schema e 49 migrations.

## Limitações
- View Transitions é progressivo: navegadores sem suporte usam a transição CSS normal.
- O build npm completo depende da árvore real de `node_modules` no ambiente do usuário.
