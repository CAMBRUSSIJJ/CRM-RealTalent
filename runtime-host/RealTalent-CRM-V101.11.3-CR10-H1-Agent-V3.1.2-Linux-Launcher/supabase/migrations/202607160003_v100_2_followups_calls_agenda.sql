-- RealTalent CRM V100.2 — Follow-ups, Ligações e Agenda
-- Execute depois das migrations V100.0 e V100.1.

begin;

alter table public.activities add column if not exists source_type text not null default 'manual';
alter table public.activities add column if not exists source_id text;

-- Restringe os valores sem converter a coluna para enum, facilitando futuras extensões.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activities_source_type_check') then
    alter table public.activities add constraint activities_source_type_check
      check (source_type in ('manual','calendar','call','system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'calls_outcome_check') then
    alter table public.calls add constraint calls_outcome_check
      check (outcome in ('answered','no_answer','busy','voicemail','meeting_scheduled','proposal_sent','not_interested','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'calendar_events_status_check') then
    alter table public.calendar_events add constraint calendar_events_status_check
      check (status in ('confirmed','tentative','completed','cancelled'));
  end if;
end $$;

create index if not exists activities_org_type_due_idx
  on public.activities(organization_id, activity_type, due_at)
  where completed_at is null;
create index if not exists activities_source_idx
  on public.activities(organization_id, source_type, source_id)
  where source_id is not null;
create unique index if not exists activities_unique_module_source_idx
  on public.activities(organization_id, source_type, source_id)
  where source_id is not null and source_type in ('calendar','call');
create index if not exists calls_org_outcome_started_idx
  on public.calls(organization_id, outcome, started_at desc);
create index if not exists calendar_events_org_status_start_idx
  on public.calendar_events(organization_id, status, starts_at);

-- Mantém leads.next_action_at coerente com a primeira atividade pendente.
create or replace function public.refresh_lead_next_action(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_lead_id is null then return; end if;
  update public.leads l
     set next_action_at = (
       select min(a.due_at)
         from public.activities a
        where a.lead_id = p_lead_id
          and a.completed_at is null
          and a.due_at is not null
          and a.activity_type in ('followup','meeting','call')
     )
   where l.id = p_lead_id;
end;
$$;

create or replace function public.sync_lead_next_action_from_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_lead_next_action(old.lead_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.lead_id is distinct from new.lead_id then
    perform public.refresh_lead_next_action(old.lead_id);
  end if;
  perform public.refresh_lead_next_action(new.lead_id);
  return new;
end;
$$;

drop trigger if exists activities_sync_lead_next_action on public.activities;
create trigger activities_sync_lead_next_action
  after insert or update of lead_id, due_at, completed_at, activity_type or delete
  on public.activities
  for each row execute function public.sync_lead_next_action_from_activity();

-- Realtime para os três módulos.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activities') then
    alter publication supabase_realtime add table public.activities;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls') then
    alter publication supabase_realtime add table public.calls;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_events') then
    alter publication supabase_realtime add table public.calendar_events;
  end if;
end $$;

grant execute on function public.refresh_lead_next_action(uuid) to authenticated;

commit;
