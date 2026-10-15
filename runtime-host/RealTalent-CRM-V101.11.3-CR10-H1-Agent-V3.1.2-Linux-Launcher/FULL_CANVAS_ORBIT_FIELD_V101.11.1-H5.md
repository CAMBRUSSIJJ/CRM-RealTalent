# V101.11.1-H5 — Full Canvas & Orbit Field

## Objetivo visual
Transformar as órbitas que já existiam ao redor da marca em uma linguagem ambiental da tela inteira, sem criar um fundo pesado ou interativo.

## Problema corrigido
A captura da H4 mostrava um círculo grande terminando abruptamente na divisão das duas colunas. O corte vinha de estilos históricos em `core-v100.css`: os pseudo-elementos de `.auth-showcase` pertenciam apenas à coluna esquerda e eram recortados pelo `overflow:hidden`.

Na H5, os elementos históricos são neutralizados e a decoração passa a ser renderizada no nível da viewport.

## Camadas orbitais
1. **Frame orbit** — quase contorna a viewport inteira.
2. **Wide orbit** — cruza horizontalmente a composição e cria profundidade.
3. **Corner orbit** — nasce além do canto superior direito e entra parcialmente em cena.

As órbitas menores da logo permanecem independentes.

## Performance
O movimento usa apenas `transform` e `opacity`; não há JavaScript por frame. O campo orbital não recebe eventos de ponteiro e usa `contain: paint`. Em `prefers-reduced-motion`, as órbitas permanecem estáticas.

## Escopo preservado
Nenhuma alteração de schema, migration, dados, sessão, integração, Pipeline, Contatos, Calling, Connect, Garimpo ou Comunicações.
