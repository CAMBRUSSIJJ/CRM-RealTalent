-- RealTalent CRM V100.33 — Localização real e geocodificação

alter table public.leads
  add column if not exists postal_code text not null default '',
  add column if not exists street text not null default '',
  add column if not exists address_number text not null default '',
  add column if not exists complement text not null default '',
  add column if not exists district text not null default '',
  add column if not exists state text not null default '',
  add column if not exists country text not null default 'Brasil',
  add column if not exists formatted_address text not null default '',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocode_status text not null default 'pending',
  add column if not exists geocode_precision text not null default 'unknown',
  add column if not exists geocode_provider text,
  add column if not exists geocode_place_id text,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_error text;

do $$ begin
  alter table public.leads add constraint leads_geocode_status_check
    check (geocode_status in ('pending','exact','approximate','incomplete','not_found','manual'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.leads add constraint leads_geocode_precision_check
    check (geocode_precision in ('rooftop','range_interpolated','street','district','city','manual','unknown'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.leads add constraint leads_latitude_check
    check (latitude is null or latitude between -90 and 90);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.leads add constraint leads_longitude_check
    check (longitude is null or longitude between -180 and 180);
exception when duplicate_object then null; end $$;

create index if not exists leads_org_geocode_status_idx on public.leads(organization_id, geocode_status);
create index if not exists leads_org_coordinates_idx on public.leads(organization_id, latitude, longitude) where latitude is not null and longitude is not null;

create or replace function public.prepare_lead_geocoding()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  address_changed boolean;
begin
  address_changed :=
    coalesce(new.postal_code, '') is distinct from coalesce(old.postal_code, '') or
    coalesce(new.street, '') is distinct from coalesce(old.street, '') or
    coalesce(new.address_number, '') is distinct from coalesce(old.address_number, '') or
    coalesce(new.complement, '') is distinct from coalesce(old.complement, '') or
    coalesce(new.district, '') is distinct from coalesce(old.district, '') or
    coalesce(new.city, '') is distinct from coalesce(old.city, '') or
    coalesce(new.state, '') is distinct from coalesce(old.state, '') or
    coalesce(new.country, '') is distinct from coalesce(old.country, '');

  if address_changed and coalesce(new.geocode_status, '') <> 'manual' then
    new.latitude := null;
    new.longitude := null;
    new.geocode_place_id := null;
    new.geocoded_at := null;
    new.geocode_error := null;
    new.geocode_provider := null;
    new.formatted_address := concat_ws(', ', nullif(trim(new.street), ''), nullif(trim(new.address_number), ''), nullif(trim(new.district), ''), nullif(trim(new.city), ''), nullif(trim(new.state), ''), nullif(trim(new.postal_code), ''), nullif(trim(new.country), ''));
    if trim(coalesce(new.city, '')) = '' then
      new.geocode_status := 'incomplete';
      new.geocode_precision := 'unknown';
    elsif trim(coalesce(new.street, '')) <> '' and trim(coalesce(new.address_number, '')) <> '' and trim(coalesce(new.state, '')) <> '' then
      new.geocode_status := 'pending';
      new.geocode_precision := 'unknown';
    else
      new.geocode_status := 'approximate';
      new.geocode_precision := case when trim(coalesce(new.district, '')) <> '' then 'district' else 'city' end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_prepare_geocoding on public.leads;
create trigger leads_prepare_geocoding
before update of postal_code, street, address_number, complement, district, city, state, country
on public.leads
for each row execute function public.prepare_lead_geocoding();

update public.leads
set geocode_status = case when trim(city) = '' then 'incomplete' else 'approximate' end,
    geocode_precision = case when trim(city) = '' then 'unknown' else 'city' end,
    formatted_address = case when trim(city) = '' then '' else concat_ws(', ', nullif(trim(city), ''), nullif(trim(state), ''), nullif(trim(country), '')) end
where latitude is null and longitude is null and geocode_status = 'pending';
