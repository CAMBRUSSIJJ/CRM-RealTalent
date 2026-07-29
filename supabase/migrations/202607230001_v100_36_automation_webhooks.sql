-- RealTalent CRM V100.36 — Automação Profissional e Webhooks

create table if not exists public.automation_webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  url text not null,
  method text not null default 'POST' check (method in ('POST','PUT','PATCH')),
  enabled boolean not null default true,
  secret_token text not null default '',
  has_secret boolean generated always as (secret_token <> '') stored,
  timeout_seconds integer not null default 10 check (timeout_seconds between 3 and 30),
  max_attempts integer not null default 3 check (max_attempts between 1 and 8),
  headers jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_id uuid not null,
  automation_run_id uuid references public.automation_runs(id) on delete set null,
  rule_id uuid references public.automation_rules(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  event_type text not null,
  correlation_id text not null,
  status text not null default 'pending' check (status in ('pending','sending','success','failed','cancelled','simulated')),
  attempts integer not null default 0,
  request_body jsonb not null default '{}'::jsonb,
  response_status integer,
  response_body text not null default '',
  error_message text not null default '',
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (organization_id, webhook_id) references public.automation_webhooks(organization_id, id) on delete cascade
);

create index if not exists idx_automation_webhooks_org on public.automation_webhooks(organization_id, enabled);
create index if not exists idx_webhook_deliveries_queue on public.webhook_deliveries(status, next_attempt_at, created_at);
create index if not exists idx_webhook_deliveries_org on public.webhook_deliveries(organization_id, created_at desc);
create unique index if not exists uq_webhook_delivery_idempotency on public.webhook_deliveries(organization_id, webhook_id, correlation_id, event_type);

alter table public.automation_webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;

-- O papel autenticado enxerga somente metadados; secret_token permanece acessível ao service_role da Edge Function.
revoke select on public.automation_webhooks from authenticated;
grant select (id, organization_id, name, url, method, enabled, has_secret, timeout_seconds, max_attempts, headers, created_by, created_at, updated_at)
  on public.automation_webhooks to authenticated;

drop policy if exists automation_webhooks_select on public.automation_webhooks;
create policy automation_webhooks_select on public.automation_webhooks for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists automation_webhooks_write on public.automation_webhooks;
create policy automation_webhooks_write on public.automation_webhooks for all to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists webhook_deliveries_insert on public.webhook_deliveries;
create policy webhook_deliveries_insert on public.webhook_deliveries for insert to authenticated
  with check (public.is_organization_member(organization_id));

drop policy if exists webhook_deliveries_update on public.webhook_deliveries;
create policy webhook_deliveries_update on public.webhook_deliveries for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create or replace function public.touch_automation_webhook_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_automation_webhooks_updated_at on public.automation_webhooks;
create trigger trg_automation_webhooks_updated_at before update on public.automation_webhooks
for each row execute function public.touch_automation_webhook_updated_at();

comment on table public.automation_webhooks is 'Destinos externos administrados para ações de automação. O segredo é lido apenas pela Edge Function.';
comment on table public.webhook_deliveries is 'Fila e auditoria de cada entrega de webhook, com tentativas, resposta e erro.';
