-- RealTalent CRM V100.38 — fila de novas tentativas de webhook.
-- Execute no SQL Editor e substitua os três valores. Os segredos ficam no Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('https://SEU-PROJECT-REF.supabase.co', 'realtalent_webhook_project_url');
select vault.create_secret('SUA_CHAVE_ANON_PUBLICA', 'realtalent_webhook_anon_key');
select vault.create_secret('SUBSTITUA_PELO_AUTOMATION_WEBHOOK_CRON_SECRET', 'realtalent_webhook_cron_secret');

select cron.unschedule(jobid)
from cron.job
where jobname = 'realtalent-webhook-runner';

select cron.schedule(
  'realtalent-webhook-runner',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'realtalent_webhook_project_url' order by created_at desc limit 1) || '/functions/v1/automation-webhook-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'realtalent_webhook_anon_key' order by created_at desc limit 1),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'realtalent_webhook_cron_secret' order by created_at desc limit 1)
    ),
    body := jsonb_build_object('source', 'pg_cron', 'requestedAt', now())
  ) as request_id;
  $$
);

select jobid, jobname, schedule, active from cron.job where jobname = 'realtalent-webhook-runner';
