-- Run manually ONLY after securing the worker in Supabase Edge Function Secrets.
-- The worker has two independent kill switches, both OFF by default.
--
-- Requirements:
-- 1. Enable pg_cron and pg_net in Supabase Dashboard -> Database -> Extensions.
-- 2. Store `task_reminder_worker_url` in Supabase Vault. The value is an
--    HTTPS function URL ending in /functions/v1/task-reminder-dispatch.
-- 3. Store `task_reminder_cron_secret` in Supabase Vault.
--    Its value must equal the Edge Function secret TASK_REMINDER_CRON_SECRET,
--    contain >=32 characters, and must NEVER be committed here.
-- 4. Start with TASK_REMINDER_INTERNAL_ENABLED=true and
--    TASK_REMINDER_DELIVERY_ENABLED unset/false. Do not activate external
--    channels until domain/phone verification and end-to-end acceptance.
--
-- Never paste credentials into this file; use the Vault UI.

do $$
declare
  worker_url text;
  worker_secret text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron must be enabled separately before scheduling';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net must be enabled separately before scheduling';
  end if;
  select decrypted_secret into worker_url
  from vault.decrypted_secrets where name='task_reminder_worker_url' limit 1;
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets where name='task_reminder_cron_secret' limit 1;
  if worker_url !~ '^https://[a-zA-Z0-9.-]+/functions/v1/task-reminder-dispatch$'
     or length(coalesce(worker_secret,'')) < 32 then
    raise exception 'HTTPS worker URL or 32+ character Vault secret missing';
  end if;
end $$;

-- The Vault lookup executes on each run: no secrets are persisted in cron.job.
select cron.schedule('realtalent-task-assignee-reminders', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='task_reminder_worker_url'),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-task-reminder-secret',(select decrypted_secret from vault.decrypted_secrets where name='task_reminder_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$job$);

-- To suspend dispatch at any point:
-- select cron.unschedule('realtalent-task-assignee-reminders');
