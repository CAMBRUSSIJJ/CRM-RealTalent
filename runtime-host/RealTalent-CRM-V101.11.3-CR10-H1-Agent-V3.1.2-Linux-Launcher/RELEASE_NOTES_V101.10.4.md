# RealTalent CRM V101.10.4 — Local Discovery Experience

Base: **V101.10.3-H9.1 — TypeScript Hotfix / Territory Engine 2.0**.

## Objetivo

Fazer o Garimpo operar como um **localizador de empresas e estabelecimentos**, e não como um buscador genérico da internet. A release também redesenha a escolha de raio/mapa, cria o workspace **Local** e simplifica a decisão humana na **Revisão**.

## Place-First Search

- `WebDocument` não vira `CompanyCandidate` automaticamente.
- artigos, rankings, guias e diretórios são identificados e rejeitados como empresa;
- a Web precisa apresentar sinais locais/empresariais antes de gerar candidato;
- OpenStreetMap continua sendo fonte territorial primária;
- Web passa a atuar de forma mais conservadora em descoberta e enriquecimento;
- resultados Web repetidos entre consultas expandidas são deduplicados por URL antes do Company Resolver.

## Map & Radius UX

- presets de 2, 5, 10, 15, 25 e 50 km;
- slider e campo numérico sincronizados;
- círculo de raio visível antes de iniciar a campanha;
- centro da busca reposicionável no mapa;
- área estimada, células previstas e carga operacional;
- centro customizado é enviado e persistido pelo Prospecting Agent.

## Aba Local

- mapa + lista sincronizados;
- clusters de empresas próximas;
- filtros operacionais;
- visualizações **Empresas**, **Densidade** e **Cobertura**;
- drawer/detalhe de empresa com acesso direto à Revisão;
- empresas validadas sem coordenadas continuam visíveis na lista, sem marcador falso.

## Review Experience 3.0

A revisão guiada passa a responder cinco perguntas:
1. É uma empresa real?
2. É do segmento correto?
3. Está no território correto?
4. Há contato utilizável?
5. Está pronta para a base?

Inclui mini mapa, motivos de atenção, atalhos de teclado e aprovação inteligente em massa para registros que satisfazem critérios seguros.

## Compatibilidade

Preservados: Territory Engine 2.0, Search Ontology, Coverage Truth, Identity Resolver 2.0, Canonical Company Bridge, Independent Enrichment Jobs, Progressive Processing e Review Workspace 2.0.

Nenhuma migration SQL nova. Total: **49/49**.

## Segurança e limites

O Agent continua restrito a fontes e páginas públicas. Não faz login automático, não resolve CAPTCHA e não contorna bloqueios. O mapa ainda não é um GIS completo com múltiplos polígonos/áreas de exclusão.
