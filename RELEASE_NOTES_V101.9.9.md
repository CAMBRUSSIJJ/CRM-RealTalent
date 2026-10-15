# RealTalent CRM V101.9.9 — QA Architecture Reset

## Objetivo
Encerrar o ciclo V101.9.x substituindo o gate principal baseado em dezenas de audits textuais por uma arquitetura de QA orientada a capacidades e invariantes.

## Entregue
- `release-manifest.json` como manifesto único de release;
- `qa/capability-matrix.json` com capacidades críticas e evidências executáveis;
- catálogo de fluxos críticos de browser;
- validação de paridade do contrato `CrmRepository` entre Local e Supabase;
- gates segmentados para plataforma, repository e integração;
- `check:legacy` preserva toda a regressão textual histórica, mas deixa de bloquear o gate padrão;
- `npm run check` usa a nova arquitetura e depois executa typecheck, Vitest e build;
- harness opcional de browser E2E com Chromium após o build;
- nenhuma migration nova.

## Princípio
Um recurso novo deve provar uma capacidade por teste, smoke, contrato estrutural, repository test, integração ou browser flow. Strings de versão deixam de ser a unidade principal de confiança.
