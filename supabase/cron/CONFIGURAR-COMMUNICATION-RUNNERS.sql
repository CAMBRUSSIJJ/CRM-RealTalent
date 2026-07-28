-- V100.42 — Workers de comunicações oficiais.
-- Execute no SQL Editor depois de publicar as Edge Functions e criar os secrets no Vault.
-- Substitua os nomes dos secrets conforme a política do ambiente.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
  from cron.job
 where jobname in ('realtalent-communication-dispatch', 'realtalent-communication-sync');

select cron.schedule(
  'realtalent-communication-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/communication-dispatch-worker',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-worker-secret', current_setting('app.settings.communication_worker_secret')
    ),
    body := '{"limit":25}'::jsonb
  );
  $$
);

select cron.schedule(
  'realtalent-communication-sync',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/communication-sync-worker',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-worker-secret', current_setting('app.settings.communication_worker_secret')
    ),
    body := '{"limit":25}'::jsonb
  );
  $$
);
