-- Private, fail-closed bridge between Supabase task notification queue and the
-- existing Railway WhatsApp QR gateway. Consent/phone checks occur in PostgreSQL
-- before any HTTP request is created. This does not use the Meta Cloud API.
-- Nothing is sent until the server secret and QR session are available.
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists rt_task_reminders.qr_delivery_config (
  singleton boolean primary key default true check (singleton = true),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into rt_task_reminders.qr_delivery_config(singleton,enabled)
values(true,false) on conflict (singleton) do nothing;

create table if not exists rt_task_reminders.qr_delivery_requests (
  job_id uuid primary key references public.task_notification_outbox(id) on delete cascade,
  request_id bigint not null unique,
  created_at timestamptz not null default now()
);
revoke all on rt_task_reminders.qr_delivery_config from public, anon, authenticated;
revoke all on rt_task_reminders.qr_delivery_requests from public, anon, authenticated;

create or replace function rt_task_reminders.dispatch_railway_qr_notifications()
returns integer language plpgsql security definer set search_path = ''
as $body$
declare
  job record;
  task_row record;
  prefs record;
  v_phone text;
  v_verified_at timestamptz;
  v_secret text;
  v_request_id bigint;
  v_count integer := 0;
  v_reason text;
  v_link text := 'https://realtalent-runtime-production.up.railway.app/internal/task-reminders/qr';
begin
  if not coalesce((select enabled from rt_task_reminders.qr_delivery_config where singleton),false) then return 0; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='rt_task_qr_bridge_v1' limit 1;
  if length(coalesce(v_secret,'')) < 32 then return 0; end if;

  for job in
    select o.id,o.organization_id,o.task_id,o.assignee_id,o.event_type,o.scheduled_at,o.task_due_at
    from public.task_notification_outbox o
    where o.channel='whatsapp' and o.status='pending' and o.scheduled_at <= now()
    order by o.scheduled_at
    limit 10
    for update of o skip locked
  loop
    v_reason := null;
    select t.id,t.title,t.due_at,t.status,t.assignee_id,t.reminder_enabled,t.reminder_channels
      into task_row from public.work_tasks t
      where t.id=job.task_id and t.organization_id=job.organization_id;

    if job.scheduled_at < now() - (case when job.event_type='assigned' then interval '60 minutes' else interval '180 minutes' end)
      then v_reason := 'stale_reminder_expired';
    elsif task_row.id is null or task_row.assignee_id is distinct from job.assignee_id
      or task_row.status not in ('todo','in_progress','blocked')
      or not coalesce(task_row.reminder_enabled,false)
      or not ('whatsapp'=any(task_row.reminder_channels))
      or (job.event_type='due_soon' and task_row.due_at is distinct from job.task_due_at)
      or not exists(select 1 from public.organization_members m where m.organization_id=job.organization_id and m.user_id=job.assignee_id)
      then v_reason := 'task_no_longer_eligible';
    end if;
    if v_reason is not null then
      update public.task_notification_outbox
      set status='skipped',last_error=v_reason,processed_at=now()
      where id=job.id and status='pending';
      continue;
    end if;

    select p.whatsapp_enabled,p.whatsapp_consented_at,p.whatsapp_phone_e164
      into prefs from public.task_notification_preferences p
      where p.organization_id=job.organization_id and p.user_id=job.assignee_id;
    if not coalesce(prefs.whatsapp_enabled,false) or prefs.whatsapp_consented_at is null then
      v_reason := 'whatsapp_consent_required';
    end if;
    select c.phone_e164 into v_phone from public.team_member_notification_contacts c
      where c.organization_id=job.organization_id and c.user_id=job.assignee_id;
    v_phone := coalesce(v_phone,prefs.whatsapp_phone_e164,'');
    if v_reason is null and v_phone !~ '^\\+[1-9][0-9]{7,14}$' then
      v_reason := 'recipient_phone_missing';
    elsif v_reason is null and v_phone is distinct from prefs.whatsapp_phone_e164 then
      v_reason := 'directory_phone_change_requires_employee_reconsent';
    end if;
    select v.verified_at into v_verified_at
      from public.task_notification_verified_phones v
      where v.organization_id=job.organization_id and v.user_id=job.assignee_id
        and v.phone_e164=v_phone;
    if v_reason is null and v_verified_at is null then v_reason := 'phone_verification_required'; end if;
    if v_reason is not null then
      update public.task_notification_outbox
      set status='blocked',last_error=v_reason,processed_at=now()
      where id=job.id and status='pending';
      continue;
    end if;

    -- net.http_post is enqueued transactionally. Once processing is claimed,
    -- no second job or worker may send this event again.
    select net.http_post(
      url:=v_link,
      headers:=pg_catalog.jsonb_build_object(
        'content-type','application/json',
        'x-realtalent-task-bridge-token',v_secret
      ),
      body:=pg_catalog.jsonb_build_object(
        'workspaceId',job.organization_id::text,
        'jobId',job.id::text,
        'phone',v_phone,
        'title',left(coalesce(task_row.title,'Tarefa'),120),
        'eventType',job.event_type,
        'dueAt',task_row.due_at
      ),
      timeout_milliseconds:=25000
    ) into v_request_id;

    insert into rt_task_reminders.qr_delivery_requests(job_id,request_id)
      values(job.id,v_request_id)
      on conflict (job_id) do nothing;
    update public.task_notification_outbox
      set status='processing',attempt_count=attempt_count+1,claimed_at=now(),last_error=null
      where id=job.id and status='pending';
    v_count := v_count+1;
  end loop;
  return v_count;
end
$body$;

create or replace function rt_task_reminders.settle_railway_qr_notifications()
returns integer language plpgsql security definer set search_path=''
as $body$
declare
  row_item record;
  reply_row record;
  payload jsonb;
  successful boolean;
  v_processed integer := 0;
  v_reason text;
begin
  for row_item in
    select o.id,o.status,q.request_id,q.created_at
    from public.task_notification_outbox o
    join rt_task_reminders.qr_delivery_requests q on q.job_id=o.id
    where o.status='processing'
    order by q.created_at limit 50
    for update of o skip locked
  loop
    select r.status_code,r.content,r.timed_out,r.error_msg into reply_row
      from net._http_response r where r.id=row_item.request_id;
    if not found and now() - row_item.created_at < interval '120 seconds' then continue; end if;
    payload := '{}'::jsonb;
    if reply_row.content is not null then
      begin payload := reply_row.content::jsonb; exception when others then payload := '{}'::jsonb; end;
    end if;
    successful := reply_row.status_code in (200,202)
      and payload->>'state'='accepted_by_gateway'
      and payload->>'ok'='true';
    if successful then
      update public.task_notification_outbox
        set status='sent',processed_at=now(),last_error=null,
          provider_message_id=case when coalesce(payload->>'gatewayEventId','')='' then null
            else 'qr:' || left(payload->>'gatewayEventId',90) end
      where id=row_item.id and status='processing';
    else
      v_reason := case
        when reply_row.status_code = 409 then 'qr_session_not_connected'
        when reply_row.status_code is null then 'delivery_outcome_unknown_requires_review'
        when reply_row.status_code in (401,403) then 'qr_bridge_auth_rejected'
        else 'gateway_send_unconfirmed_requires_review' end;
      update public.task_notification_outbox
        set status='blocked',processed_at=now(),last_error=v_reason
      where id=row_item.id and status='processing';
    end if;
    v_processed := v_processed+1;
  end loop;
  return v_processed;
end
$body$;

-- Neither browsers nor client JWTs may invoke privileged dispatch functions.
revoke all on function rt_task_reminders.dispatch_railway_qr_notifications() from public,anon,authenticated;
revoke all on function rt_task_reminders.settle_railway_qr_notifications() from public,anon,authenticated;

-- These cron jobs are inert until qr_delivery_config.enabled is switched on.
-- They intentionally do NOT touch the existing internal-notification schedule.
select cron.schedule('realtalent-task-qr-dispatch','* * * * *',
  'select rt_task_reminders.dispatch_railway_qr_notifications();');
select cron.schedule('realtalent-task-qr-settle','* * * * *',
  'select rt_task_reminders.settle_railway_qr_notifications();');
