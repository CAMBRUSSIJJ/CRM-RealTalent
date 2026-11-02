-- Task assignee reminders: durable queue, explicit preferences, no automatic external delivery.
-- Edge worker and secret-backed scheduler must be enabled separately after verification.
create table if not exists public.task_notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  whatsapp_phone_e164 text,
  whatsapp_consented_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint task_notification_phone_format check (whatsapp_phone_e164 is null or whatsapp_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint task_notification_consent_required check (not whatsapp_enabled or (whatsapp_phone_e164 is not null and whatsapp_consented_at is not null))
);
alter table public.task_notification_preferences enable row level security;
revoke all on public.task_notification_preferences from anon, authenticated;
grant select, insert, update (email_enabled, whatsapp_enabled, whatsapp_phone_e164, whatsapp_consented_at, updated_at) on public.task_notification_preferences to authenticated;
create policy task_notification_preferences_read_self on public.task_notification_preferences for select to authenticated
 using (user_id = (select auth.uid()) and exists
   (select 1 from public.organization_members m where m.organization_id = task_notification_preferences.organization_id and m.user_id = (select auth.uid())));
create policy task_notification_preferences_insert_self on public.task_notification_preferences for insert to authenticated
 with check (user_id = (select auth.uid()) and exists
   (select 1 from public.organization_members m where m.organization_id = task_notification_preferences.organization_id and m.user_id = (select auth.uid())));
create policy task_notification_preferences_update_self on public.task_notification_preferences for update to authenticated
 using (user_id = (select auth.uid()) and exists
   (select 1 from public.organization_members m where m.organization_id = task_notification_preferences.organization_id and m.user_id = (select auth.uid())))
 with check (user_id = (select auth.uid()) and exists
   (select 1 from public.organization_members m where m.organization_id = task_notification_preferences.organization_id and m.user_id = (select auth.uid())));

-- No client writes or reads: a verified number must be installed by a future OTP workflow.
create table if not exists public.task_notification_verified_phones (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  verified_at timestamptz not null,
  primary key (organization_id, user_id)
);
alter table public.task_notification_verified_phones enable row level security;
revoke all on public.task_notification_verified_phones from public, anon, authenticated;

create table if not exists public.task_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  assignee_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  event_type text not null check (event_type in ('assigned', 'due_soon')),
  channel text not null check (channel in ('in_app', 'email', 'whatsapp')),
  scheduled_at timestamptz not null,
  task_due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'blocked', 'failed', 'cancelled')),
  attempt_count int not null default 0 check (attempt_count >= 0),
  last_error text,
  claimed_at timestamptz,
  processed_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (event_key, channel)
);
create index if not exists task_notification_outbox_due on public.task_notification_outbox(scheduled_at, id) where status = 'pending';
create index if not exists task_notification_outbox_task on public.task_notification_outbox(task_id, status);
alter table public.task_notification_outbox enable row level security;
revoke all on public.task_notification_outbox from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.queue_work_task_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changed_assignment boolean;
  changed_due boolean;
  active_task boolean;
  key_base text;
  event_kind text;
  event_at timestamptz;
  one_channel text;
begin
  changed_assignment := tg_op = 'INSERT';
  changed_due := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    changed_assignment := new.assignee_id is distinct from old.assignee_id;
    changed_due := new.due_at is distinct from old.due_at;
    if changed_assignment or changed_due or new.status is distinct from old.status then
      update public.task_notification_outbox set status = 'cancelled', processed_at = now()
        where task_id = new.id and status = 'pending';
    else
      return new;
    end if;
  end if;
  active_task := new.assignee_id is not null and new.status in ('todo','in_progress','blocked');
  if not active_task then return new; end if;
  -- Only notify recipients who still belong to this workspace.
  if not exists (select 1 from public.organization_members m
    where m.organization_id = new.organization_id and m.user_id = new.assignee_id) then return new; end if;
  for event_kind, event_at in
    select 'assigned'::text, now() where changed_assignment
    union all
    select 'due_soon'::text, greatest(now(), new.due_at - interval '1 hour')
      where new.due_at is not null and new.due_at > now()
        and (changed_due or changed_assignment or (tg_op='UPDATE' and new.status is distinct from old.status))
  loop
    key_base := new.id::text || ':' || event_kind || ':' || new.assignee_id::text || ':' || new.updated_at::text;
    foreach one_channel in array array['in_app','email','whatsapp'] loop
      insert into public.task_notification_outbox
        (organization_id,task_id,assignee_id,event_key,event_type,channel,scheduled_at,task_due_at)
      values (new.organization_id,new.id,new.assignee_id,key_base,event_kind,one_channel,event_at,new.due_at)
      on conflict (event_key, channel) do nothing;
    end loop;
  end loop;
  return new;
end $$;
revoke all on function private.queue_work_task_notifications() from public, anon, authenticated;
drop trigger if exists work_task_queue_notifications on public.work_tasks;
create trigger work_task_queue_notifications
after insert or update of assignee_id,due_at,status on public.work_tasks
for each row execute function private.queue_work_task_notifications();

comment on table public.task_notification_outbox is 'Server-only reminder queue; no worker or external sends enabled merely by applying this migration.';
