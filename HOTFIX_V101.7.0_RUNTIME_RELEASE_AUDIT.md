# Hotfix V101.7.0 — Runtime release audit

Corrige uma regressão de QA herdada da V101.6.9.

## Sintoma
O gate `qa:v101.5.2` falhava em 35/37 com:

- `bundle audit acompanha release`
- `HTTP smoke acompanha release`

## Causa
`scripts/v101_5_built_bundle_audit.mjs` e `scripts/v101_5_http_smoke.mjs` ainda estavam fixados na versão `101.6.9` e no canal `global-filter-view-standard`, enquanto o pacote atual é `101.7.0` / `workspace-simplification-filter-engine`.

## Correção
Os dois scripts passaram a ler `package.json`, `public/health.json`, `public/runtime-version.json` e o `<title>` de `index.html` como fonte da release atual. Assim, bundle audit e HTTP smoke acompanham automaticamente a versão empacotada e não precisam ser reescritos a cada release.

O contrato histórico `v101_5_2_ui_runtime_accessibility_audit.mjs` foi atualizado para validar essa estratégia dinâmica, em vez de procurar uma versão hardcoded no código.

Nenhum componente visual, dado comercial, migration ou comportamento funcional do CRM foi alterado neste hotfix.
