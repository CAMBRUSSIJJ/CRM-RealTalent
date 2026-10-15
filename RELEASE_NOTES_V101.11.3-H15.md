# V101.11.3-H15 — Strict Prospecting Scope

## Objetivo
Impedir que o Garimpo transforme páginas, listas, categorias relacionadas ou empresas fora da localidade solicitada em resultados válidos quando a busca está em correspondência exata.

## Mudanças
- categoria e localização viram gates antes da entrada no Garimpo;
- modo padrão `exact`; modo `related` opcional;
- barbearias usam filtro OSM específico `hairdresser=barber`;
- fallback web mantém os mesmos critérios da fonte local;
- artigos, rankings e diretórios permanecem evidência, não empresa;
- cidade precisa ser confirmada; UF isolada não confirma localidade;
- rejeições por categoria/local ficam auditáveis no job e na UI;
- UI mostra correspondência Exata/Ampliada e contadores de rejeição.

Sem migration nova.
