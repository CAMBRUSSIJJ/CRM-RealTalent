# V101.11.3-CR7 — Production Deployment & Operational Readiness

Base: V101.11.3-CR6.

## Entregue
- Preflight de produção endurecido: produção exige `VITE_DATA_MODE=supabase`.
- Validação de domínio canônico HTTPS via `VITE_PUBLIC_APP_URL`.
- Bloqueio já existente de `service_role` no frontend preservado.
- `/health.json` passa a declarar explicitamente **liveness**, não readiness.
- Production probe externo para frontend, headers de segurança e Supabase Auth.
- Headers adicionais: HSTS, Cross-Origin-Resource-Policy e X-Permitted-Cross-Domain-Policies.
- Backup PostgreSQL/Supabase com `pg_dump`, permissão restrita e SHA-256.
- Restore com `pg_restore` bloqueado por padrão e confirmação destrutiva explícita.
- Release snapshot com hash do lockfile, das 58 migrations e, quando existir, do `dist`.
- Runbook de deploy, pós-deploy, rollback e incidente.
- Capability Matrix e release manifest atualizados para CR6/CR7.

## Novos comandos
```bash
npm run qa:commercial-readiness:cr7
npm run runtime:commercial-readiness:cr7
npm run release:snapshot
npm run backup:production
npm run restore:production -- caminho.dump
```

## Importante
A CR7 não declara que houve deploy real. O production probe exige URL e credenciais públicas do ambiente implantado. Backup/restore exigem a connection string de banco fora do bundle frontend.
