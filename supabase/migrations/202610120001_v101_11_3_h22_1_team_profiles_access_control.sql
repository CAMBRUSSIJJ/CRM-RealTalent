begin;

create table if not exists public.access_profiles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_key text not null,
  name text not null,
  description text not null default '',
  system_key text null check (system_key is null or system_key in ('administrator','manager','seller','sdr','viewer')),
  is_system boolean not null default false,
  rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, profile_key),
  constraint access_profiles_name_not_blank check (length(trim(name)) > 0),
  constraint access_profiles_rules_array check (jsonb_typeof(rules) = 'array')
);

create table if not exists public.member_access_profiles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_key text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, profile_key) references public.access_profiles(organization_id, profile_key) on delete restrict
);

create index if not exists member_access_profiles_profile_idx on public.member_access_profiles(organization_id, profile_key);

alter table public.access_profiles enable row level security;
alter table public.member_access_profiles enable row level security;

drop policy if exists access_profiles_select on public.access_profiles;
drop policy if exists access_profiles_write on public.access_profiles;
drop policy if exists member_access_profiles_select on public.member_access_profiles;
drop policy if exists member_access_profiles_write on public.member_access_profiles;
create policy access_profiles_select on public.access_profiles for select to authenticated using (public.is_organization_member(organization_id));
create policy access_profiles_write on public.access_profiles for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy member_access_profiles_select on public.member_access_profiles for select to authenticated using (public.is_organization_member(organization_id));
create policy member_access_profiles_write on public.member_access_profiles for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

create or replace function public.rt_access_default_rules(p_profile text)
returns jsonb language plpgsql immutable as $$
declare
  v_resources text[] := array['contacts','pipeline','tasks','communications','proposals','prospecting','goals','settings'];
  v_resource text;
  v_rules jsonb := '[]'::jsonb;
  v_scope text;
  v_actions jsonb;
begin
  foreach v_resource in array v_resources loop
    if p_profile='administrator' then v_scope:='all'; v_actions:='["view","create","edit","delete","export","assign"]'::jsonb;
    elsif p_profile='manager' then v_scope:=case when v_resource='settings' then 'team' else 'team' end; v_actions:=case when v_resource='settings' then '["view"]'::jsonb else '["view","create","edit","assign"]'::jsonb end;
    elsif p_profile='viewer' then v_scope:=case when v_resource='settings' then 'none' else 'team' end; v_actions:=case when v_resource='settings' then '[]'::jsonb else '["view"]'::jsonb end;
    elsif p_profile='sdr' then
      if v_resource in ('proposals','settings') then v_scope:='none'; v_actions:='[]'::jsonb;
      elsif v_resource='goals' then v_scope:='own'; v_actions:='["view"]'::jsonb;
      elsif v_resource='prospecting' then v_scope:='team'; v_actions:='["view","create","edit"]'::jsonb;
      else v_scope:='own'; v_actions:='["view","create","edit"]'::jsonb; end if;
    else
      if v_resource='settings' then v_scope:='none'; v_actions:='[]'::jsonb;
      elsif v_resource='prospecting' then v_scope:='team'; v_actions:='["view","create","edit"]'::jsonb;
      else v_scope:='own'; v_actions:='["view","create","edit"]'::jsonb; end if;
    end if;
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('resource',v_resource,'scope',v_scope,'actions',v_actions));
  end loop;
  return v_rules;
end $$;

create or replace function public.rt_seed_access_profiles(p_organization_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.access_profiles(organization_id,profile_key,name,description,system_key,is_system,rules)
  values
    (p_organization_id,'system-administrator','Administrador','Controle total do workspace, equipes, dados e configurações.','administrator',true,public.rt_access_default_rules('administrator')),
    (p_organization_id,'system-manager','Gestor','Opera e acompanha todos os registros das equipes das quais participa.','manager',true,public.rt_access_default_rules('manager')),
    (p_organization_id,'system-seller','Vendedor','Trabalha a própria carteira, tarefas, conversas e propostas.','seller',true,public.rt_access_default_rules('seller')),
    (p_organization_id,'system-sdr','SDR','Prospecção e qualificação com acesso restrito à própria carteira.','sdr',true,public.rt_access_default_rules('sdr')),
    (p_organization_id,'system-viewer','Somente leitura','Consulta os registros permitidos sem alterar dados.','viewer',true,public.rt_access_default_rules('viewer'))
  on conflict (organization_id,profile_key) do nothing;
end $$;

select public.rt_seed_access_profiles(id) from public.organizations;

insert into public.member_access_profiles(organization_id,user_id,profile_key)
select m.organization_id,m.user_id,
  case
    when m.role in ('owner','admin') then 'system-administrator'
    when m.role='viewer' then 'system-viewer'
    when exists(select 1 from public.team_members tm where tm.organization_id=m.organization_id and tm.user_id=m.user_id and tm.role='leader') then 'system-manager'
    else 'system-seller'
  end
from public.organization_members m
on conflict (organization_id,user_id) do nothing;

create or replace function public.rt_seed_access_profiles_after_org()
returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.rt_seed_access_profiles(new.id); return new; end $$;
drop trigger if exists organizations_seed_access_profiles on public.organizations;
create trigger organizations_seed_access_profiles after insert on public.organizations for each row execute function public.rt_seed_access_profiles_after_org();

create or replace function public.rt_member_profile_key(p_organization_id uuid)
returns text language sql stable security definer set search_path=public as $$
  select coalesce(
    (select map.profile_key from public.member_access_profiles map where map.organization_id=p_organization_id and map.user_id=auth.uid()),
    case
      when exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')) then 'system-administrator'
      when exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role='viewer') then 'system-viewer'
      when exists(select 1 from public.team_members tm where tm.organization_id=p_organization_id and tm.user_id=auth.uid() and tm.role='leader') then 'system-manager'
      else 'system-seller'
    end
  )
