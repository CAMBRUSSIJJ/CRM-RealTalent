-- Per-task reminders are stored atomically with work_tasks (no separate write).
-- Client can see sanitized queue state only for tasks it may already view.
alter table public.work_tasks
  add column if not exists reminder_enabled boolean not null default true,
  add column if not exists reminder_on_assignment boolean not null default true,
  add column if not exists reminder_channels text[] not null default array['in_app']::text[],
  add column if not exists reminder_offsets_minutes int[] not null default array[60]::int[],
  add column if not exists reminder_custom_minutes int;

alter table public.work_tasks drop constraint if exists work_tasks_reminder_channels_valid;
alter table public.work_tasks add constraint work_tasks_reminder_channels_valid
  check (reminder_channels <@ array['in_app','email','whatsapp']::text[]
    and cardinality(reminder_channels) between 0 and 3);
alter table public.work_tasks drop constraint if exists work_tasks_reminder_offsets_valid;
alter table public.work_tasks add constraint work_tasks_reminder_offsets_valid
  check (reminder_offsets_minutes <@ array[15,60,1440]::int[]
    and cardinality(reminder_offsets_minutes) between 0 and 3);
alter table public.work_tasks drop constraint if exists work_tasks_reminder_custom_valid;
alter table public.work_tasks add constraint work_tasks_reminder_custom_valid
  check (reminder_custom_minutes is null or reminder_custom_minutes between 5 and 10080);

-- Only safe status columns: never expose provider IDs, retry errors, tokens,
-- recipient phone numbers, or idempotency identifiers to a browser.
revoke all on public.task_notification_outbox from anon, authenticated;
grant select (id, organization_id, task_id, event_type, channel, status,
  scheduled_at, processed_at, created_at)
on public.task_notification_outbox to authenticated;
drop policy if exists task_notification_outbox_visible_task on public.task_notification_outbox;
create policy task_notification_outbox_visible_task
on public.task_notification_outbox for select to authenticated
using (
  exists (
    select 1 from public.work_tasks t
    where t.id = task_notification_outbox.task_id
      and t.organization_id = task_notification_outbox.organization_id
  )
);

-- Supabase service role continues to write the private outbox. No user
-- can insert, update or delete queued messages through PostgREST.
create or replace function rt_task_reminders.queue_work_task_notifications()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changed_assignment boolean;
  changed_due boolean;
  changed_rules boolean;
  changed_status boolean;
  active_task boolean;
  key_base text;
  event_kind text;
  event_at timestamptz;
  one_channel text;
  one_offset int;
  all_offsets int[];
begin
  changed_assignment := tg_op = 'INSERT';
  changed_due := tg_op = 'INSERT';
  changed_rules := tg_op = 'INSERT';
  changed_status := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    changed_assignment := new.assignee_id is distinct from old.assignee_id;
    changed_due := new.due_at is distinct from old.due_at;
    changed_status := new.status is distinct from old.status;
    changed_rules := new.reminder_enabled is distinct from old.reminder_enabled
      or new.reminder_on_assignment is distinct from old.reminder_on_assignment
      or new.reminder_channels is distinct from old.reminder_channels
      or new.reminder_offsets_minutes is distinct from old.reminder_offsets_minutes
      or new.reminder_custom_minutes is distinct from old.reminder_custom_minutes;
    if not (changed_assignment or changed_due or changed_status or changed_rules) then
      return new;
    end if;
    update public.task_notification_outbox
      set status='cancelled', processed_at=now()
      where task_id=new.id and status='pending';
  end if;

  active_task := new.reminder_enabled and new.assignee_id is not null
    and new.status in ('todo','in_progress','blocked')
    and cardinality(new.reminder_channels) > 0;
  if not active_task then return new; end if;

  if not exists(
    select 1 from public.organization_members m
    where m.organization_id = new.organization_id and m.user_id = new.assignee_id
  ) then return new; end if;

  -- Assignment notification only when assigning or reassigning; switching
  -- a channel must not re-notify an already assigned employee.
  if changed_assignment and new.reminder_on_assignment then
    key_base := new.id::text || ':assigned:' || new.assignee_id::text || ':' || new.updated_at::text;
    foreach one_channel in array new.reminder_channels loop
      insert into public.task_notification_outbox
        (organization_id,task_id,assignee_id,event_key,event_type,channel,scheduled_at,task_due_at)
      values (new.organization_id,new.id,new.assignee_id,key_base,'assigned',one_channel,now(),new.due_at)
      on conflict (event_key,channel) do nothing;
    end loop;
  end if;

  if new.due_at is null or new.due_at <= now() then return new; end if;
  if not (changed_assignment or changed_due or changed_status or changed_rules) then return new; end if;

  all_offsets := coalesce(new.reminder_offsets_minutes,array[]::int[]);
  if new.reminder_custom_minutes is not null then
    all_offsets := array_append(all_offsets,new.reminder_custom_minutes);
  end if;
  for one_offset in select distinct unnest(all_offsets) loop
    -- Do not send a 'one day before' reminder immediately when the deadline
    -- is already in two hours; keep the original scheduling promise truthful.
    if new.due_at <= now() + (one_offset * interval '1 minute') then continue; end if;
    event_kind := 'due_soon';
    event_at := new.due_at - (one_offset * interval '1 minute');
    key_base := new.id::text || ':due:' || one_offset::text || ':' ||
      new.assignee_id::text || ':' || new.updated_at::text;
    foreach one_channel in array new.reminder_channels loop
      insert into public.task_notification_outbox
        (organization_id,task_id,assignee_id,event_key,event_type,channel,scheduled_at,task_due_at)
      values (new.organization_id,new.id,new.assignee_id,key_base,event_kind,one_channel,event_at,new.due_at)
      on conflict (event_key,channel) do nothing;
    end loop;
  end loop;
  return new;
end $$;
revoke all on function rt_task_reminders.queue_work_task_notifications()
from public, anon, authenticated;
drop trigger if exists work_task_queue_notifications on public.work_tasks;
create trigger work_task_queue_notifications
after insert or update of assignee_id, due_at, status, reminder_enabled,
  reminder_on_assignment, reminder_channels, reminder_offsets_minutes,
  reminder_custom_minutes on public.work_tasks
for each row execute function rt_task_reminders.queue_work_task_notifications();
