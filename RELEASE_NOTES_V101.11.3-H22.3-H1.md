# RealTalent CRM V101.11.3-H22.3-H1 — Stability & Security Closure

Hotfix sobre a H22.3 criado a partir da auditoria empírica de 13/10/2026.

## Corrigido

### Product Studio
- O `ProductStudioModal` agora usa a prop `canWrite` ao salvar.
- Remove o risco de `ReferenceError` causado por `canProposalEdit` fora do escopo do modal.

### Margem comercial
- A UI passa a usar `policy.grossMarginAmount`.
- A propriedade inexistente `policy.marginValue` foi removida.

### Aprovações
- `approvalStatusForEntity` retorna `TeamApprovalStatus` completo e aceita `cancelled` sem quebrar o tipo.

### Personalização
- `tasks` e `teams` foram adicionados ao `Experience Registry`.
- O comando `Personalizar visualização` deixa de apontar para rotas sem definição de seções.

## Hardening Supabase

Nova migration:

`202610130001_v101_11_3_h22_3_h1_stability_security_closure.sql`

Ela:
- exige membership em `rt_access_approval_policy`;
- exige membership + permissão de `view` em `rt_proposal_policy_reasons`;
- valida que a proposta pertence à organização;
- exige membership em `rt_proposal_has_approval`;
- remove EXECUTE de `PUBLIC`, `anon` e `authenticated` dos dois helpers internos de proposta;
- mantém `rt_access_approval_policy` disponível apenas para `authenticated`, agora com membership guard.

Total de migrations: **58**.

## QA

- `qa:architecture`: PASS.
- H22.1: **54/54 PASS**.
- H22.2: **75/75 PASS**.
- H22.3: **102/102 PASS**.
- H22.3-H1: **29/29 PASS**.
- H22.1 runtime: **17/17 PASS**.
- H22.2 runtime: **25/25 PASS**.
- H22.3 runtime: **33/33 PASS**.
- Migrations: **58/58 PASS**.
- Release Manifest: **108/108 PASS**.
- Capability Matrix: **48 capacidades / 184 evidências / 124 executáveis**.
- Repository parity: Local **100/100**; Supabase **100/100**.
- Build registry-independent: **306 módulos PASS**.
- Security runtime: **12/12 PASS**.
- WhatsApp normalization: **8/8 PASS**.
- Garimpo Strict Scope e H21.1: PASS.
- Connect Recovery: **5/5 PASS**.

## Dependências — limitação ainda aberta

O `package-lock.json` não pôde ser reconstruído nesta sessão porque o ambiente não resolve o registry npm (`EAI_AGAIN`). Permanecem faltando no lock as entradas resolvidas de:

- `@whiskeysockets/baileys@7.0.0-rc14`
- `qrcode@1.5.4`
- `whatsapp-web.js@1.34.7`

Por isso `npm ci`, typecheck oficial, Vitest e Vite continuam **BLOCKED**, não PASS.

O typecheck parcial confirma que os erros locais encontrados na auditoria anterior não reaparecem; os erros restantes começam na ausência dos módulos/tipos React/Supabase.

## Limite de segurança conhecido

H22.3/H1 protege escopo de linhas, ações e escrita de campos sensíveis. `hidden` na UI ainda não equivale a isolamento físico de coluna para um usuário que faça raw SELECT direto no Supabase sobre uma linha autorizada por RLS. Secure projections/views/RPCs continuam recomendadas para essa fronteira.
