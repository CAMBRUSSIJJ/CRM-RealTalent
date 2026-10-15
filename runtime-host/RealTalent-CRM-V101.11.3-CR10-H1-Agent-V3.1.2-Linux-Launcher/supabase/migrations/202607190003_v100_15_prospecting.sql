-- RealTalent CRM V100.15 — Garimpo e integração com extensão
-- Estrutura persistente para implantação hospedada. O modo local continua usando armazenamento do navegador.

begin;

create table if not exists public.prospecting_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null check (source in ('maps','instagram','cnpj','extension','manual')),
  segment text not null default '',
  city text not null default '',
  query text not null default '',
  requested_count integer not null default 0 check (requested_count >= 0),
  received_count integer not null default 0 check (received_count >= 0),
  status text not null default 'received' check (status in ('queued','running','paused','received','completed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospecting_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid references public.prospecting_batches(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  name text not null default '',
  company text not null default '',
  phone text not null default '',
  email text not null default '',
  city text not null default '',
  address text not null default '',
  cnpj text not null default '',
  instagram text not null default '',
  website text not null default '',
  booking_url text not null default '',
  system_name text not null default '',
  description text not null default '',
  followers integer,
  source text not null check (source in ('maps','instagram','cnpj','extension','manual')),
  source_detail text not null default '',
  status text not null default 'new' check (status in ('new','analyzing','review','approved','discarded','sent')),
  confidence integer not null default 0 check (confidence between 0 and 100),
  duplicate_level text not null default 'none' check (duplicate_level in ('none','possible','confirmed')),
  duplicate_lead_id uuid references public.leads(id) on delete set null,
  duplicate_reasons text[] not null default '{}',
  notes text not null default '',
  raw_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  analyzed_at timestamptz,
  sent_at timestamptz
);

create table if not exists public.prospecting_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid references public.prospecting_leads(id) on delete set null,
  batch_id uuid references public.prospecting_batches(id) on delete set null,
  action text not null,
  title text not null,
  description text not null default '',
  item_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists prospecting_batches_org_created_idx on public.prospecting_batches(organization_id, created_at desc);
create index if not exists prospecting_leads_org_status_idx on public.prospecting_leads(organization_id, status, updated_at desc);
create index if not exists prospecting_leads_phone_idx on public.prospecting_leads(organization_id, regexp_replace(phone, '\D', '', 'g'));
create index if not exists prospecting_leads_cnpj_idx on public.prospecting_leads(organization_id, regexp_replace(cnpj, '\D', '', 'g')) where cnpj <> '';
create index if not exists prospecting_events_org_created_idx on public.prospecting_events(organization_id, created_at desc);

alter table public.prospecting_batches enable row level security;
alter table public.prospecting_leads enable row level security;
alter table public.prospecting_events enable row level security;

create policy prospecting_batches_select on public.prospecting_batches for select to authenticated using (public.is_organization_member(organization_id));
create policy prospecting_batches_write on public.prospecting_batches for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy prospecting_leads_select on public.prospecting_leads for select to authenticated using (public.is_organization_member(organization_id));
create policy prospecting_leads_write on public.prospecting_leads for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy prospecting_events_select on public.prospecting_events for select to authenticated using (public.is_organization_member(organization_id));
create policy prospecting_events_insert on public.prospecting_events for insert to authenticated with check (public.can_write_organization(organization_id));

create trigger prospecting_batches_touch_updated_at before update on public.prospecting_batches for each row execute function public.touch_updated_at();
create trigger prospecting_leads_touch_updated_at before update on public.prospecting_leads for each row execute function public.touch_updated_at();

comment on table public.prospecting_batches is 'Lotes recebidos de buscas, importações e extensão Chrome.';
comment on table public.prospecting_leads is 'Leads em processamento antes de entrarem na base comercial principal.';
comment on table public.prospecting_events is 'Rastreabilidade das ações realizadas no Garimpo.';

commit;
