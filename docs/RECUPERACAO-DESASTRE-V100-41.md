# Recuperação de desastre — V100.41

## Backup

Execute `npm run backup:database` com `SUPABASE_DB_URL`. O processo cria um dump PostgreSQL em formato custom e um manifesto SHA-256.

## Ensaio de restauração

1. crie um banco vazio de homologação;
2. defina `RESTORE_DATABASE_URL` e `BACKUP_FILE`;
3. execute `npm run restore:database`;
4. aplique `supabase/tests/homologation_contracts.sql`;
5. execute os testes E2E e multiempresa;
6. registre duração, falhas e resultado do ensaio.

A restauração é bloqueada quando o destino contém indicação de produção, salvo autorização explícita `ALLOW_PRODUCTION_RESTORE=true`.

## Meta operacional inicial

- RPO: até 24 horas;
- RTO de homologação: até 4 horas;
- ensaio de restauração: mensal e antes de mudanças críticas de banco.
