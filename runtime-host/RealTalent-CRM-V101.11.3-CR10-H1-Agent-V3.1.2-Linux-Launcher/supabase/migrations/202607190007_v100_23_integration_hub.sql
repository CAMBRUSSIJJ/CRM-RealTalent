-- RealTalent CRM V100.23 — Central de Integrações, credenciais revogáveis e fila de automação.
begin;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('extension','supabase','whatsapp','instagram','email','google_calendar','outlook','telephony','webhook')),
  status text not null default 'disconnected' check (status in ('connected','disconnected','attention','error','assisted','planned')),
  enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  has_credential boolean not null default false,
  last_received_at timestamptz,
  last_tested_at timestamptz,
  last_error text,
  received_count integer not null default 0 check (received_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('extension','webhook')),
  token_hash text not null unique,
  token_hint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists integration_credentials_active_idx
  on public.integration_credentials(organization_id, provider)
  where revoked_at is null;

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  direction text not null default 'inbound' check (direction in ('inbound','outbound')),
  event_type text not null,
  status text not null default 'processed' check (status in ('processed','partial','failed','skipped')),
  external_id text,
  item_count integer not null default 0 check (item_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists integration_events_idempotency_idx
  on public.integration_events(organization_id, provider, external_id)
  where external_id is not null;
create index if not exists integration_events_org_created_idx on public.integration_events(organization_id, created_at desc);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trigger_type text not null,
  entity_id text not null,
  lead_id uuid references public.leads(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (organization_id, trigger_type, entity_id)
);

create index if not exists automation_events_queue_idx on public.automation_events(status, available_at) where status in ('queued','failed');

alter table public.integration_connections enable row level security;
alter table public.integration_credentials enable row level security;
alter table public.integration_events enable row level security;
alter table public.automation_events enable row level security;

create policy integration_connections_select on public.integration_connections for select to authenticated
  using (public.is_organization_member(organization_id));
create policy integration_connections_write on public.integration_connections for all to authenticated
  using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy integration_events_select on public.integration_events for select to authenticated
  using (public.is_organization_member(organization_id));
create policy automation_events_select on public.automation_events for select to authenticated
  using (public.is_organization_admin(organization_id));

create trigger integration_connections_touch_updated_at before update on public.integration_connections
  for each row execute function public.touch_updated_at();

create or replace function public.rotate_extension_ingest_token(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text;
begin
  if auth.uid() is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Somente administradores podem gerar credenciais';
  end if;
  v_token := 'rt_live_' || encode(gen_random_bytes(32), 'hex');
  update public.integration_credentials set revoked_at = now()
    where organization_id = p_organization_id and provider = 'extension' and revoked_at is null;
  insert into public.integration_credentials(organization_id, provider, token_hash, token_hint, created_by)
    values (p_organization_id, 'extension', encode(digest(v_token, 'sha256'), 'hex'), right(v_token, 6), auth.uid());
  insert into public.integration_connections(organization_id, provider, status, enabled, has_credential, last_tested_at)
    values (p_organization_id, 'extension', 'connected', true, true, now())
    on conflict (organization_id, provider) do update set status = 'connected', enabled = true, has_credential = true, last_tested_at = now(), last_error = null;
  insert into public.audit_logs(organization_id, user_id, action, entity_type, entity_id, after_data)
    values (p_organization_id, auth.uid(), 'integration_token_rotated', 'integration_connection', 'extension', jsonb_build_object('provider','extension'));
  return v_token;
end;
$$;

create or replace function public.revoke_extension_ingest_token(p_organization_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Somente administradores podem revogar credenciais';
  end if;
  update public.integration_credentials set revoked_at = now()
    where organization_id = p_organization_id and provider = 'extension' and revoked_at is null;
  update public.integration_connections set status = 'attention', has_credential = false, last_error = 'Token revogado'
    where organization_id = p_organization_id and provider = 'extension';
  insert into public.audit_logs(organization_id, user_id, action, entity_type, entity_id)
    values (p_organization_id, auth.uid(), 'integration_token_revoked', 'integration_connection', 'extension');
  return true;
end;
$$;

create or replace function public.validate_extension_ingest_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select organization_id
  from public.integration_credentials
  where provider = 'extension'
    and revoked_at is null
    and token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
  limit 1;
$$;

revoke all on table public.integration_credentials from public, anon, authenticated;
revoke insert, update, delete on table public.integration_events from authenticated;
revoke insert, update, delete on table public.automation_events from authenticated;
revoke all on function public.rotate_extension_ingest_token(uuid) from public, anon;
revoke all on function public.revoke_extension_ingest_token(uuid) from public, anon;
revoke all on function public.validate_extension_ingest_token(text) from public, anon, authenticated;
grant execute on function public.rotate_extension_ingest_token(uuid) to authenticated;
grant execute on function public.revoke_extension_ingest_token(uuid) to authenticated;
grant execute on function public.validate_extension_ingest_token(text) to service_role;

comment on table public.integration_connections is 'Configuração e saúde operacional das integrações por workspace.';
comment on table public.integration_credentials is 'Hashes de credenciais revogáveis; o segredo em texto puro nunca é armazenado.';
comment on table public.integration_events is 'Histórico imutável de entradas e saídas de integrações.';
comment on table public.automation_events is 'Fila idempotente de eventos externos destinados ao motor de automações.';

commit;
