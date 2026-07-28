begin;

create table if not exists public.organization_map_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  map_provider text not null default 'openstreetmap' check (map_provider in ('openstreetmap','google')),
  geocoding_provider text not null default 'google' check (geocoding_provider in ('google','manual','disabled')),
  geocoding_enabled boolean not null default true,
  daily_geocode_limit integer not null default 500 check (daily_geocode_limit between 1 and 100000),
  default_latitude double precision,
  default_longitude double precision,
  default_zoom integer not null default 10 check (default_zoom between 2 and 20),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_latitude is null or default_latitude between -90 and 90),
  check (default_longitude is null or default_longitude between -180 and 180)
);

create table if not exists public.lead_geocode_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','retry','completed','failed','cancelled')),
  priority smallint not null default 100 check (priority between 1 and 1000),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  request_source text not null default 'map' check (request_source in ('map','lead_form','import','extension','automation','maintenance','manual')),
  address_hash text not null,
  result_status text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_geocode_jobs_active_unique
  on public.lead_geocode_jobs(lead_id, address_hash)
  where status in ('queued','processing','retry');
create index if not exists lead_geocode_jobs_claim_idx
  on public.lead_geocode_jobs(status, scheduled_at, priority, created_at)
  where status in ('queued','retry');
create index if not exists lead_geocode_jobs_org_created_idx
  on public.lead_geocode_jobs(organization_id, created_at desc);

create table if not exists public.lead_location_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  action text not null check (action in ('address_changed','geocoded','manual_adjustment','cleared','error')),
  previous_address text,
  current_address text,
  previous_latitude double precision,
  previous_longitude double precision,
  current_latitude double precision,
  current_longitude double precision,
  previous_status text,
  current_status text,
  source text not null default 'system',
  changed_by uuid references auth.users(id) on delete set null default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_location_history_lead_idx on public.lead_location_history(lead_id, created_at desc);
create index if not exists lead_location_history_org_idx on public.lead_location_history(organization_id, created_at desc);

alter table public.organization_map_settings enable row level security;
alter table public.lead_geocode_jobs enable row level security;
alter table public.lead_location_history enable row level security;

drop policy if exists organization_map_settings_select on public.organization_map_settings;
create policy organization_map_settings_select on public.organization_map_settings
for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists organization_map_settings_write on public.organization_map_settings;
create policy organization_map_settings_write on public.organization_map_settings
for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

drop policy if exists lead_geocode_jobs_select on public.lead_geocode_jobs;
create policy lead_geocode_jobs_select on public.lead_geocode_jobs
for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists lead_geocode_jobs_cancel on public.lead_geocode_jobs;
create policy lead_geocode_jobs_cancel on public.lead_geocode_jobs
for update to authenticated using (public.can_write_organization(organization_id))
with check (public.can_write_organization(organization_id));

drop policy if exists lead_location_history_select on public.lead_location_history;
create policy lead_location_history_select on public.lead_location_history
for select to authenticated using (public.is_organization_member(organization_id));

create or replace function public.lead_address_fingerprint(p_lead public.leads)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select md5(concat_ws('|',
    lower(trim(coalesce(p_lead.postal_code, ''))),
    lower(trim(coalesce(p_lead.street, ''))),
    lower(trim(coalesce(p_lead.address_number, ''))),
    lower(trim(coalesce(p_lead.complement, ''))),
    lower(trim(coalesce(p_lead.district, ''))),
    lower(trim(coalesce(p_lead.city, ''))),
    lower(trim(coalesce(p_lead.state, ''))),
    lower(trim(coalesce(p_lead.country, 'Brasil')))
  ));
$$;

