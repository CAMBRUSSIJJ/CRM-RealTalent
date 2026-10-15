-- V101.6.5 — Custom Properties para Contatos
create table if not exists public.contact_custom_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  key text not null check (char_length(trim(key)) between 1 and 64),
  property_type text not null check (property_type in ('text','number','currency','date','checkbox','select')),
  options jsonb not null default '[]'::jsonb,
  position integer not null default 100 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.contact_custom_property_values (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  property_id uuid not null references public.contact_custom_properties(id) on delete cascade,
  value_json jsonb null,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, lead_id, property_id)
);

create index if not exists contact_custom_properties_org_position_idx on public.contact_custom_properties(organization_id, position, name);
create index if not exists contact_custom_property_values_lead_idx on public.contact_custom_property_values(organization_id, lead_id);
create index if not exists contact_custom_property_values_property_idx on public.contact_custom_property_values(organization_id, property_id);

alter table public.contact_custom_properties enable row level security;
alter table public.contact_custom_property_values enable row level security;

drop policy if exists contact_custom_properties_select on public.contact_custom_properties;
create policy contact_custom_properties_select on public.contact_custom_properties for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists contact_custom_properties_insert on public.contact_custom_properties;
create policy contact_custom_properties_insert on public.contact_custom_properties for insert to authenticated with check (public.can_write_organization(organization_id) and created_by=auth.uid());
drop policy if exists contact_custom_properties_update on public.contact_custom_properties;
create policy contact_custom_properties_update on public.contact_custom_properties for update to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
drop policy if exists contact_custom_properties_delete on public.contact_custom_properties;
create policy contact_custom_properties_delete on public.contact_custom_properties for delete to authenticated using (public.can_write_organization(organization_id));

drop policy if exists contact_custom_property_values_select on public.contact_custom_property_values;
create policy contact_custom_property_values_select on public.contact_custom_property_values for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists contact_custom_property_values_insert on public.contact_custom_property_values;
create policy contact_custom_property_values_insert on public.contact_custom_property_values for insert to authenticated with check (public.can_write_organization(organization_id));
drop policy if exists contact_custom_property_values_update on public.contact_custom_property_values;
create policy contact_custom_property_values_update on public.contact_custom_property_values for update to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
drop policy if exists contact_custom_property_values_delete on public.contact_custom_property_values;
create policy contact_custom_property_values_delete on public.contact_custom_property_values for delete to authenticated using (public.can_write_organization(organization_id));

grant select,insert,update,delete on public.contact_custom_properties to authenticated;
grant select,insert,update,delete on public.contact_custom_property_values to authenticated;
