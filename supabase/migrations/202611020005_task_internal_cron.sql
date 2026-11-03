-- Database-only internal delivery. No third-party messages or service keys.
-- The job must not act on email/whatsapp outbox rows.
create extension if not exists pg_cron;

create unique index if not exists seller_notifications_task_reminder_uniq
  on public.seller_notifications(organization_id, source_type, source_id)
  where source_type = 'task-reminder' and source_id is not null;

create or replace function rt_task_reminders.dispatch_internal_notifications()
returns integer language plpgsql security definer set search_path = '' as $fn$
declare
  job record;
  t record;
  processed integer := 0;
  allowed_member boolean;
begin
  for job in
    select id, organization_id, task_id, assignee_id, event_type, scheduled_at, task_due_at
    from public.task_notification_outbox
    where status = 'pending' and channel = 'in_app' and scheduled_at <= now()
    order by scheduled_at asc
    limit 50
    for update skip locked
  loop
    select id, organization_id, assignee_id, title, priority, due_at, status, reminder_enabled, reminder_channels
      into t from public.work_tasks
      where id = job.task_id and organization_id = job.organization_id;
    select exists (
      select 1 from public.organization_members m
      where m.organization_id = job.organization_id and m.user_id = job.assignee_id
    ) into allowed_member;

    if t.id is null
       or t.assignee_id is distinct from job.assignee_id
       or t.status not in ('todo','in_progress','blocked')
       or not coalesce(t.reminder_enabled,false)
       or not ('in_app' = any(t.reminder_channels))
       or not allowed_member
       or (job.event_type = 'due_soon' and t.due_at is distinct from job.task_due_at)
       or (job.event_type = 'assigned' and now()-job.scheduled_at > interval '60 minutes')
       or (job.event_type = 'due_soon' and now()-job.scheduled_at > interval '180 minutes')
    then
      update public.task_notification_outbox
        set status='skipped',processed_at=now()
        where id=job.id and status='pending';
    else
      insert into public.seller_notifications
        (organization_id,user_id,lead_id,title,body,severity,status,action_route,source_type,source_id)
      values (
        job.organization_id,job.assignee_id,null,
        case when job.event_type='assigned' then 'Nova tarefa atribuída no RealTalent'
             else 'Sua tarefa está próxima do prazo' end,
        'Tarefa: ' || left(coalesce(t.title,'Tarefa'),120)
         || E'\nPrazo: ' || coalesce(to_char(timezone('America/Sao_Paulo',t.due_at),'DD/MM/YYYY HH24:MI'),'Sem prazo')
         || E'\nAcesse Tarefas no RealTalent.',
        case when t.priority='urgent' then 'warning' else 'info' end,
        'unread','tasks','task-reminder',job.id::text
      ) on conflict do nothing;
      update public.task_notification_outbox
        set status='sent', processed_at=now()
        where id=job.id and status='pending';
      processed := processed + 1;
    end if;
  end loop;
  return processed;
end
$fn$;

revoke all on function rt_task_reminders.dispatch_internal_notifications() from public, anon, authenticated;

-- Only writes in-app notifications; outbound WhatsApp/e-mail remain gated independently.
select cron.schedule(
  'realtalent-task-internal-reminders',
  '* * * * *',
  'select rt_task_reminders.dispatch_internal_notifications();'
);
