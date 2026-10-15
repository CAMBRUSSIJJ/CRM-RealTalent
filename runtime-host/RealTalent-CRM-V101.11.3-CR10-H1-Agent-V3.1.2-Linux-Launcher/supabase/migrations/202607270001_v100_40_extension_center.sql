-- RealTalent CRM V100.40 — Central de Extensões
begin;

create table if not exists public.extension_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  product_key text not null check (product_key in ('realtalent_capture','realtalent_social','realtalent_linkedin_assistant','realtalent_maps_capture')),
  installation_key text not null,
  display_name text not null default 'Extensão RealTalent',
  browser text not null default 'Chrome',
  browser_version text not null default '',
  platform text not null default '',
  app_version text not null default '',
  manifest_version integer not null default 3 check (manifest_version between 2 and 4),
  status text not null default 'connected' check (status in ('connected','paused','revoked','error','outdated')),
  permissions text[] not null default '{}',
  capabilities text[] not null default '{}',
  last_seen_at timestamptz not null default now(),
  last_sync_at timestamptz,
  pending_items integer not null default 0 check (pending_items >= 0),
  captured_today integer not null default 0 check (captured_today >= 0),
  captured_on date not null default current_date,
  total_captured bigint not null default 0 check (total_captured >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product_key, installation_key)
);

create table if not exists public.extension_product_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_key text not null check (product_key in ('realtalent_capture','realtalent_social','realtalent_linkedin_assistant','realtalent_maps_capture')),
  enabled boolean not null default true,
  destination text not null default 'garimpo' check (destination in ('garimpo','crm')),
  require_confirmation boolean not null default true,
  duplicate_policy text not null default 'skip' check (duplicate_policy in ('skip','update','create')),
  minimum_version text not null default '',
  recommended_version text not null default '',
  max_batch_size integer not null default 50 check (max_batch_size between 1 and 100),
  process_interval_ms integer not null default 1200 check (process_interval_ms between 300 and 60000),
  close_tab_after_analysis boolean not null default true,
  allowed_sources text[] not null default array['google_maps','google_search','instagram','cnpj'],
  settings jsonb not null default '{}'::jsonb,
  config_version integer not null default 1 check (config_version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, product_key)
);

