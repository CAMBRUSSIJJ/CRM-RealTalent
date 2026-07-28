# Guia de Produção V100.17

## 1. Ambiente

Copie `.env.example` para `.env.local` e configure as variáveis do Supabase. Nunca publique a chave de serviço no frontend.

## 2. Banco

Aplique as migrations da pasta `supabase/migrations` na ordem dos nomes. Execute `supabase/verify.sql` e valide autenticação, organizações, membros, RLS, storage e realtime.

## 3. Qualidade

Execute:

```bash
npm ci
npm run check
npm run standalone
npm run test:smoke
npm audit --omit=dev --audit-level=high
```

## 4. Publicação

Publique a pasta `dist`. O `vercel.json` contém reescrita SPA, cache imutável para assets e cabeçalhos de segurança.

## 5. Pós-publicação

- criar usuários de teste com papéis diferentes;
- validar isolamento entre workspaces;
- importar um backup de homologação;
- testar Lead → Pipeline → Follow-up → Ligação → Agenda;
- testar automações em modo simulação antes de ativar;
- confirmar storage privado de gravações;
- monitorar erros de frontend e falhas das Edge Functions.
