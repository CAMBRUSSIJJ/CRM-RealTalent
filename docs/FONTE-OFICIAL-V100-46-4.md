# Fonte oficial — V100.46.4

A fonte oficial permanece em `src/`. O build é gerado por `scripts/build-registry-independent.mjs` e publicado a partir de `dist/`.

O módulo de Comunicações foi removido da navegação, das rotas, dos componentes, dos serviços de tela e dos estilos. A integração de calendário necessária à Agenda foi isolada em `src/services/calendar-integration.ts`.
