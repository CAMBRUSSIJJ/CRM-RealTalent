-- Apply as one migration after validating against the CRM schema.
begin;
create table public.prospecting_local_connectors (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  token_hash text not null check (length(token_hash) = 64),
  enabled boolean not null default true,
  last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.prospecting_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  input jsonb not null check (jsonb_typeof(input) = 'object' and input ? 'organizationId' and input->>'organizationId' = organization_id::text),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  result jsonb,
  error_code text,
  attempts integer not null default 0,
  lease_id uuid,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  completed_at timestamptz
);
create index prospecting_ai_jobs_queue on public.prospecting_ai_jobs (organization_id, created_at) where status in ('queued','processing');
create index prospecting_ai_jobs_user on public.prospecting_ai_jobs (created_by, organization_id, created_at desc);
alter table public.prospecting_local_connectors enable row level security;
alter table public.prospecting_ai_jobs enable row level security;
revoke all on public.prospecting_local_connectors, public.prospecting_ai_jobs from anon, authenticated;
grant select (organization_id, enabled, last_seen_at, updated_at) on public.prospecting_local_connectors to authenticated;
grant select on public.prospecting_ai_jobs to authenticated;
grant insert (organization_id, created_by, input) on public.prospecting_ai_jobs to authenticated;
grant all on public.prospecting_local_connectors, public.prospecting_ai_jobs to service_role;
create policy prospecting_local_connector_read on public.prospecting_local_connectors for select to authenticated using (public.can_write_organization(organization_id));
create policy prospecting_ai_jobs_read on public.prospecting_ai_jobs for select to authenticated using (created_by = (select auth.uid()) and public.can_write_organization(organization_id));
create policy prospecting_ai_jobs_insert on public.prospecting_ai_jobs for insert to authenticated with check (created_by = (select auth.uid()) and public.can_write_organization(organization_id));

create function public.claim_local_prospecting_job(p_organization_id uuid, p_token_hash text)
returns setof public.prospecting_ai_jobs language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.prospecting_local_connectors where organization_id=p_organization_id and token_hash=p_token_hash and enabled) then return; end if;
  update public.prospecting_ai_jobs set status='failed', error_code='local_job_expired', completed_at=now()
  where organization_id=p_organization_id and status in ('queued','processing') and (expires_at<=now() or (attempts>=3 and locked_until<now()));
  return query
  with candidate as (
    select j.id from public.prospecting_ai_jobs j
    where j.organization_id=p_organization_id and j.expires_at>now() and j.attempts<3
      and (j.status='queued' or (j.status='processing' and j.locked_until<now()))
    order by j.created_at for update skip locked limit 1
  )
  update public.prospecting_ai_jobs j set status='processing', attempts=j.attempts+1, lease_id=gen_random_uuid(), locked_until=now()+interval '150 seconds'
  from candidate where j.id=candidate.id returning j.*;
end;
$$;
revoke all on function public.claim_local_prospecting_job(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_local_prospecting_job(uuid,text) to service_role;
commit;
