# V101.11.1-H5 — Full Canvas & Orbit Field

## Added
- Campo orbital em escala de viewport com três órbitas decorativas de baixa opacidade.
- Pontos orbitais luminosos usando a paleta azul/teal da marca.
- O mesmo campo orbital no splash e na tela de entrada para continuidade visual.

## Fixed
- Remove os pseudo-elementos legados de `core-v100.css` que eram recortados no limite da coluna esquerda.
- Canvas de autenticação passa a cobrir `100dvh`/100% da viewport sem descontinuidade visual entre as duas colunas.
- `auth-showcase` deixa de recortar os elementos de ambiente da página.

## Performance / accessibility
- Órbitas usam apenas transform/opacity em animações lentas.
- `prefers-reduced-motion` congela o movimento e mantém somente o desenho estático.

## Preserved
- H4 transparent logo motion, H1 Login Gate & Logout, autenticação Supabase, modo local, dados e 49 migrations.