create table if not exists public.extension_capture_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installation_id uuid references public.extension_installations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  product_key text not null,
  source text not null default 'unknown',
  source_url text,
  external_id text,
  status text not null default 'queued' check (status in ('captured','queued','processing','review','duplicate','approved','sent','discarded','retry','failed','dead_letter','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  idempotency_key text not null,
  item_count integer not null default 0 check (item_count >= 0),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table if not exists public.extension_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installation_id uuid references public.extension_installations(id) on delete set null,
  job_id uuid references public.extension_capture_jobs(id) on delete set null,
  event_type text not null,
  status text not null default 'processed' check (status in ('processed','attention','failed','skipped')),
  correlation_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists extension_installations_org_status_idx on public.extension_installations(organization_id,status,product_key,last_seen_at desc);
create index if not exists extension_capture_jobs_queue_idx on public.extension_capture_jobs(organization_id,status,available_at,created_at desc);
create index if not exists extension_capture_jobs_installation_idx on public.extension_capture_jobs(installation_id,created_at desc);
create index if not exists extension_events_org_created_idx on public.extension_events(organization_id,created_at desc);

alter table public.extension_installations enable row level security;
alter table public.extension_product_settings enable row level security;
alter table public.extension_capture_jobs enable row level security;
alter table public.extension_events enable row level security;

drop policy if exists extension_installations_select on public.extension_installations;
create policy extension_installations_select on public.extension_installations for select to authenticated
using (public.is_organization_admin(organization_id) or user_id = auth.uid());

drop policy if exists extension_installations_admin_write on public.extension_installations;
create policy extension_installations_admin_write on public.extension_installations for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

drop policy if exists extension_settings_select on public.extension_product_settings;
create policy extension_settings_select on public.extension_product_settings for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists extension_settings_admin_write on public.extension_product_settings;
create policy extension_settings_admin_write on public.extension_product_settings for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

drop policy if exists extension_jobs_select on public.extension_capture_jobs;
create policy extension_jobs_select on public.extension_capture_jobs for select to authenticated
using (public.is_organization_admin(organization_id) or user_id = auth.uid());

drop policy if exists extension_jobs_admin_write on public.extension_capture_jobs;
create policy extension_jobs_admin_write on public.extension_capture_jobs for update to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

drop policy if exists extension_events_select on public.extension_events;
create policy extension_events_select on public.extension_events for select to authenticated
using (public.is_organization_admin(organization_id));

revoke insert,delete on public.extension_capture_jobs from authenticated;
revoke insert,update,delete on public.extension_events from authenticated;

create trigger extension_installations_touch before update on public.extension_installations for each row execute function public.touch_updated_at();
create trigger extension_capture_jobs_touch before update on public.extension_capture_jobs for each row execute function public.touch_updated_at();


create or replace function public.extension_semver_at_least(p_current text,p_minimum text)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare v_current text[]; v_minimum text[];
begin
  if trim(coalesce(p_minimum,''))='' then return true; end if;
  v_current := regexp_match(coalesce(p_current,''),'^([0-9]+)(?:\.([0-9]+))?(?:\.([0-9]+))?');
  v_minimum := regexp_match(coalesce(p_minimum,''),'^([0-9]+)(?:\.([0-9]+))?(?:\.([0-9]+))?');
  if v_current is null or v_minimum is null then return false; end if;
  return array[coalesce(v_current[1],'0')::integer,coalesce(v_current[2],'0')::integer,coalesce(v_current[3],'0')::integer]
      >= array[coalesce(v_minimum[1],'0')::integer,coalesce(v_minimum[2],'0')::integer,coalesce(v_minimum[3],'0')::integer];
end; $$;

create or replace function public.ensure_extension_product_settings(p_organization_id uuid, p_product_key text)
returns public.extension_product_settings language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settings public.extension_product_settings;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  insert into public.extension_product_settings(organization_id,product_key,updated_by)
  values(p_organization_id,p_product_key,auth.uid()) on conflict(organization_id,product_key) do nothing;
  select * into v_settings from public.extension_product_settings where organization_id=p_organization_id and product_key=p_product_key;
  return v_settings;
end; $$;

create or replace function public.register_extension_installation(
  p_organization_id uuid,
  p_product_key text,
  p_installation_key text,
  p_display_name text,
  p_browser text,
  p_browser_version text,
  p_platform text,
  p_app_version text,
  p_manifest_version integer default 3,
  p_permissions text[] default '{}',
  p_capabilities text[] default '{}',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_installation public.extension_installations; v_settings public.extension_product_settings;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if length(trim(coalesce(p_installation_key,''))) < 8 then raise exception 'Identificador de instalação inválido'; end if;
  select * into v_installation from public.extension_installations
   where organization_id=p_organization_id and product_key=p_product_key and installation_key=left(trim(p_installation_key),180);
  if v_installation.status='revoked' then raise exception 'Instalação revogada'; end if;
  insert into public.extension_installations(
    organization_id,user_id,product_key,installation_key,display_name,browser,browser_version,platform,app_version,manifest_version,
    permissions,capabilities,status,last_seen_at,last_error,metadata
  ) values(
    p_organization_id,auth.uid(),p_product_key,left(trim(p_installation_key),180),left(trim(coalesce(p_display_name,'Extensão RealTalent')),120),
    left(trim(coalesce(p_browser,'Chrome')),60),left(trim(coalesce(p_browser_version,'')),40),left(trim(coalesce(p_platform,'')),80),
    left(trim(coalesce(p_app_version,'')),40),greatest(2,least(4,coalesce(p_manifest_version,3))),coalesce(p_permissions,'{}'),coalesce(p_capabilities,'{}'),
    case when v_installation.status='paused' then 'paused' else 'connected' end,now(),null,coalesce(p_metadata,'{}'::jsonb)
  ) on conflict(organization_id,product_key,installation_key) do update set
    user_id=excluded.user_id,display_name=excluded.display_name,browser=excluded.browser,browser_version=excluded.browser_version,
    platform=excluded.platform,app_version=excluded.app_version,manifest_version=excluded.manifest_version,permissions=excluded.permissions,
    capabilities=excluded.capabilities,last_seen_at=now(),last_error=null,metadata=excluded.metadata,
    status=case when public.extension_installations.status='paused' then 'paused' else 'connected' end
  returning * into v_installation;
  insert into public.extension_product_settings(organization_id,product_key,updated_by)
  values(p_organization_id,p_product_key,auth.uid()) on conflict(organization_id,product_key) do nothing;
  select * into v_settings from public.extension_product_settings where organization_id=p_organization_id and product_key=p_product_key;
  if not public.extension_semver_at_least(v_installation.app_version,v_settings.minimum_version) then
    update public.extension_installations set status='outdated',last_error='Versão mínima exigida: '||v_settings.minimum_version where id=v_installation.id returning * into v_installation;
  end if;
  insert into public.extension_events(organization_id,installation_id,event_type,status,correlation_id,payload)
  values(p_organization_id,v_installation.id,'installation_registered','processed',v_installation.installation_key,jsonb_build_object('version',v_installation.app_version,'browser',v_installation.browser));
  return jsonb_build_object('installation',to_jsonb(v_installation),'settings',to_jsonb(v_settings));
end; $$;

create or replace function public.heartbeat_extension_installation(
  p_organization_id uuid,
  p_installation_id uuid,
  p_pending_items integer default 0,
  p_captured_delta integer default 0,
  p_last_error text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_installation public.extension_installations; v_settings public.extension_product_settings;
begin
  select * into v_installation from public.extension_installations where id=p_installation_id and organization_id=p_organization_id;
  if v_installation.id is null or auth.uid() is null or (v_installation.user_id<>auth.uid() and not public.is_organization_admin(p_organization_id)) then raise exception 'Acesso negado'; end if;
  if v_installation.status='revoked' then raise exception 'Instalação revogada'; end if;
  update public.extension_installations set last_seen_at=now(),pending_items=greatest(0,coalesce(p_pending_items,0)),
    captured_today=case when captured_on=current_date then greatest(0,captured_today+greatest(0,coalesce(p_captured_delta,0))) else greatest(0,coalesce(p_captured_delta,0)) end,
    captured_on=current_date,
    total_captured=greatest(0,total_captured+greatest(0,coalesce(p_captured_delta,0))),
    last_error=nullif(left(trim(coalesce(p_last_error,'')),500),'')
  where id=p_installation_id returning * into v_installation;
  select * into v_settings from public.extension_product_settings where organization_id=p_organization_id and product_key=v_installation.product_key;
  return jsonb_build_object('installation',to_jsonb(v_installation),'settings',to_jsonb(v_settings));
end; $$;

create or replace function public.update_extension_installation_status(p_installation_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_status text;
begin
  select organization_id into v_org from public.extension_installations where id=p_installation_id;
  if v_org is null or auth.uid() is null or not public.is_organization_admin(v_org) then raise exception 'Acesso negado'; end if;
  v_status := case p_action when 'pause' then 'paused' when 'resume' then 'connected' when 'revoke' then 'revoked' else null end;
  if v_status is null then raise exception 'Ação inválida'; end if;
  update public.extension_installations set status=v_status,last_error=case when v_status='revoked' then 'Instalação revogada pelo administrador' else null end where id=p_installation_id;
  insert into public.extension_events(organization_id,installation_id,event_type,status,payload)
  values(v_org,p_installation_id,'installation_'||p_action,'processed',jsonb_build_object('action',p_action,'userId',auth.uid()));
  return true;
end; $$;

create or replace function public.save_extension_product_settings(
  p_organization_id uuid,
  p_product_key text,
  p_enabled boolean,
  p_destination text,
  p_require_confirmation boolean,
  p_duplicate_policy text,
  p_minimum_version text,
  p_recommended_version text,
  p_max_batch_size integer,
  p_process_interval_ms integer,
  p_close_tab_after_analysis boolean,
  p_allowed_sources text[],
  p_settings jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settings public.extension_product_settings;
begin
  if auth.uid() is null or not public.is_organization_admin(p_organization_id) then raise exception 'Acesso negado'; end if;
  insert into public.extension_product_settings(
    organization_id,product_key,enabled,destination,require_confirmation,duplicate_policy,minimum_version,recommended_version,
    max_batch_size,process_interval_ms,close_tab_after_analysis,allowed_sources,settings,updated_by
  ) values(
    p_organization_id,p_product_key,coalesce(p_enabled,true),case when p_destination='crm' then 'crm' else 'garimpo' end,
    coalesce(p_require_confirmation,true),case when p_duplicate_policy in ('skip','update','create') then p_duplicate_policy else 'skip' end,
    left(trim(coalesce(p_minimum_version,'')),40),left(trim(coalesce(p_recommended_version,'')),40),greatest(1,least(100,coalesce(p_max_batch_size,50))),
    greatest(300,least(60000,coalesce(p_process_interval_ms,1200))),coalesce(p_close_tab_after_analysis,true),coalesce(p_allowed_sources,'{}'),coalesce(p_settings,'{}'::jsonb),auth.uid()
  ) on conflict(organization_id,product_key) do update set
    enabled=excluded.enabled,destination=excluded.destination,require_confirmation=excluded.require_confirmation,duplicate_policy=excluded.duplicate_policy,
    minimum_version=excluded.minimum_version,recommended_version=excluded.recommended_version,max_batch_size=excluded.max_batch_size,
    process_interval_ms=excluded.process_interval_ms,close_tab_after_analysis=excluded.close_tab_after_analysis,allowed_sources=excluded.allowed_sources,
    settings=excluded.settings,config_version=public.extension_product_settings.config_version+1,updated_by=auth.uid(),updated_at=now()
  returning * into v_settings;
  return to_jsonb(v_settings);
end; $$;

create or replace function public.retry_extension_capture_job(p_job_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.extension_capture_jobs where id=p_job_id;
  if v_org is null or auth.uid() is null or not public.is_organization_admin(v_org) then raise exception 'Acesso negado'; end if;
  update public.extension_capture_jobs set status='retry',available_at=now(),last_error=null,completed_at=null where id=p_job_id and status in ('failed','dead_letter');
  if found then
    insert into public.extension_events(organization_id,job_id,event_type,status,payload)
    values(v_org,p_job_id,'capture_retry_requested','processed',jsonb_build_object('requestedBy',auth.uid()));
    return true;
  end if;
  return false;
end; $$;

commit;
