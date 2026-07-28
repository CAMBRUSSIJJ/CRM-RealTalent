# ADR 0003 — Promoção entre ambientes

**Status:** aceito na V100.37.

## Decisão

Desenvolvimento, homologação e produção usam projetos Supabase separados. A mesma release é promovida sem reconstruções manuais.

## Consequência

Migrations históricas ficam protegidas por checksum; secrets são exclusivos por ambiente; produção depende de aprovação do ambiente protegido no GitHub.
