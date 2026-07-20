# Publicação do RealTalent CRM V100.27

## 1. Validar o pacote

```bash
npm ci
npm run check
```

O build hospedado falha de propósito quando a Vercel não possui `VITE_DATA_MODE=supabase` e as credenciais públicas válidas.

## 2. Criar staging no Supabase

Crie um projeto separado de staging. Não reutilize o banco de produção para testes.

No terminal, defina `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `AUTOMATION_CRON_SECRET`. Depois execute:

```bash
npm run supabase:deploy -- --project-ref SEU_PROJECT_REF
```

O comando vincula o projeto, aplica todas as migrations e publica `extension-ingest` e `automation-runner`.

## 3. Configurar autenticação

No Supabase Auth:

- Site URL: domínio oficial da Vercel;
- Redirect URLs: domínio oficial, localhost e previews autorizados;
- confirmação de e-mail ligada em produção;
- SMTP próprio antes de convidar usuários externos;
- senha mínima de oito caracteres.

## 4. Programar o motor de automações

Abra `supabase/cron/CONFIGURAR-AUTOMATION-RUNNER.sql`, substitua o project ref e o mesmo `AUTOMATION_CRON_SECRET` usado nas funções e execute no SQL Editor.

O modelo chama `automation-runner` a cada dois minutos. O segredo fica no Supabase Vault, não no frontend.

## 5. Publicar o frontend na Vercel

Importe o repositório GitHub e use:

- Framework: Vite;
- Build Command: `npm run build`;
- Output Directory: `dist`;
- Node.js: 22.

Variáveis obrigatórias:

```env
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
VITE_APP_NAME=RealTalent CRM
```

Após alterar variáveis, faça um novo deploy.

## 6. Primeiro acesso

1. abra o domínio publicado;
2. crie a conta proprietária;
3. confirme o e-mail;
4. entre novamente;
5. crie o workspace RealTalent;
6. revise as etapas padrão;
7. convide a equipe pelas Configurações.

## 7. Teste de produção

- `/health.json` responde com a versão 100.27;
- owner cria e administra a equipe;
- admin administra sem remover o owner;
- member trabalha nos dados comerciais;
- viewer não altera dados;
- organizações diferentes não enxergam dados entre si;
- gravação exige consentimento;
- extensão processa lote idempotente;
- automações começam em simulação;
- backup exportável foi validado.
