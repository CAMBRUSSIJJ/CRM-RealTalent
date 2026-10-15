# RealTalent CRM V101.11.3-H21.1 — Garimpo Coverage & Runtime Truth

Base: V101.11.3-H20.7-H2 — WhatsApp Conversation-Only Inbox.

## Objetivo

Corrigir dois problemas observados na gravação real do Garimpo:

1. resultados já encontrados apareciam em algumas superfícies enquanto outras continuavam exibindo zero/estado vazio;
2. a cobertura local podia ficar muito abaixo do que o usuário encontra manualmente no Google Maps, principalmente quando bases abertas classificam um estabelecimento local de forma genérica.

A H21.1 não promete paridade com o catálogo privado do Google Maps. O motor local continua usando fontes abertas e web pública, com Google Places opcional quando configurado. A nova versão amplia a cobertura dessas fontes sem transformar candidato incerto em empresa aprovada automaticamente.

## Runtime Truth

Cada busca agora possui uma verdade de execução identificada por `runId`.

A interface diferencia explicitamente:

- Encontradas agora;
- Prontas agora;
- Precisam atenção;
- Consultas;
- Base total.

O painel técnico acompanha em tempo real:

- fase atual;
- fonte atual;
- região;
- consulta;
- estados de OSM exato, cobertura OSM, web e enriquecimento;
- últimos eventos da execução;
- rejeições por categoria/localização;
- duplicidades e consultas.

O polling durante uma execução ativa passa a 1 segundo.

## Resultado progressivo

O candidato aceito pelo escopo é persistido na execução antes de concluir todo o enriquecimento. Isso permite que ele apareça no processamento/revisão progressivamente, em vez de a interface ficar vazia até o final do pipeline.

A etapa de enriquecimento não substitui mais a fase global da descoberta; ela aparece como uma fonte/atividade paralela da execução.

## Cobertura local ampliada

Para correspondência exata em modo normal/máxima cobertura:

1. a busca OSM exata continua sendo executada primeiro;
2. quando a ontologia possui uma classificação aberta relacionada, uma segunda varredura pode buscar candidatos adicionais;
3. candidatos encontrados apenas nessa segunda varredura recebem `coverageCandidate`;
4. esses candidatos sempre ficam em `Atenção` quando a categoria não está confirmada;
5. conflitos explícitos continuam rejeitados.

Exemplo validado:

- `Barbearia Alpha`, classificada como barbearia: aceita normalmente;
- `Studio Davi`, classificado genericamente como `hairdresser`: entra como candidato de cobertura / confirmar categoria;
- `Salão de Beleza Bela`, com conflito explícito: continua rejeitado.

## Web pública como pista, não como verdade

Resultados de diretórios/redes podem virar pistas de cobertura apenas quando título/snippet confirmam categoria e localização. Eles não são aprovados automaticamente e há um limite de pistas por execução para evitar ruído.

Artigos, rankings e páginas editoriais continuam rejeitados como empresas.

## Verdade dos contadores de processamento

Estágios terminados em `completed`, `attention` ou `skipped` passam a contar como processados. Validação em `attention` também é contabilizada. Isso corrige a situação em que uma empresa já havia sido processada, mas os contadores continuavam mostrando zero.

## Cobertura aberta versus Google Maps

A busca principal exibe a informação de produto:

> Cobertura aberta ≠ catálogo do Google Maps.

O motor local combina OpenStreetMap e web pública. Google Places já existe como provider opcional quando configurado no ambiente, mas não é exigido para o Garimpo funcionar.

## QA

- `qa:architecture`: PASS.
- H21.1: 33/33 PASS.
- Strict Prospecting Scope: 39/39 PASS.
- Garimpo UX Consolidation: 40/40 PASS.
- Local Discovery: 32/32 PASS.
- Search & Processing Engine: 41/41 PASS.
- Progressive Processing: 28/28 PASS.
- Source Syntax: 418 arquivos PASS.
- Integration Contracts: 386 arquivos PASS.
- Migrations: 54/54 PASS.
- Release Manifest: 100/100 PASS.
- Capability Matrix: 44 capacidades / 164 evidências / 108 executáveis.
- Repository Local/Supabase: 100/100.
- Browser E2E Contract: 11 fluxos.
- CSS Governance: 65/65 PASS.
- Linux preflight: 379 TS/TSX PASS.

## Runtime validado

Passaram:

- Prospecting Agent;
- busca híbrida OSM + web + fallback sem Nominatim;
- Search & Processing Engine;
- Drawn Territory;
- Coverage Truth;
- Identity Resolver 2.0;
- Enrichment Jobs;
- Progressive Processing;
- Search Ontology;
- Territory Engine 2.0;
- Local Discovery;
- Strict Prospecting Scope;
- H21.1 Coverage & Runtime Truth.

Os smokes antigos de fallback/identidade tiveram fixtures atualizadas para respeitar o Strict Scope H15; o objetivo original dos testes foi preservado.

## Build oficial

`npm ci` não concluiu na janela deste ambiente e não produziu `node_modules`.

Portanto:

- typecheck oficial: BLOCKED — React/Supabase/tipos ausentes;
- Vitest oficial: BLOCKED — `vitest: not found`;
- Vite build oficial: BLOCKED — `vite: not found` após `validate:env` PASS.

O build registry-independent percorreu 303 módulos. O `dist` de fallback foi recusado pelo bundle audit por `HTML legado reapareceu` e removido do pacote final.
