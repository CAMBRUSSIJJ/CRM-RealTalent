# RealTalent CRM V101.10.3-H8 — Search Ontology

## Entregue

- ontologia de segmentos versionada no Prospecting Agent;
- resolução de texto livre para intenção canônica;
- aliases e expansão de consultas web;
- mapeamento de tags OSM por intenção, inclusive filtros compostos;
- referência CNAE por segmento;
- categorias semânticas para providers futuros;
- persistência da intenção no `SearchPlan`;
- `intentId` registrado em `ProviderRun`;
- UI mostra “Segmento entendido”, confiança, CNAEs e categorias;
- fallback genérico preservado para segmentos ainda não catalogados;
- runtime dedicado `runtime:prospecting-ontology`.

## Exemplo validado

`empresa de climatização` → `hvac` → `craft=hvac` no OSM + consultas web expandidas + CNAE `4322-3/02`.

## Banco

Nenhuma migration SQL nova. Total permanece 49/49.
