# RealTalent Agent V0.5 — CRM

A V0.5 preserva as 6 tools comerciais da V0.2 e o Browser QA da V0.3, adicionando um Builder externo e controlado para manutenção do código-fonte.

## Browser QA

O QA continua usando a mesma sessão Chromium do CRM por CDP em `127.0.0.1:9223`. O modo de verificação disparado pelo CRM é `observe`, sem escrita.

## Builder

O Builder é executado pelo bundle, fora do browser. Ele só pode alterar arquivos existentes dentro de `src/`, por substituições exatas, com backup, gates e rollback automático. Ele não pode alterar `.env`, Auth, RLS, permissões, migrations, Supabase, lockfiles ou infraestrutura.

Fluxo: plano estruturado → confirmação humana → backup → patch → syntax/typecheck/test/build → Browser QA → manter ou reverter.
