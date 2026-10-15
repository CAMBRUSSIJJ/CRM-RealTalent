-- RealTalent CRM V100.3 — Metas, Automações e Métricas
-- Execute depois das migrations V100.0, V100.1 e V100.2.

begin;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goals_metric_check') then
    alter table public.goals add constraint goals_metric_check
      check (metric in ('calls','contacts','followups','meetings','proposals','wins','revenue','new_leads'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'automation_rules_trigger_type_check') then
    alter table public.automation_rules add constraint automation_rules_trigger_type_check
      check (trigger_type in ('lead_created','stage_changed','call_outcome','activity_overdue','manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'automation_rules_actions_array_check') then
    alter table public.automation_rules add constraint automation_rules_actions_array_check
      check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'automation_rules_conditions_array_check') then
    alter table public.automation_rules add constraint automation_rules_conditions_array_check
      check (jsonb_typeof(conditions) = 'array');
  end if;
end $$;

create index if not exists goals_org_period_metric_idx on public.goals(organization_id, period_start, period_end, metric);
create index if not exists automation_rules_org_enabled_trigger_idx on public.automation_rules(organization_id, enabled, trigger_type);
create index if not exists automation_runs_org_started_status_idx on public.automation_runs(organization_id, started_at desc, status);

-- Métricas auxiliares para consultas administrativas e conferência do frontend.
create or replace view public.crm_daily_activity_metrics
with (security_invoker = true)
as
select
  organization_id,
  date_trunc('day', created_at)::date as metric_date,
  count(*) filter (where activity_type = 'followup' and completed_at is not null) as completed_followups,
  count(*) filter (where activity_type = 'meeting' and completed_at is not null) as completed_meetings,
  count(*) filter (where activity_type = 'call') as calls
from public.activities
group by organization_id, date_trunc('day', created_at)::date;

grant select on public.crm_daily_activity_metrics to authenticated;

-- Publica atualizações para que Metas e Automações reflitam mudanças em tempo real.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goals') then
    alter publication supabase_realtime add table public.goals;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'automation_rules') then
    alter publication supabase_realtime add table public.automation_rules;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'automation_runs') then
    alter publication supabase_realtime add table public.automation_runs;
  end if;
end $$;

commit;
