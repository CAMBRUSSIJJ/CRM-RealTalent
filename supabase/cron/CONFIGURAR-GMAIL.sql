-- RealTalent CRM V101 — liga os agendamentos do Gmail (Fase 2 · Comunicação).
-- Rode UMA vez no SQL Editor do projeto, depois da migration 202611200001_v101_gmail_personal_accounts.sql.
-- Os dois segredos têm de ser IGUAIS aos cadastrados em Edge Functions › Secrets:
--   INTEGRATION_WORKER_SECRET e COMMUNICATION_WORKER_SECRET.
-- Nunca salve este arquivo com os valores preenchidos no Git.

select vault.create_secret('https://SEU-PROJECT-REF.supabase.co', 'realtalent_project_url')
where not exists (select 1 from vault.secrets where name = 'realtalent_project_url');

select vault.create_secret('COLE_AQUI_O_INTEGRATION_WORKER_SECRET', 'realtalent_integration_worker_secret')
where not exists (select 1 from vault.secrets where name = 'realtalent_integration_worker_secret');
select vault.create_secret('COLE_AQUI_O_COMMUNICATION_WORKER_SECRET', 'realtalent_communication_worker_secret')
where not exists (select 1 from vault.secrets where name = 'realtalent_communication_worker_secret');
-- Para trocar um valor depois: select vault.update_secret(id, 'novo-valor') from vault.secrets where name = '...';

-- Verificação: deve listar os dois agendamentos e responder sem "skipped".
select jobname, schedule, active from cron.job where jobname in ('realtalent-mail-poll', 'realtalent-integration-runners');
select public.run_integration_workers();
