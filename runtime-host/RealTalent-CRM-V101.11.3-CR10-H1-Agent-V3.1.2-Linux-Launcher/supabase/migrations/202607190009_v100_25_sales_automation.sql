-- RealTalent CRM V100.25 — operação pós-captura, fila resiliente e contato assistido.
begin;

alter table public.automation_events
  add column if not exists max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  add column if not exists priority integer not null default 100 check (priority between 1 and 1000),
  add column if not exists source text not null default 'system',
  add column if not exists batch_id text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

alter table public.automation_events drop constraint if exists automation_events_status_check;
alter table public.automation_events add constraint automation_events_status_check
  check (status in ('queued','processing','completed','failed','cancelled','dead_letter'));

drop index if exists public.automation_events_queue_idx;
create index automation_events_queue_idx
  on public.automation_events(priority, available_at, created_at)
  where status in ('queued','failed');
create index if not exists automation_events_org_status_idx
  on public.automation_events(organization_id, status, created_at desc);

create table if not exists public.seller_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null,
  body text not null default '',
  severity text not null default 'info' check (severity in ('info','success','warning','danger')),
  status text not null default 'unread' check (status in ('unread','read','dismissed')),
  action_route text not null default 'automations',
  source_type text not null default 'automation',
  source_id text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create unique index if not exists seller_notifications_source_idx
  on public.seller_notifications(organization_id, source_type, source_id, title)
  where source_id is not null;
create index if not exists seller_notifications_user_status_idx
  on public.seller_notifications(organization_id, user_id, status, created_at desc);

create table if not exists public.contact_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email','instagram')),
  subject text not null default '',
  message text not null,
  status text not null default 'ready' check (status in ('ready','used','discarded')),
  source_type text not null default 'automation',
  source_id text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create unique index if not exists contact_drafts_source_idx
  on public.contact_drafts(organization_id, source_type, source_id, channel)
  where source_id is not null;
create index if not exists contact_drafts_org_status_idx
  on public.contact_drafts(organization_id, status, created_at desc);

alter table public.seller_notifications enable row level security;
alter table public.contact_drafts enable row level security;

drop policy if exists automation_events_select on public.automation_events;
create policy automation_events_select on public.automation_events for select to authenticated
  using (public.is_organization_member(organization_id));

create policy seller_notifications_select on public.seller_notifications for select to authenticated
  using (public.is_organization_member(organization_id) and (user_id is null or user_id = auth.uid() or public.is_organization_admin(organization_id)));
create policy seller_notifications_insert on public.seller_notifications for insert to authenticated
  with check (public.is_organization_member(organization_id));
create policy seller_notifications_update on public.seller_notifications for update to authenticated
  using (public.is_organization_member(organization_id) and (user_id is null or user_id = auth.uid() or public.is_organization_admin(organization_id)))
  with check (public.is_organization_member(organization_id));

create policy contact_drafts_select on public.contact_drafts for select to authenticated
  using (public.is_organization_member(organization_id));
create policy contact_drafts_insert on public.contact_drafts for insert to authenticated
  with check (public.is_organization_member(organization_id));
create policy contact_drafts_update on public.contact_drafts for update to authenticated
  using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));

create or replace function public.retry_automation_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.automation_events where id = p_event_id;
  if v_organization_id is null or auth.uid() is null or not public.is_organization_admin(v_organization_id) then
    raise exception 'Somente administradores podem reprocessar eventos';
  end if;
  update public.automation_events
    set status = 'queued', attempts = 0, available_at = now(), locked_at = null,
        last_error = null, processed_at = null, last_attempt_at = null, dead_lettered_at = null
    where id = p_event_id and status in ('failed','dead_letter','cancelled');
  return found;
end;
$$;

create or replace function public.cancel_automation_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.automation_events where id = p_event_id;
  if v_organization_id is null or auth.uid() is null or not public.is_organization_admin(v_organization_id) then
    raise exception 'Somente administradores podem cancelar eventos';
  end if;
  update public.automation_events
    set status = 'cancelled', locked_at = null, processed_at = now()
    where id = p_event_id and status in ('queued','failed');
  return found;
end;
$$;

create or replace function public.retry_failed_automation_events(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Somente administradores podem reprocessar a fila';
  end if;
  update public.automation_events
    set status = 'queued', attempts = 0, available_at = now(), locked_at = null,
        last_error = null, processed_at = null, last_attempt_at = null, dead_lettered_at = null
    where organization_id = p_organization_id and status in ('failed','dead_letter');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke insert, update, delete on table public.automation_events from authenticated;
revoke delete on table public.seller_notifications from authenticated;
revoke delete on table public.contact_drafts from authenticated;
revoke all on function public.retry_automation_event(uuid) from public, anon;
revoke all on function public.cancel_automation_event(uuid) from public, anon;
revoke all on function public.retry_failed_automation_events(uuid) from public, anon;
grant execute on function public.retry_automation_event(uuid) to authenticated;
grant execute on function public.cancel_automation_event(uuid) to authenticated;
grant execute on function public.retry_failed_automation_events(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.seller_notifications;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.contact_drafts;
exception when duplicate_object then null;
end $$;

comment on table public.seller_notifications is 'Avisos internos acionáveis gerados pelo fluxo comercial.';
comment on table public.contact_drafts is 'Mensagens preparadas pela automação; o envio externo exige confirmação humana.';
comment on column public.automation_events.dead_lettered_at is 'Data em que o evento esgotou as tentativas automáticas.';

commit;
