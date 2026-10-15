-- RealTalent CRM V101.9.5 — Workflow Runtime 3.0
-- Persisted execution state for waits, branches, retries and idempotent background resumption.
begin;

create table if not exists public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  trigger_type text not null,
  entity_id text not null,
  idempotency_key text not null,
  correlation_id text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting','retrying','succeeded','failed','cancelled')),
  current_step integer not null default 0 check (current_step >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  input jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  last_error text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists workflow_executions_due_idx
  on public.workflow_executions(next_run_at, created_at)
  where status in ('queued','waiting','retrying');
create index if not exists workflow_executions_org_status_idx
  on public.workflow_executions(organization_id, status, created_at desc);
create index if not exists workflow_executions_rule_idx
  on public.workflow_executions(rule_id, created_at desc);

create table if not exists public.workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id uuid not null references public.workflow_executions(id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  step_type text not null check (step_type in ('action','wait','branch')),
  action_type text,
  status text not null default 'pending' check (status in ('pending','running','waiting','succeeded','failed','skipped')),
  attempt integer not null default 0 check (attempt >= 0),
  branch_result boolean,
  scheduled_for timestamptz,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (execution_id, step_index)
);
create index if not exists workflow_step_runs_execution_idx on public.workflow_step_runs(execution_id, step_index);

alter table public.workflow_executions enable row level security;
alter table public.workflow_step_runs enable row level security;

create policy workflow_executions_select on public.workflow_executions for select to authenticated
  using (public.is_organization_member(organization_id));
create policy workflow_step_runs_select on public.workflow_step_runs for select to authenticated
  using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.workflow_executions from authenticated;
revoke insert, update, delete on public.workflow_step_runs from authenticated;

create or replace function public.enqueue_workflow_execution(
  p_organization_id uuid,
  p_rule_id uuid,
  p_trigger_type text,
  p_entity_id text,
  p_lead_id uuid,
  p_idempotency_key text,
  p_correlation_id text,
  p_input jsonb default '{}'::jsonb,
  p_context jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execution_id uuid;
  v_rule_org uuid;
  v_rule_enabled boolean;
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then
    raise exception 'Sem permissão para enfileirar automações neste workspace';
  end if;
  select organization_id, enabled into v_rule_org, v_rule_enabled from public.automation_rules where id = p_rule_id;
  if v_rule_org is null or v_rule_org <> p_organization_id then raise exception 'Regra não encontrada neste workspace'; end if;
  if not v_rule_enabled then raise exception 'A regra está pausada'; end if;
  if p_lead_id is not null and not exists (select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id) then
    raise exception 'Lead relacionado não pertence ao workspace';
  end if;
  insert into public.workflow_executions(
    organization_id, rule_id, lead_id, trigger_type, entity_id, idempotency_key, correlation_id, input, context
  ) values (
    p_organization_id, p_rule_id, p_lead_id, p_trigger_type, p_entity_id,
    left(coalesce(nullif(p_idempotency_key,''), p_rule_id::text || ':' || p_trigger_type || ':' || p_entity_id), 500),
    left(coalesce(nullif(p_correlation_id,''), 'wf:' || p_trigger_type || ':' || p_entity_id), 500),
    coalesce(p_input,'{}'::jsonb), coalesce(p_context,'{}'::jsonb)
  )
  on conflict (organization_id, idempotency_key) do update set updated_at = workflow_executions.updated_at
  returning id into v_execution_id;
  return v_execution_id;
end;
$$;

create or replace function public.retry_workflow_execution(p_execution_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.workflow_executions where id=p_execution_id;
  if v_org is null or auth.uid() is null or not public.is_organization_admin(v_org) then raise exception 'Somente administradores podem reprocessar execuções'; end if;
  update public.workflow_executions set status='queued', attempts=0, next_run_at=now(), locked_at=null, last_error=null, finished_at=null, updated_at=now()
   where id=p_execution_id and status in ('failed','cancelled');
  return found;
end;
$$;

create or replace function public.cancel_workflow_execution(p_execution_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.workflow_executions where id=p_execution_id;
  if v_org is null or auth.uid() is null or not public.is_organization_admin(v_org) then raise exception 'Somente administradores podem cancelar execuções'; end if;
  update public.workflow_executions set status='cancelled', locked_at=null, finished_at=now(), updated_at=now()
   where id=p_execution_id and status in ('queued','waiting','retrying');
  return found;
end;
$$;

revoke all on function public.enqueue_workflow_execution(uuid,uuid,text,text,uuid,text,text,jsonb,jsonb) from public, anon;
revoke all on function public.retry_workflow_execution(uuid) from public, anon;
revoke all on function public.cancel_workflow_execution(uuid) from public, anon;
grant execute on function public.enqueue_workflow_execution(uuid,uuid,text,text,uuid,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.retry_workflow_execution(uuid) to authenticated;
grant execute on function public.cancel_workflow_execution(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.workflow_executions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.workflow_step_runs;
exception when duplicate_object then null; end $$;

comment on table public.workflow_executions is 'Workflow Runtime 3.0: estado durável da execução, retomável por worker/pg_cron.';
comment on table public.workflow_step_runs is 'Workflow Runtime 3.0: histórico por etapa para inspector, retry e branch.';
comment on column public.workflow_executions.idempotency_key is 'Chave durável que impede a duplicação da mesma entrada de workflow.';

commit;