create or replace function public.enqueue_lead_geocoding(
  p_lead_ids uuid[],
  p_source text default 'map',
  p_priority smallint default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_lead public.leads%rowtype;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  if coalesce(array_length(p_lead_ids, 1), 0) = 0 then return 0; end if;
  if array_length(p_lead_ids, 1) > 100 then raise exception 'Máximo de 100 leads por solicitação'; end if;
  if p_source not in ('map','lead_form','import','extension','automation','maintenance','manual') then raise exception 'Origem inválida'; end if;

  for v_lead in select * from public.leads where id = any(p_lead_ids)
  loop
    if not public.can_write_organization(v_lead.organization_id) then
      continue;
    end if;
    if trim(coalesce(v_lead.city, '')) = '' then
      update public.leads set geocode_status = 'incomplete', geocode_error = 'Informe pelo menos a cidade.', geocoded_at = now() where id = v_lead.id;
      continue;
    end if;
    if not exists (
      select 1 from public.lead_geocode_jobs j
      where j.lead_id = v_lead.id
        and j.address_hash = public.lead_address_fingerprint(v_lead)
        and j.status in ('queued','processing','retry')
    ) then
      insert into public.lead_geocode_jobs(organization_id, lead_id, status, priority, requested_by, request_source, address_hash)
      values (v_lead.organization_id, v_lead.id, 'queued', greatest(1, least(1000, p_priority)), auth.uid(), p_source, public.lead_address_fingerprint(v_lead));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.claim_lead_geocode_jobs(
  p_limit integer default 25,
  p_worker text default 'lead-geocode-worker',
  p_lease_seconds integer default 300
)
returns setof public.lead_geocode_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select id from public.lead_geocode_jobs
    where (
      status in ('queued','retry') and scheduled_at <= now()
    ) or (
      status = 'processing' and locked_at < now() - make_interval(secs => greatest(60, p_lease_seconds))
    )
    order by priority asc, scheduled_at asc, created_at asc
    for update skip locked
    limit greatest(1, least(100, p_limit))
  )
  update public.lead_geocode_jobs j
  set status = 'processing', locked_at = now(), locked_by = left(p_worker, 120), attempts = attempts + 1, updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.capture_lead_location_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
begin
  if row(old.postal_code, old.street, old.address_number, old.complement, old.district, old.city, old.state, old.country)
     is distinct from
     row(new.postal_code, new.street, new.address_number, new.complement, new.district, new.city, new.state, new.country) then
    v_action := 'address_changed';
  elsif coalesce(new.geocode_status, '') = 'manual' and row(old.latitude, old.longitude) is distinct from row(new.latitude, new.longitude) then
    v_action := 'manual_adjustment';
  elsif row(old.latitude, old.longitude, old.geocode_status) is distinct from row(new.latitude, new.longitude, new.geocode_status) then
    v_action := case when new.latitude is null or new.longitude is null then 'cleared' when new.geocode_status = 'not_found' then 'error' else 'geocoded' end;
  else
    return new;
  end if;

  insert into public.lead_location_history(
    organization_id, lead_id, action, previous_address, current_address,
    previous_latitude, previous_longitude, current_latitude, current_longitude,
    previous_status, current_status, source, changed_by
  ) values (
    new.organization_id, new.id, v_action, old.formatted_address, new.formatted_address,
    old.latitude, old.longitude, new.latitude, new.longitude,
    old.geocode_status, new.geocode_status,
    coalesce(new.geocode_provider, 'system'), auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists leads_capture_location_history on public.leads;
create trigger leads_capture_location_history
after update of postal_code, street, address_number, complement, district, city, state, country, latitude, longitude, geocode_status
on public.leads for each row execute function public.capture_lead_location_change();

drop trigger if exists organization_map_settings_touch on public.organization_map_settings;
create trigger organization_map_settings_touch before update on public.organization_map_settings
for each row execute function public.touch_updated_at();
drop trigger if exists lead_geocode_jobs_touch on public.lead_geocode_jobs;
create trigger lead_geocode_jobs_touch before update on public.lead_geocode_jobs
for each row execute function public.touch_updated_at();

grant select on public.organization_map_settings, public.lead_geocode_jobs, public.lead_location_history to authenticated;
grant execute on function public.lead_address_fingerprint(public.leads) to authenticated, service_role;
grant execute on function public.enqueue_lead_geocoding(uuid[], text, smallint) to authenticated;
grant execute on function public.claim_lead_geocode_jobs(integer, text, integer) to service_role;

commit;
