-- RealTalent CRM V100.0
-- Fundação multiempresa: autenticação, organizações, membros, leads, pipeline e estruturas futuras.
-- Execute em um projeto Supabase novo pelo SQL Editor ou Supabase CLI.

begin;

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create type public.organization_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.lead_status as enum ('active', 'won', 'lost', 'archived');
create type public.lead_temperature as enum ('cold', 'warm', 'hot');
create type public.lead_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.activity_type as enum ('call', 'followup', 'meeting', 'note', 'stage_change');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members(user_id, organization_id);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  stage_order integer not null check (stage_order > 0),
  color text not null default '#4361ee' check (color ~ '^#[0-9a-fA-F]{6}$'),
  probability integer not null default 0 check (probability between 0 and 100),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, stage_order),
  unique (organization_id, name),
  check (not (is_won and is_lost))
);

create index pipeline_stages_org_order_idx on public.pipeline_stages(organization_id, stage_order);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  company text not null default '',
  phone text not null default '',
  email text not null default '',
  city text not null default '',
  source text not null default 'Manual',
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  status public.lead_status not null default 'active',
  temperature public.lead_temperature not null default 'warm',
  priority public.lead_priority not null default 'medium',
  owner_id uuid references auth.users(id) on delete set null,
  value numeric(14,2) not null default 0 check (value >= 0),
  next_action_at timestamptz,
  notes text not null default '',
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_org_updated_idx on public.leads(organization_id, updated_at desc);
create index leads_org_stage_idx on public.leads(organization_id, stage_id);
create index leads_org_owner_idx on public.leads(organization_id, owner_id);
create index leads_org_next_action_idx on public.leads(organization_id, next_action_at) where next_action_at is not null;
create index leads_search_idx on public.leads using gin (to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(company,'') || ' ' || coalesce(city,'') || ' ' || coalesce(phone,'')));

create table public.lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  changed_by uuid references auth.users(id) on delete set null default auth.uid(),
  changed_at timestamptz not null default now()
);

create index lead_stage_history_lead_idx on public.lead_stage_history(lead_id, changed_at desc);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  activity_type public.activity_type not null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null default '',
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_org_due_idx on public.activities(organization_id, due_at) where completed_at is null;
create index activities_lead_idx on public.activities(lead_id, created_at desc);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  outcome text not null default '',
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  notes text not null default '',
  transcript text not null default '',
  recording_path text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index calls_org_started_idx on public.calls(organization_id, started_at desc);
create index calls_lead_idx on public.calls(lead_id, started_at desc);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text not null default '',
  status text not null default 'confirmed',
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index calendar_events_org_start_idx on public.calendar_events(organization_id, starts_at);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  metric text not null,
  target_value numeric(14,2) not null default 0,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (organization_id, user_id, metric, period_start, period_end)
);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  enabled boolean not null default false,
  trigger_type text not null,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  event_key text not null,
  status text not null check (status in ('running','success','failed','undone')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (organization_id, event_key)
);

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

-- Helpers com SECURITY DEFINER evitam recursão das políticas de membership.
create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_write_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','member')
  );
$$;

create or replace function public.is_organization_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