$$;

create or replace function public.rt_access_rule(p_organization_id uuid, p_resource text)
returns jsonb language sql stable security definer set search_path=public as $$
  select elem
  from public.access_profiles p,
       lateral jsonb_array_elements(p.rules) elem
  where p.organization_id=p_organization_id
    and p.profile_key=public.rt_member_profile_key(p_organization_id)
    and elem->>'resource'=p_resource
  limit 1
$$;

create or replace function public.rt_access_action_allowed(p_organization_id uuid, p_resource text, p_action text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_role text; v_rule jsonb;
begin
  select role into v_role from public.organization_members where organization_id=p_organization_id and user_id=auth.uid();
  if v_role in ('owner','admin') then return true; end if;
  if v_role is null then return false; end if;
  v_rule:=public.rt_access_rule(p_organization_id,p_resource);
  if v_rule is null then return false; end if;
  return exists(select 1 from jsonb_array_elements_text(coalesce(v_rule->'actions','[]'::jsonb)) action where action=p_action);
end $$;

create or replace function public.rt_access_scope(p_organization_id uuid, p_resource text)
returns text language plpgsql stable security definer set search_path=public as $$
declare v_role text; v_rule jsonb;
begin
  select role into v_role from public.organization_members where organization_id=p_organization_id and user_id=auth.uid();
  if v_role in ('owner','admin') then return 'all'; end if;
  if v_role is null then return 'none'; end if;
  v_rule:=public.rt_access_rule(p_organization_id,p_resource);
  return coalesce(v_rule->>'scope','none');
end $$;

create or replace function public.rt_access_scope_allows(p_organization_id uuid, p_resource text, p_owner_id uuid, p_team_id uuid default null)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_scope text;
begin
  v_scope:=public.rt_access_scope(p_organization_id,p_resource);
  if v_scope='all' then return true; end if;
  if v_scope='none' then return false; end if;
  if p_owner_id=auth.uid() then return true; end if;
  if v_scope='own' then return false; end if;
  if p_team_id is not null and exists(select 1 from public.team_members tm where tm.organization_id=p_organization_id and tm.team_id=p_team_id and tm.user_id=auth.uid()) then return true; end if;
  return p_owner_id is not null and exists(
    select 1 from public.team_members mine
    join public.team_members peer on peer.organization_id=mine.organization_id and peer.team_id=mine.team_id
    where mine.organization_id=p_organization_id and mine.user_id=auth.uid() and peer.user_id=p_owner_id
  );
end $$;

-- Leads remain the legacy commercial backing record for both Contatos and Pipeline.
-- Until those surfaces stop sharing this table, a legacy lead is visible/mutable when either resource grants the action + ownership scope.
-- Canonical contacts remain additionally protected by the contacts table policies below.
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;
create policy leads_select on public.leads for select to authenticated using (
  (public.rt_access_action_allowed(organization_id,'pipeline','view') and public.rt_access_scope_allows(organization_id,'pipeline',owner_id,null))
  or (public.rt_access_action_allowed(organization_id,'contacts','view') and public.rt_access_scope_allows(organization_id,'contacts',owner_id,null))
);
create policy leads_insert on public.leads for insert to authenticated with check (
  (public.rt_access_action_allowed(organization_id,'pipeline','create') and public.rt_access_scope_allows(organization_id,'pipeline',owner_id,null))
  or (public.rt_access_action_allowed(organization_id,'contacts','create') and public.rt_access_scope_allows(organization_id,'contacts',owner_id,null))
);
create policy leads_update on public.leads for update to authenticated using (
  (public.rt_access_action_allowed(organization_id,'pipeline','edit') and public.rt_access_scope_allows(organization_id,'pipeline',owner_id,null))
  or (public.rt_access_action_allowed(organization_id,'contacts','edit') and public.rt_access_scope_allows(organization_id,'contacts',owner_id,null))
) with check (
  (public.rt_access_action_allowed(organization_id,'pipeline','edit') and public.rt_access_scope_allows(organization_id,'pipeline',owner_id,null))
  or (public.rt_access_action_allowed(organization_id,'contacts','edit') and public.rt_access_scope_allows(organization_id,'contacts',owner_id,null))
);
create policy leads_delete on public.leads for delete to authenticated using (
  (public.rt_access_action_allowed(organization_id,'pipeline','delete') and public.rt_access_scope_allows(organization_id,'pipeline',owner_id,null))
  or (public.rt_access_action_allowed(organization_id,'contacts','delete') and public.rt_access_scope_allows(organization_id,'contacts',owner_id,null))
);

drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
drop policy if exists contacts_delete on public.contacts;
create policy contacts_select on public.contacts for select to authenticated using (
  public.rt_access_action_allowed(organization_id,'contacts','view') and public.rt_access_scope_allows(organization_id,'contacts',relationship_owner_id,null)
);
create policy contacts_insert on public.contacts for insert to authenticated with check (
  public.rt_access_action_allowed(organization_id,'contacts','create') and public.rt_access_scope_allows(organization_id,'contacts',relationship_owner_id,null)
);
create policy contacts_update on public.contacts for update to authenticated using (
  public.rt_access_action_allowed(organization_id,'contacts','edit') and public.rt_access_scope_allows(organization_id,'contacts',relationship_owner_id,null)
) with check (
  public.rt_access_action_allowed(organization_id,'contacts','edit') and public.rt_access_scope_allows(organization_id,'contacts',relationship_owner_id,null)
);
create policy contacts_delete on public.contacts for delete to authenticated using (
  public.rt_access_action_allowed(organization_id,'contacts','delete') and public.rt_access_scope_allows(organization_id,'contacts',relationship_owner_id,null)
);

drop policy if exists work_tasks_select on public.work_tasks;
drop policy if exists work_tasks_write on public.work_tasks;
create policy work_tasks_select on public.work_tasks for select to authenticated using (
  public.rt_access_action_allowed(organization_id,'tasks','view') and public.rt_access_scope_allows(organization_id,'tasks',assignee_id,team_id)
);
create policy work_tasks_insert on public.work_tasks for insert to authenticated with check (
  public.rt_access_action_allowed(organization_id,'tasks','create') and public.rt_access_scope_allows(organization_id,'tasks',assignee_id,team_id)
);
create policy work_tasks_update on public.work_tasks for update to authenticated using (
  public.rt_access_action_allowed(organization_id,'tasks','edit') and public.rt_access_scope_allows(organization_id,'tasks',assignee_id,team_id)
) with check (
  public.rt_access_action_allowed(organization_id,'tasks','edit') and public.rt_access_scope_allows(organization_id,'tasks',assignee_id,team_id)
);
create policy work_tasks_delete on public.work_tasks for delete to authenticated using (
  public.rt_access_action_allowed(organization_id,'tasks','delete') and public.rt_access_scope_allows(organization_id,'tasks',assignee_id,team_id)
);

-- Assignment is a distinct permission from edit/create. RLS controls the row scope;
-- this trigger prevents a profile with edit/create but without assign from changing ownership.
create or replace function public.rt_enforce_assignment_permission()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_org uuid;
  v_requires_assign boolean := false;
  v_allowed boolean := false;
begin
  if auth.uid() is null then return new; end if;
  v_org := new.organization_id;

  if tg_table_name='leads' then
    if tg_op='INSERT' then v_requires_assign := new.owner_id is distinct from auth.uid();
    else v_requires_assign := new.owner_id is distinct from old.owner_id; end if;
    if v_requires_assign then
      v_allowed := public.rt_access_action_allowed(v_org,'contacts','assign') or public.rt_access_action_allowed(v_org,'pipeline','assign');
    end if;
  elsif tg_table_name='contacts' then
    if tg_op='INSERT' then v_requires_assign := new.relationship_owner_id is distinct from auth.uid();
    else v_requires_assign := new.relationship_owner_id is distinct from old.relationship_owner_id; end if;
    if v_requires_assign then v_allowed := public.rt_access_action_allowed(v_org,'contacts','assign'); end if;
  elsif tg_table_name='work_tasks' then
    if tg_op='INSERT' then
      v_requires_assign := (new.assignee_id is not null and new.assignee_id is distinct from auth.uid()) or (new.assignee_id is null and new.team_id is not null);
    else
      v_requires_assign := new.assignee_id is distinct from old.assignee_id or new.team_id is distinct from old.team_id;
    end if;
    if v_requires_assign then v_allowed := public.rt_access_action_allowed(v_org,'tasks','assign'); end if;
  end if;

  if v_requires_assign and not v_allowed then
    raise exception 'Permissão negada: o perfil não permite reatribuir este registro.' using errcode='42501';
  end if;
  return new;
end $$;

drop trigger if exists leads_enforce_assignment_permission on public.leads;
create trigger leads_enforce_assignment_permission before insert or update of owner_id on public.leads for each row execute function public.rt_enforce_assignment_permission();
drop trigger if exists contacts_enforce_assignment_permission on public.contacts;
create trigger contacts_enforce_assignment_permission before insert or update of relationship_owner_id on public.contacts for each row execute function public.rt_enforce_assignment_permission();
drop trigger if exists work_tasks_enforce_assignment_permission on public.work_tasks;
create trigger work_tasks_enforce_assignment_permission before insert or update of assignee_id,team_id on public.work_tasks for each row execute function public.rt_enforce_assignment_permission();

revoke all on function public.rt_seed_access_profiles(uuid) from public, anon, authenticated;

commit;
