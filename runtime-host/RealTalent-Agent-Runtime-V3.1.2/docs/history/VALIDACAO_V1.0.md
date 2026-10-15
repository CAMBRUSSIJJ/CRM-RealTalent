# Validação — RealTalent Agent V1.0 Production Governance

Data: 2026-10-13

## Resultado funcional

- Runtime contract audit: **123/123 PASS**.
- Workflow regression self-test: **9/9 PASS**.
- Mission regression self-test: **9/9 PASS**.
- Program regression self-test: **13/13 PASS**.
- Governance self-test: **16/16 PASS**.
- Builder self-test: **PASS**.
- Browser QA / Chromium self-test: **PASS**.
- Control Center HTML/JS renderizado: **PASS**.
- HTTP smoke (`/health`, `/control`, `/control/state`, `/governance`, audit verify, pause, resume): **7/7 PASS**.
- CRM Agent V1.0 Production Governance audit: **28/28 PASS**.
- CRM Agent V0.9 regression: **24/24 PASS**.
- CRM source syntax audit: **425 arquivos PASS**.
- Blue Ocean Agent V1.0 Production Governance smoke: **28/28 PASS**.
- Blue Ocean Agent V0.9 regression: **24/24 PASS**.
- Blue Ocean H7.24 Journey Library / Sidebar: **40/40 PASS**.
- Blue Ocean `syntax:check` (`tsc --noEmit --noCheck`): **PASS**.
- Shell scripts: **56 arquivos PASS** em `bash -n`.
- Runtime/new audit JavaScript modules: **PASS** em `node --check`.

## O que o Governance self-test comprova

- runtime e Control Center expõem Governance V1.0;
- fila respeita `critical > low` no cenário de teste;
- objetivo permanente persiste e pode gerar um Program na fila;
- aprovação é criada e decidida por perfil autorizado;
- snapshot operacional é criado;
- rollback é bloqueado sem Pause;
- rollback funciona depois de Pause;
- estado criado depois do snapshot é removido;
- **Pause permanece ativo após rollback**;
- **custo do rollback permanece contabilizado após a restauração**;
- audit log SHA-256 permanece íntegro;
- **adulteração de campo aninhado do ator é detectada** pela cadeia de hashes;
- stores sensíveis usam modo `0600`.

## Limitação de typecheck/build completo

Os launchers distribuídos deliberadamente não incluem `node_modules`.

O `npm run typecheck` foi executado para comprovar essa fronteira e terminou com exit code 2:

- CRM: começa com `TS2307 Cannot find module 'react'` e produz erros derivados pela ausência dos tipos/dependências instaladas.
- Blue Ocean: começa com `TS2307 Cannot find module 'react'` e também expõe contratos legados do módulo `design-system/icons` (exports como `Save`, `Upload`, `Download`, etc.).

Portanto, **typecheck completo, Vitest e production build não são declarados PASS nesta V1.0**. Para esses gates, execute primeiro `./preparar-builder.sh all` em um ambiente com acesso ao registry e lockfiles válidos.

Isso não foi mascarado: os gates aprovados acima são os efetivamente executados nesta árvore distribuída.

## Segurança e escopo

- Governance não cria uma segunda IA; governa a mesma RealTalent Agent.
- perfis `operator/manager/admin` são política operacional **local**, não SSO/autenticação corporativa.
- ACT mantém checkpoint humano antes de escrita.
- Builder mantém checkpoint, escopo limitado a source, backup e rollback transacional.
- Program mantém aceite humano antes de liberar dependências.
- QA permanece observacional por padrão.
- fila não executa objetivos permanentes silenciosamente em background.
- rollback global cobre somente estado operacional do Agent.
- rollback global **não** desfaz dados já persistidos no CRM, Service Graph ou sistemas externos.
- audit log não é restaurado por snapshot.
- rollback preserva o estado de Pause atual.
- nenhuma ferramenta destrutiva `crm.delete_*` ou `blue.delete_*` foi adicionada.
