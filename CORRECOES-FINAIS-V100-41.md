# RealTalent CRM V100.41 — correções finais

- Build portátil reproduzível, gerado exclusivamente da fonte TypeScript.
- Standalone oficial gerado da mesma fonte, sem reaproveitar HTML antigo.
- 128 testes aprovados em 29 arquivos.
- 29 de 29 controles de pré-voo aprovados.
- 14 de 14 etapas da homologação portátil aprovadas.
- Versão do schema de backup restaurada para 100.33.
- Inicialização local tornada idempotente.
- Sincronização comercial preserva segmento, título da oportunidade e origem social existentes.
- Armazenamento de testes compatível com o comportamento enumerável do navegador.
- Pipeline padrão Vite/Vitest preservado para ambientes com npm disponível.

O build portátil usa módulos ESM versionados para React, React DOM, Lucide e Supabase. O HTML standalone requer conexão à internet para carregar esses módulos fixados.
