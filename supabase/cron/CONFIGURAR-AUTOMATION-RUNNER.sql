-- Execute no SQL Editor do projeto hospedado, substituindo os dois valores abaixo.
-- O segredo deve ser o mesmo AUTOMATION_CRON_SECRET configurado nas Edge Functions.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://SEU-PROJECT-REF.supabase.co',
  'realtalent_project_url'
);

select vault.create_secret(
  'SUBSTITUA_PELO_AUTOMATION_CRON_SECRET',
  'realtalent_automation_cron_secret'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'realtalent-automation-runner';

select cron.schedule(
  'realtalent-automation-runner',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'realtalent_project_url' order by created_at desc limit 1) || '/functions/v1/automation-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'realtalent_automation_cron_secret' order by created_at desc limit 1)
    ),
    body := jsonb_build_object('source', 'pg_cron', 'requestedAt', now())
  ) as request_id;
  $$
);

-- Verificação:
select jobid, jobname, schedule, active from cron.job where jobname = 'realtalent-automation-runner';
