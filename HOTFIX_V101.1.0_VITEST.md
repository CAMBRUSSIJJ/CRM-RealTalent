# V101.1.0 — Vitest HOTFIX

Este hotfix corrige as duas regressões encontradas depois que o TypeScript passou no Linux e a suíte Vitest avançou até `local-crm-repository.test.ts`.

## Correções

1. **Mesclagem de leads**
   - Um valor comercial maior vindo do cadastro duplicado era corretamente preservado por `mergeLeadRecords`, mas depois era reduzido pelo valor da proposta oficial existente.
   - A consolidação agora usa o maior valor entre o lead mesclado e a proposta oficial, evitando perda silenciosa de informação.

2. **Inicialização local idempotente**
   - `readDatabase()` aplica normalizações compatíveis em memória para campos adicionados ao longo das versões.
   - `initialize()` regravava essas normalizações mesmo quando a estrutura comercial não havia mudado, quebrando a garantia de que uma instalação existente não é alterada somente por abrir o CRM.
   - Agora a base só é persistida durante `initialize()` quando a sincronização de vínculos comerciais realmente altera leads/empresas/contatos/relacionamentos/oportunidades.

## Escopo

Nenhuma funcionalidade nova foi adicionada e a versão lógica permanece `101.1.0`.
