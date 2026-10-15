# V101.11.3-CR2 — Production Supabase + Auth + RLS Validation

## Objetivo
Transformar a segurança H22 em um gate verificável de staging, sem criar migrations artificiais nem alterar regras de negócio.

## Entregue
- Preserva exatamente as 58 migrations da CR1.
- Novo QA estático `qa:commercial-readiness:cr2` valida a presença e o encadeamento das proteções H22 no banco.
- Novo probe real `runtime:commercial-readiness:cr2` autentica três contas de staging: Administrador, Gestor e Vendedor.
- O probe valida, com JWT real do Supabase, `rt_access_scope`, `rt_access_action_allowed` e a atribuição de `member_access_profiles`.
- `.env.cr2.example` documenta as credenciais exclusivamente de staging necessárias para a prova ponta a ponta.

## Critérios esperados no staging
- Administrador: `proposals=all`, pode aprovar, pode ver settings.
- Gestor: `proposals=team`, pode aprovar, pode ver settings.
- Vendedor: `proposals=own`, não pode aprovar, não pode ver settings.

## Comandos
```bash
npm run migrations:verify
npm run qa:commercial-readiness:cr2

# com variáveis CR2_* de staging carregadas
npm run runtime:commercial-readiness:cr2
```

## Estado desta entrega
O gate estrutural é executável offline. O gate Supabase real exige URL, anon key, workspace e três contas de homologação; sem essas credenciais ele retorna `BLOCKED` de forma explícita, nunca um falso PASS.
