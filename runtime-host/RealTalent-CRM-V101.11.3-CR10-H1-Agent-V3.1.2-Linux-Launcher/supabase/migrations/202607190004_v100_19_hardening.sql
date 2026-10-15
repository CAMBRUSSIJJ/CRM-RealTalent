-- V100.19: consentimento de gravação, realtime e endurecimento de funções.
alter table public.calls add column if not exists consent_at timestamptz;

drop policy if exists prospecting_events_insert on public.prospecting_events;
drop policy if exists prospecting_events_write on public.prospecting_events;
create policy prospecting_events_write on public.prospecting_events for all to authenticated
  using (public.can_write_organization(organization_id))
  with check (public.can_write_organization(organization_id));

create or replace function public.refresh_lead_next_action(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  if p_lead_id is null then return; end if;
  select organization_id into v_organization_id from public.leads where id = p_lead_id;
  if v_organization_id is null then return; end if;
  if auth.uid() is not null and not public.is_organization_member(v_organization_id) then
    raise exception 'Lead does not belong to an authorized organization';
  end if;
  update public.leads l
     set next_action_at = (
       select min(a.due_at) from public.activities a
       where a.lead_id = p_lead_id and a.completed_at is null and a.due_at is not null
         and a.activity_type in ('followup','meeting','call')
     )
   where l.id = p_lead_id;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playbooks'
  ) then
    alter publication supabase_realtime add table public.playbooks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prospecting_leads'
  ) then
    alter publication supabase_realtime add table public.prospecting_leads;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prospecting_events'
  ) then
    alter publication supabase_realtime add table public.prospecting_events;
  end if;
end $$;

-- A sincronização de próxima ação deve passar por RLS/RPCs autorizados,
-- nunca ficar executável anonimamente por padrão.
revoke all on function public.refresh_lead_next_action(uuid) from public;
revoke all on function public.refresh_lead_next_action(uuid) from anon;
grant execute on function public.refresh_lead_next_action(uuid) to authenticated;
