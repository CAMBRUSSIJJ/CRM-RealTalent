-- RealTalent CRM V100.39 — Framework de Integrações
begin;

alter table public.integration_connections drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check
  check (provider in ('extension','supabase','whatsapp','instagram','email','google_calendar','outlook','telephony','webhook','google','microsoft','meta','whatsapp_cloud'));

create table if not exists public.integration_connected_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','meta','whatsapp_cloud')),
  external_account_id text not null,
  display_name text not null,
  status text not null default 'connected' check (status in ('connected','attention','expired','paused','revoked','error')),
  scopes text[] not null default '{}',
  has_credential boolean not null default false,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  sync_cursor text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_account_id)
);

-- Tokens nunca ficam disponíveis ao frontend. A Edge Function entrega a chave de criptografia apenas à RPC service_role.
create table if not exists public.integration_token_vault (
  account_id uuid primary key references public.integration_connected_accounts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  access_token_encrypted bytea not null,
  refresh_token_encrypted bytea,
  token_type text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.integration_connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','meta','whatsapp_cloud')),
  job_type text not null,
  status text not null default 'queued' check (status in ('queued','processing','retry','succeeded','failed','dead_letter','cancelled')),
  priority integer not null default 100 check (priority between 1 and 1000),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table if not exists public.integration_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.integration_sync_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('succeeded','failed','retry_scheduled')),
  response_code integer,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number)
);

create table if not exists public.integration_oauth_states (
  state_hash text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','meta','whatsapp_cloud')),
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_verifier_encrypted bytea,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists integration_accounts_org_status_idx on public.integration_connected_accounts(organization_id,status,provider);
create index if not exists integration_jobs_queue_idx on public.integration_sync_jobs(status,priority desc,available_at) where status in ('queued','retry');
create index if not exists integration_attempts_org_created_idx on public.integration_sync_attempts(organization_id,created_at desc);

alter table public.integration_connected_accounts enable row level security;
alter table public.integration_token_vault enable row level security;
alter table public.integration_sync_jobs enable row level security;
alter table public.integration_sync_attempts enable row level security;
alter table public.integration_oauth_states enable row level security;

create policy integration_accounts_select on public.integration_connected_accounts for select to authenticated using (public.is_organization_member(organization_id));
create policy integration_accounts_write on public.integration_connected_accounts for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy integration_jobs_select on public.integration_sync_jobs for select to authenticated using (public.is_organization_member(organization_id));
create policy integration_attempts_select on public.integration_sync_attempts for select to authenticated using (public.is_organization_admin(organization_id));

revoke all on public.integration_token_vault from public,anon,authenticated;
revoke all on public.integration_oauth_states from public,anon,authenticated;
revoke insert,update,delete on public.integration_sync_attempts from authenticated;

create trigger integration_accounts_touch before update on public.integration_connected_accounts for each row execute function public.touch_updated_at();
create trigger integration_jobs_touch before update on public.integration_sync_jobs for each row execute function public.touch_updated_at();

create or replace function public.enqueue_integration_sync_job(
  p_organization_id uuid,
  p_account_id uuid,
  p_job_type text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.integration_sync_jobs; v_provider text;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  select provider into v_provider from public.integration_connected_accounts where id=p_account_id and organization_id=p_organization_id and status='connected';
  if v_provider is null then raise exception 'Conta não conectada ou fora da organização'; end if;
  insert into public.integration_sync_jobs(organization_id,account_id,provider,job_type,idempotency_key,payload)
  values(p_organization_id,p_account_id,v_provider,left(trim(p_job_type),80),left(trim(p_idempotency_key),180),coalesce(p_payload,'{}'::jsonb))
  on conflict(organization_id,idempotency_key) do update set updated_at=now()
  returning * into v_job;
  return v_job.id;
end; $$;

create or replace function public.retry_integration_sync_job(p_job_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.integration_sync_jobs where id=p_job_id;
  if v_org is null or auth.uid() is null or not public.is_organization_admin(v_org) then raise exception 'Acesso negado'; end if;
  update public.integration_sync_jobs set status='retry',available_at=now(),locked_at=null,last_error=null,updated_at=now() where id=p_job_id and status in ('failed','dead_letter');
  return found;
end; $$;

create or replace function public.update_integration_account_status(p_account_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_status text;
begin
  select organization_id into v_org from public.integration_connected_accounts where id=p_account_id;
  if v_org is null or auth.uid() is null or not public.is_organization_admin(v_org) then raise exception 'Acesso negado'; end if;
  v_status := case p_action when 'pause' then 'paused' when 'resume' then 'connected' when 'disconnect' then 'revoked' else null end;
  if v_status is null then raise exception 'Ação inválida'; end if;
  update public.integration_connected_accounts set status=v_status,has_credential=case when p_action='disconnect' then false else has_credential end,last_error=case when p_action='disconnect' then 'Conta desconectada pelo administrador' else null end where id=p_account_id;
  if p_action='disconnect' then delete from public.integration_token_vault where account_id=p_account_id; end if;
  return true;
end; $$;

create or replace function public.store_integration_oauth_token(
  p_account_id uuid,p_access_token text,p_refresh_token text,p_token_type text,p_expires_at timestamptz,p_encryption_key text
) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_org uuid;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if length(coalesce(p_encryption_key,'')) < 32 then raise exception 'Invalid encryption key'; end if;
  select organization_id into v_org from public.integration_connected_accounts where id=p_account_id;
  if v_org is null then raise exception 'Account not found'; end if;
  insert into public.integration_token_vault(account_id,organization_id,access_token_encrypted,refresh_token_encrypted,token_type,expires_at)
  values(p_account_id,v_org,pgp_sym_encrypt(p_access_token,p_encryption_key,'cipher-algo=aes256'),case when coalesce(p_refresh_token,'')='' then null else pgp_sym_encrypt(p_refresh_token,p_encryption_key,'cipher-algo=aes256') end,p_token_type,p_expires_at)
  on conflict(account_id) do update set access_token_encrypted=excluded.access_token_encrypted,refresh_token_encrypted=coalesce(excluded.refresh_token_encrypted,public.integration_token_vault.refresh_token_encrypted),token_type=excluded.token_type,expires_at=excluded.expires_at,updated_at=now();
  update public.integration_connected_accounts set has_credential=true,token_expires_at=p_expires_at,status='connected',last_error=null where id=p_account_id;
  return true;
end; $$;

revoke all on function public.enqueue_integration_sync_job(uuid,uuid,text,text,jsonb) from public,anon;
revoke all on function public.retry_integration_sync_job(uuid) from public,anon;
revoke all on function public.update_integration_account_status(uuid,text) from public,anon;
revoke all on function public.store_integration_oauth_token(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.enqueue_integration_sync_job(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.retry_integration_sync_job(uuid) to authenticated;
grant execute on function public.update_integration_account_status(uuid,text) to authenticated;
grant execute on function public.store_integration_oauth_token(uuid,text,text,text,timestamptz,text) to service_role;

comment on table public.integration_connected_accounts is 'Contas OAuth por organização; metadados visíveis sem exposição de tokens.';
comment on table public.integration_token_vault is 'Tokens criptografados e inacessíveis ao frontend.';
comment on table public.integration_sync_jobs is 'Fila idempotente com tentativas limitadas e dead-letter.';
comment on table public.integration_sync_attempts is 'Log imutável de cada tentativa de sincronização.';

commit;
