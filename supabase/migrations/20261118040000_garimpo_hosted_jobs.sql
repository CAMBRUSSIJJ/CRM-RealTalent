-- Separate, durable queue for the clean hosted Garimpo. No existing records are changed.
create table public.garimpo_hosted_jobs (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  idempotency_key text,
  request_hash text not null,
  status text not null check (status in ('queued','running','completed','failed','cancelled')),
  owner uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index garimpo_hosted_org_history on public.garimpo_hosted_jobs(organization_id, created_at desc);
create index garimpo_hosted_active on public.garimpo_hosted_jobs(status, lease_until) where status in ('queued','running');
alter table public.garimpo_hosted_jobs enable row level security;
create policy garimpo_hosted_read on public.garimpo_hosted_jobs for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = garimpo_hosted_jobs.organization_id and m.user_id = (select auth.uid())));
revoke all on public.garimpo_hosted_jobs from anon, authenticated;
grant select on public.garimpo_hosted_jobs to authenticated;

-- All mutations pass through one atomic, organization-scoped operation. No service-role key.
create function public.garimpo_hosted_operation(p_org uuid, p_action text, p_job uuid default null,
  p_document jsonb default null, p_owner uuid default null, p_key text default null, p_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.garimpo_hosted_jobs;
  member_role text;
  doc jsonb;
begin
  select m.role::text into member_role from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid();
  if member_role is null then raise exception 'workspace_forbidden' using errcode = '42501'; end if;
  if p_action = 'list' then
    return coalesce((select jsonb_agg(q.document order by q.created_at desc) from
      (select document, created_at from public.garimpo_hosted_jobs where organization_id = p_org order by created_at desc limit 20) q), '[]');
  end if;
  if p_action = 'get' then
    return (select document from public.garimpo_hosted_jobs where organization_id = p_org and id = p_job);
  end if;
  if member_role not in ('owner','admin','member') then raise exception 'workspace_read_only' using errcode = '42501'; end if;
  if p_action = 'create' then
    perform pg_advisory_xact_lock(hashtextextended('garimpo:' || p_org::text, 0));
    if p_key is not null then
      select * into r from public.garimpo_hosted_jobs where organization_id = p_org and idempotency_key = p_key;
      if found then
        if r.request_hash <> p_hash then raise exception 'idempotency_conflict'; end if;
        return r.document;
      end if;
    end if;
    if (select count(*) from public.garimpo_hosted_jobs where organization_id = p_org and status in ('queued','running')) >= 3
      then raise exception 'queue_full'; end if;
    if octet_length(p_document::text) > 2000000 or jsonb_typeof(p_document->'request') <> 'object' then raise exception 'invalid_document'; end if;
    doc := p_document || jsonb_build_object('id', p_job, 'status','queued','organization_id',p_org,'created_by',auth.uid());
    insert into public.garimpo_hosted_jobs(id, organization_id, created_by, idempotency_key, request_hash, status, document)
      values(p_job, p_org, auth.uid(), p_key, p_hash, 'queued', doc);
    return doc;
  end if;
  -- Serializes claims only, so replicas cannot claim the same job or exceed the browser cap.
  if p_action = 'claim' then perform pg_advisory_xact_lock(hashtextextended('garimpo:hosted:claim',0)); end if;
  select * into r from public.garimpo_hosted_jobs where organization_id = p_org and id = p_job for update;
  if not found then return null; end if;
  if p_action = 'claim' then
    if r.status not in ('queued','running') or (r.status = 'running' and r.lease_until > clock_timestamp()) then return null; end if;
    if (select count(*) from public.garimpo_hosted_jobs where status = 'running' and lease_until > clock_timestamp()) >= 2 then return null; end if;
    if r.attempts >= 3 then
      doc := r.document || jsonb_build_object('status','failed','partial',true,'error','A pesquisa foi interrompida. Os resultados foram preservados; retome para continuar.');
      update public.garimpo_hosted_jobs set status='failed', owner=null, lease_until=null, document=doc, updated_at=now() where id=r.id;
      return null;
    end if;
    doc := r.document || jsonb_build_object('status','running','updated_at',clock_timestamp());
    update public.garimpo_hosted_jobs set status='running', owner=p_owner, lease_until=clock_timestamp()+interval '45 seconds', attempts=attempts+1, document=doc, updated_at=now() where id=r.id;
    return doc;
  end if;
  if p_action = 'cancel' then
    if r.status not in ('queued','running') then return r.document; end if;
    doc := r.document || jsonb_build_object('status','cancelled','phase','cancelled','partial',true,'updated_at',clock_timestamp());
    update public.garimpo_hosted_jobs set status='cancelled',owner=null,lease_until=null,document=doc,updated_at=now() where id=r.id;
    return doc;
  end if;
  if p_action not in ('save','heartbeat','release') then raise exception 'invalid_action'; end if;
  if p_owner is null or r.owner is distinct from p_owner or r.status <> 'running' then raise exception 'lease_lost'; end if;
  if p_action = 'heartbeat' then
    update public.garimpo_hosted_jobs set lease_until=clock_timestamp()+interval '45 seconds' where id=r.id;
    return 'true';
  end if;
  doc := case when p_action='release' then r.document || jsonb_build_object('status','queued','updated_at',clock_timestamp()) else p_document end;
  if octet_length(doc::text) > 2000000 then raise exception 'invalid_document'; end if;
  doc := doc || jsonb_build_object('id',r.id,'organization_id',p_org,'created_by',r.created_by);
  update public.garimpo_hosted_jobs set status=doc->>'status', document=doc, updated_at=now(),
    lease_until=case when p_action='release' then null else clock_timestamp()+interval '45 seconds' end,
    owner=case when p_action='release' then null else p_owner end where id=r.id;
  return doc;
end $$;
revoke all on function public.garimpo_hosted_operation(uuid,text,uuid,jsonb,uuid,text,text) from public, anon;
grant execute on function public.garimpo_hosted_operation(uuid,text,uuid,jsonb,uuid,text,text) to authenticated;
