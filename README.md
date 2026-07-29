# RealTalent CRM V100.50

Código-fonte oficial da versão **V100.50 — Personalização e Experiência Global**.

## Requisitos

- Node.js 22.12 ou superior, dentro da linha 22
- npm 10 ou superior
- Projeto Supabase para uso compartilhado em produção

## Instalação

```bash
npm install
cp .env.example .env.local
npm run validate:env
npm run dev
```

No Windows, copie `.env.example` para `.env.local` pelo Explorador de Arquivos e preencha as variáveis necessárias.

## Validação e build

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

O build final é gerado em `dist/`.

## Supabase

- Migrations: `supabase/migrations/`
- Edge Functions: `supabase/functions/`
- Variáveis privadas das funções: `supabase/functions/.env.example`

Nunca envie `.env`, `.env.local`, tokens, senhas ou a chave `service_role` ao GitHub.

## Publicação

O projeto está preparado para Vercel. Configure as variáveis de ambiente no painel da hospedagem e publique a partir deste diretório. O arquivo `vercel.json` mantém o roteamento SPA e os cabeçalhos de segurança.
