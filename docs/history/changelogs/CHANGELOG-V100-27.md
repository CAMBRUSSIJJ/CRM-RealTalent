# Changelog V100.27 — Inicialização, Deploy e Operação

## Objetivo

Transformar a V100.26 corrigida em um pacote reproduzível para demonstração local, desenvolvimento com Supabase, GitHub privado, staging e produção na Vercel.

## Inicialização

- inicializador local por duplo clique no Windows;
- inicializador completo com Docker Desktop e Supabase local;
- Node.js fixado na versão 22;
- instalação reproduzível com `npm ci`;
- health check público em `/health.json`;
- modo local, Supabase local e produção claramente separados.

## Supabase

- Supabase CLI incluído como dependência de desenvolvimento;
- `supabase/config.toml` e `seed.sql` adicionados;
- scripts para iniciar, parar, resetar, validar e publicar o Supabase;
- publicação automatizada de migrations e Edge Functions;
- compatibilidade das Edge Functions com chaves secretas novas e legadas;
- modelo de agendamento do `automation-runner` com pg_cron, pg_net e Vault;
- segredo do agendador obrigatório, estável e com no mínimo 32 caracteres;
- ambientes separados de staging e produção no workflow do GitHub.

## GitHub e CI

- preparação automática de repositório privado, sem licença;
- branch principal `main`;
- workflow de CI com TypeScript, testes, build, auditoria, preflight e `npm audit`;
- workflow manual protegido para publicar o backend;
- template de pull request;
- bloqueio de arquivos de ambiente, segredos, `node_modules`, `.vercel` e temporários.

## Vercel e ambiente

- configuração SPA e headers de segurança;
- cache imutável para assets e sem cache para health check;
- validação que bloqueia deploy hospedado em modo local;
- rejeição de placeholders, chave secreta e `service_role` no frontend;
- exemplos separados de ambiente local, Supabase local e produção.

## Documentação e operação

- guia de início;
- guia de GitHub;
- guia de deploy;
- guia de produção;
- roteiro de publicação GitHub + Vercel;
- scripts `.bat` para usuários Windows;
- relatório de prontidão e testes da versão.