create or replace function public.slugify(input text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from regexp_replace(lower(unaccent(input)), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.create_organization_with_defaults(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_organization uuid;
  v_slug text;
  v_suffix integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(p_name)) < 2 then
    raise exception 'Organization name is too short';
  end if;

  v_slug := public.slugify(trim(p_name));
  while exists(select 1 from public.organizations where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := public.slugify(trim(p_name)) || '-' || v_suffix::text;
  end loop;

  insert into public.organizations(name, slug, owner_id)
  values (trim(p_name), v_slug, v_user)
  returning id into v_organization;

  insert into public.organization_members(organization_id, user_id, role)
  values (v_organization, v_user, 'owner');

  insert into public.pipeline_stages(organization_id, name, stage_order, color, probability, is_won, is_lost)
  values
    (v_organization, 'Novo lead', 1, '#4361ee', 10, false, false),
    (v_organization, 'Primeiro contato', 2, '#3a86ff', 25, false, false),
    (v_organization, 'Follow-up', 3, '#8b5cf6', 40, false, false),
    (v_organization, 'Proposta', 4, '#f59e0b', 65, false, false),
    (v_organization, 'Negociação', 5, '#f97316', 80, false, false),
    (v_organization, 'Fechado', 6, '#16a34a', 100, true, false);

  insert into public.organization_settings(organization_id, settings, updated_by)
  values (v_organization, jsonb_build_object('timezone','America/Sao_Paulo','currency','BRL','locale','pt-BR'), v_user);

  return v_organization;
end;
$$;

create or replace function public.validate_lead_stage_organization()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_stage_organization uuid;
begin
  select organization_id into v_stage_organization from public.pipeline_stages where id = new.stage_id;
  if v_stage_organization is null or v_stage_organization <> new.organization_id then
    raise exception 'Lead stage must belong to the same organization';
  end if;
  return new;
end;
$$;

create or replace function public.track_lead_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_stage_history(organization_id, lead_id, from_stage_id, to_stage_id, changed_by)
    values (new.organization_id, new.id, null, new.stage_id, auth.uid());
  elsif new.stage_id is distinct from old.stage_id then
    insert into public.lead_stage_history(organization_id, lead_id, from_stage_id, to_stage_id, changed_by)
    values (new.organization_id, new.id, old.stage_id, new.stage_id, auth.uid());
  end if;
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger organizations_touch_updated_at before update on public.organizations for each row execute function public.touch_updated_at();
create trigger pipeline_stages_touch_updated_at before update on public.pipeline_stages for each row execute function public.touch_updated_at();
create trigger leads_touch_updated_at before update on public.leads for each row execute function public.touch_updated_at();
create trigger activities_touch_updated_at before update on public.activities for each row execute function public.touch_updated_at();
create trigger calendar_events_touch_updated_at before update on public.calendar_events for each row execute function public.touch_updated_at();
create trigger goals_touch_updated_at before update on public.goals for each row execute function public.touch_updated_at();
create trigger automation_rules_touch_updated_at before update on public.automation_rules for each row execute function public.touch_updated_at();
create trigger organization_settings_touch_updated_at before update on public.organization_settings for each row execute function public.touch_updated_at();
create trigger leads_validate_stage before insert or update of stage_id, organization_id on public.leads for each row execute function public.validate_lead_stage_organization();
create trigger leads_track_stage after insert or update of stage_id on public.leads for each row execute function public.track_lead_stage_change();

create trigger on_auth_user_created
  after insert or update of raw_user_meta_data on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.leads enable row level security;
alter table public.lead_stage_history enable row level security;
alter table public.activities enable row level security;
alter table public.calls enable row level security;
alter table public.calendar_events enable row level security;
alter table public.goals enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.organization_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self_or_coworkers on public.profiles
for select to authenticated
using (
  id = auth.uid() or exists (
    select 1 from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_select_members on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy organizations_update_admin on public.organizations for update to authenticated using (public.is_organization_admin(id)) with check (public.is_organization_admin(id));
create policy organizations_delete_owner on public.organizations for delete to authenticated using (owner_id = auth.uid());

create policy members_select_members on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));
create policy members_insert_admin on public.organization_members for insert to authenticated with check (public.is_organization_admin(organization_id));
create policy members_update_admin on public.organization_members for update to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy members_delete_admin on public.organization_members for delete to authenticated using (public.is_organization_admin(organization_id));

-- Padrão comum para tabelas por organização.
create policy pipeline_stages_select on public.pipeline_stages for select to authenticated using (public.is_organization_member(organization_id));
create policy pipeline_stages_write on public.pipeline_stages for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

create policy leads_select on public.leads for select to authenticated using (public.is_organization_member(organization_id));
create policy leads_insert on public.leads for insert to authenticated with check (public.can_write_organization(organization_id));
create policy leads_update on public.leads for update to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy leads_delete on public.leads for delete to authenticated using (public.can_write_organization(organization_id));

create policy lead_stage_history_select on public.lead_stage_history for select to authenticated using (public.is_organization_member(organization_id));
create policy lead_stage_history_insert on public.lead_stage_history for insert to authenticated with check (public.can_write_organization(organization_id));

create policy activities_select on public.activities for select to authenticated using (public.is_organization_member(organization_id));
create policy activities_write on public.activities for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));

create policy calls_select on public.calls for select to authenticated using (public.is_organization_member(organization_id));
create policy calls_write on public.calls for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));

create policy calendar_events_select on public.calendar_events for select to authenticated using (public.is_organization_member(organization_id));
create policy calendar_events_write on public.calendar_events for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));

create policy goals_select on public.goals for select to authenticated using (public.is_organization_member(organization_id));
create policy goals_write on public.goals for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

create policy automation_rules_select on public.automation_rules for select to authenticated using (public.is_organization_member(organization_id));
create policy automation_rules_write on public.automation_rules for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

create policy automation_runs_select on public.automation_runs for select to authenticated using (public.is_organization_member(organization_id));
create policy automation_runs_insert on public.automation_runs for insert to authenticated with check (public.can_write_organization(organization_id));
create policy automation_runs_update on public.automation_runs for update to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

create policy organization_settings_select on public.organization_settings for select to authenticated using (public.is_organization_member(organization_id));
create policy organization_settings_write on public.organization_settings for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_organization_admin(organization_id));
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (public.can_write_organization(organization_id));


create or replace function public.storage_organization_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = public, storage, pg_temp
as $$
declare
  v_part text;
begin
  v_part := (storage.foldername(p_name))[1];
  if v_part is null then return null; end if;
  return v_part::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Storage privado: primeiro diretório do objeto deve ser o organization_id.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('crm-recordings', 'crm-recordings', false, 104857600, array['audio/webm','audio/ogg','audio/mpeg','audio/wav']),
  ('crm-attachments', 'crm-attachments', false, 52428800, null)
on conflict (id) do nothing;

create policy crm_recordings_select on storage.objects for select to authenticated
using (bucket_id = 'crm-recordings' and public.is_organization_member(public.storage_organization_id(name)));
create policy crm_recordings_insert on storage.objects for insert to authenticated
with check (bucket_id = 'crm-recordings' and public.can_write_organization(public.storage_organization_id(name)));
create policy crm_recordings_update on storage.objects for update to authenticated
using (bucket_id = 'crm-recordings' and public.can_write_organization(public.storage_organization_id(name)));
create policy crm_recordings_delete on storage.objects for delete to authenticated
using (bucket_id = 'crm-recordings' and public.can_write_organization(public.storage_organization_id(name)));

create policy crm_attachments_select on storage.objects for select to authenticated
using (bucket_id = 'crm-attachments' and public.is_organization_member(public.storage_organization_id(name)));
create policy crm_attachments_insert on storage.objects for insert to authenticated
with check (bucket_id = 'crm-attachments' and public.can_write_organization(public.storage_organization_id(name)));
create policy crm_attachments_update on storage.objects for update to authenticated
using (bucket_id = 'crm-attachments' and public.can_write_organization(public.storage_organization_id(name)));
create policy crm_attachments_delete on storage.objects for delete to authenticated
using (bucket_id = 'crm-attachments' and public.can_write_organization(public.storage_organization_id(name)));

grant execute on function public.create_organization_with_defaults(text) to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.can_write_organization(uuid) to authenticated;
grant execute on function public.is_organization_admin(uuid) to authenticated;

commit;
