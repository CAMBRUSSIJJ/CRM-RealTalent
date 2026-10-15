# RealTalent CRM V100.92.0 — Hardening & UX

## Objetivo

Consolidar a V100.91.0 com foco em confiabilidade, consistência de dados e redução de atrito na operação diária, sem alterar o schema histórico dos backups (`100.54`).

## Entregas

- Busca global do CRM com `Ctrl/⌘ K`, resultados tipados e navegação contextual para registros.
- Navegação progressiva com **Mais ferramentas**, mantendo os módulos mais frequentes visíveis.
- Limpeza operacional transacional no Supabase e atômica no repositório local, preservando organização, membros, Pipeline, catálogo, integrações/configurações e trilha administrativa.
- Migration `202609240001_v100_92_hardening_ux.sql` com RPC administrativo, auditoria e grants explícitos.
- Contratos `supabase.types.ts` sincronizados com todas as tabelas e RPCs usadas diretamente pelo front-end.
- Correções em Ajuda, execução comercial, RealTalent Assistant, prospecting e notificações.
- Tokens CSS semânticos para superfícies, bordas, texto, radius, sombras e motion.
- Cinco regressões focadas em Help e Global Search.

## Compatibilidade

- `BACKUP_SCHEMA_VERSION = 100.54` preservado.
- Node.js 22 continua sendo o runtime suportado.
- V100.91 Help + Onboarding e V100.90 RealTalent AI permanecem preservados.
