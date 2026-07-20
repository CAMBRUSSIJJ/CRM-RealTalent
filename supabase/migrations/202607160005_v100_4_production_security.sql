-- RealTalent CRM V100.4
-- Produção, segurança, equipes, convites, auditoria e verificação do ambiente.

begin;

alter table public.profiles add column if not exists email text not null default '';
update public.profiles p set email = lower(coalesce(u.email, '')) from auth.users u where u.id = p.id and p.email = '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    lower(coalesce(new.email,'')),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'script' check (kind in ('script','objection')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  category text not null default '',
  content text not null check (char_length(trim(content)) between 1 and 10000),
  tags text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists playbooks_org_kind_idx on public.playbooks(organization_id, kind, active);
alter table public.playbooks enable row level security;
drop policy if exists playbooks_select on public.playbooks;
drop policy if exists playbooks_write on public.playbooks;
create policy playbooks_select on public.playbooks for select to authenticated using (public.is_organization_member(organization_id));
create policy playbooks_write on public.playbooks for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
drop trigger if exists playbooks_touch_updated_at on public.playbooks;
create trigger playbooks_touch_updated_at before update on public.playbooks for each row execute function public.touch_updated_at();

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  email text not null default '',
  role public.organization_role not null default 'member' check (role <> 'owner'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists organization_invites_org_idx on public.organization_invites(organization_id, created_at desc);
create index if not exists organization_invites_active_idx on public.organization_invites(token) where accepted_at is null and revoked_at is null;

alter table public.organization_invites enable row level security;

drop policy if exists organization_invites_select_admin on public.organization_invites;
create policy organization_invites_select_admin on public.organization_invites
for select to authenticated using (public.is_organization_admin(organization_id));

-- Protege o proprietário contra remoção ou rebaixamento por acesso direto à tabela.
create or replace function public.protect_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.organizations where id = coalesce(new.organization_id, old.organization_id);
  if tg_op = 'DELETE' and old.user_id = v_owner then
    raise exception 'The organization owner cannot be removed';
  end if;
  if tg_op = 'UPDATE' and old.user_id = v_owner and new.role <> 'owner' then
    raise exception 'The organization owner cannot be downgraded';
  end if;
  if tg_op in ('INSERT','UPDATE') and new.role = 'owner' and new.user_id <> v_owner then
    raise exception 'Only organizations.owner_id may have the owner role';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists organization_members_protect_owner on public.organization_members;
create trigger organization_members_protect_owner
before insert or update or delete on public.organization_members
for each row execute function public.protect_organization_owner();

create or replace function public.create_organization_invite(
  p_organization_id uuid,
  p_email text,
  p_role public.organization_role default 'member'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.organization_invites;
  v_email text := lower(trim(coalesce(p_email,'')));
begin
  if not public.is_organization_admin(p_organization_id) then raise exception 'Administrator permission required'; end if;
  if p_role = 'owner' then raise exception 'Owner invitations are not allowed'; end if;
  if v_email = '' or position('@' in v_email) < 2 then raise exception 'Invalid email'; end if;

  update public.organization_invites
  set revoked_at = now()
  where organization_id = p_organization_id and email = v_email and accepted_at is null and revoked_at is null;

  insert into public.organization_invites(organization_id, email, role)
  values (p_organization_id, v_email, p_role)
  returning * into v_invite;

  insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
  values (p_organization_id, 'invite_created', 'organization_invite', v_invite.id::text, jsonb_build_object('email',v_email,'role',p_role));

  return jsonb_build_object(
    'id', v_invite.id, 'token', v_invite.token, 'email', v_invite.email, 'role', v_invite.role,
    'expires_at', v_invite.expires_at, 'created_at', v_invite.created_at
  );
end;
$$;

create or replace function public.accept_organization_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite public.organization_invites;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select lower(coalesce(email,'')) into v_email from auth.users where id = v_user;
  select * into v_invite from public.organization_invites
  where token::text = trim(p_token) and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if v_invite.id is null then raise exception 'Invite invalid or expired'; end if;
  if v_invite.email <> '' and v_invite.email <> v_email then raise exception 'This invite belongs to another email'; end if;

  insert into public.organization_members(organization_id, user_id, role)
  values (v_invite.organization_id, v_user, v_invite.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;

  update public.organization_invites set accepted_at = now() where id = v_invite.id;
  insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
  values (v_invite.organization_id, 'invite_accepted', 'organization_member', v_user::text, jsonb_build_object('role',v_invite.role));
  return v_invite.organization_id;
end;
$$;

create or replace function public.revoke_organization_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.organization_invites where id = p_invite_id;
  if v_org is null then raise exception 'Invite not found'; end if;
  if not public.is_organization_admin(v_org) then raise exception 'Administrator permission required'; end if;
  update public.organization_invites set revoked_at = now() where id = p_invite_id and accepted_at is null;
  insert into public.audit_logs(organization_id, action, entity_type, entity_id) values (v_org, 'invite_revoked', 'organization_invite', p_invite_id::text);
  return true;
end;
$$;

create or replace function public.update_organization_member_role(p_organization_id uuid, p_user_id uuid, p_role public.organization_role)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_owner uuid;
begin
  if not public.is_organization_admin(p_organization_id) then raise exception 'Administrator permission required'; end if;
  select owner_id into v_owner from public.organizations where id = p_organization_id;
  if p_user_id = v_owner then raise exception 'The owner role cannot be changed'; end if;
  if p_role = 'owner' then raise exception 'Ownership transfer requires a dedicated process'; end if;
  update public.organization_members set role = p_role where organization_id = p_organization_id and user_id = p_user_id;
  if not found then raise exception 'Member not found'; end if;
  insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data) values (p_organization_id, 'member_role_updated', 'organization_member', p_user_id::text, jsonb_build_object('role',p_role));
  return true;
end;
$$;

create or replace function public.remove_organization_member(p_organization_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_owner uuid;
begin
  if not public.is_organization_admin(p_organization_id) then raise exception 'Administrator permission required'; end if;
  select owner_id into v_owner from public.organizations where id = p_organization_id;
  if p_user_id = v_owner then raise exception 'The owner cannot be removed'; end if;
  delete from public.organization_members where organization_id = p_organization_id and user_id = p_user_id;
  if not found then raise exception 'Member not found'; end if;
  update public.leads set owner_id = null where organization_id = p_organization_id and owner_id = p_user_id;
  insert into public.audit_logs(organization_id, action, entity_type, entity_id) values (p_organization_id, 'member_removed', 'organization_member', p_user_id::text);
  return true;
end;
$$;

-- Auditoria compacta: evita copiar notas, transcrições ou caminhos de gravação.
create or replace function public.audit_crm_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_id text;
  v_before jsonb;
  v_after jsonb;
begin
  v_org := coalesce((to_jsonb(new)->>'organization_id')::uuid, (to_jsonb(old)->>'organization_id')::uuid);
  v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');
  v_before := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - array['notes','description','transcript','recording_path'] else null end;
  v_after := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - array['notes','description','transcript','recording_path'] else null end;
  insert into public.audit_logs(organization_id, action, entity_type, entity_id, before_data, after_data)
  values (v_org, lower(tg_op), tg_table_name, v_id, v_before, v_after);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['leads','pipeline_stages','activities','calls','calendar_events','playbooks','goals','automation_rules'] loop
    execute format('drop trigger if exists %I_audit_v1004 on public.%I', t, t);
    execute format('create trigger %I_audit_v1004 after insert or update or delete on public.%I for each row execute function public.audit_crm_change()', t, t);
  end loop;
end $$;

create or replace function public.production_readiness(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'member', public.is_organization_member(p_organization_id),
    'admin', public.is_organization_admin(p_organization_id),
    'members', (select count(*) from public.organization_members where organization_id = p_organization_id),
    'stages', (select count(*) from public.pipeline_stages where organization_id = p_organization_id),
    'leads', (select count(*) from public.leads where organization_id = p_organization_id),
    'open_activities', (select count(*) from public.activities where organization_id = p_organization_id and completed_at is null),
    'active_invites', (select count(*) from public.organization_invites where organization_id = p_organization_id and accepted_at is null and revoked_at is null and expires_at > now()),
    'checked_at', now()
  )
  where public.is_organization_member(p_organization_id);
$$;

-- A auditoria é somente leitura no cliente. Escritas são feitas por triggers e RPCs security definer.
drop policy if exists audit_logs_insert on public.audit_logs;
revoke insert, update, delete on public.audit_logs from authenticated;

-- Restringe políticas diretas de membros; mudanças sensíveis passam pelas funções protegidas.
drop policy if exists members_update_admin on public.organization_members;
drop policy if exists members_delete_admin on public.organization_members;
create policy members_update_admin on public.organization_members for update to authenticated
using (public.is_organization_admin(organization_id) and role <> 'owner')
with check (public.is_organization_admin(organization_id) and role <> 'owner');
create policy members_delete_admin on public.organization_members for delete to authenticated
using (public.is_organization_admin(organization_id) and role <> 'owner');

grant execute on function public.create_organization_invite(uuid,text,public.organization_role) to authenticated;
grant execute on function public.accept_organization_invite(text) to authenticated;
grant execute on function public.revoke_organization_invite(uuid) to authenticated;
grant execute on function public.update_organization_member_role(uuid,uuid,public.organization_role) to authenticated;
grant execute on function public.remove_organization_member(uuid,uuid) to authenticated;
grant execute on function public.production_readiness(uuid) to authenticated;

commit;
