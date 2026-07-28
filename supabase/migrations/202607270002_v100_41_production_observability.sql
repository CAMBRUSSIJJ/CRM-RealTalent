-- RealTalent CRM V100.41
-- Observabilidade operacional por organização, sem segredos no navegador.

begin;

create table public.system_health_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  severity text not null check (severity in ('info','warning','error','critical')),
  source text not null check (char_length(trim(source)) between 1 and 80),
  event_code text not null default 'client_diagnostic' check (char_length(trim(event_code)) between 1 and 100),
  message text not null check (char_length(trim(message)) between 1 and 1000),
  reference text not null default '',
  route text not null default '',
  app_version text not null default '',
  correlation_id text not null default '',
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text not null default ''
);

create index system_health_events_org_time_idx on public.system_health_events(organization_id, occurred_at desc);
create index system_health_events_open_idx on public.system_health_events(organization_id, severity, occurred_at desc) where resolved_at is null;
create unique index system_health_events_org_reference_idx on public.system_health_events(organization_id, reference) where reference <> '';

alter table public.system_health_events enable row level security;

create policy system_health_events_select_admin on public.system_health_events
for select to authenticated
using (public.is_organization_admin(organization_id));

create policy system_health_events_insert_member on public.system_health_events
for insert to authenticated
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and public.is_organization_member(organization_id)
);

create policy system_health_events_update_admin on public.system_health_events
for update to authenticated
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

create policy system_health_events_delete_admin on public.system_health_events
for delete to authenticated
using (public.is_organization_admin(organization_id));

create or replace function public.resolve_system_health_event(
  p_event_id uuid,
  p_resolution_note text default ''
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.system_health_events where id=p_event_id;
  if v_organization_id is null or auth.uid() is null or not public.is_organization_admin(v_organization_id) then
    raise exception 'Acesso negado';
  end if;
  update public.system_health_events
     set resolved_at=now(), resolved_by=auth.uid(), resolution_note=left(trim(coalesce(p_resolution_note,'')),1000)
   where id=p_event_id and resolved_at is null;
  return found;
end;
$$;

grant execute on function public.resolve_system_health_event(uuid,text) to authenticated;

commit;
