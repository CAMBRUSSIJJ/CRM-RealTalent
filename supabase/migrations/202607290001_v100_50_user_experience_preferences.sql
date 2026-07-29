begin;

-- RealTalent CRM V100.50
-- Preferências individuais de experiência, sincronizadas por usuário e workspace.

create table if not exists public.user_experience_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists user_experience_preferences_user_idx
  on public.user_experience_preferences(user_id, updated_at desc);

alter table public.user_experience_preferences enable row level security;

drop policy if exists user_experience_preferences_select on public.user_experience_preferences;
create policy user_experience_preferences_select
  on public.user_experience_preferences
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  );

drop policy if exists user_experience_preferences_insert on public.user_experience_preferences;
create policy user_experience_preferences_insert
  on public.user_experience_preferences
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  );

drop policy if exists user_experience_preferences_update on public.user_experience_preferences;
create policy user_experience_preferences_update
  on public.user_experience_preferences
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  );

revoke all on table public.user_experience_preferences from anon;
grant select, insert, update on table public.user_experience_preferences to authenticated;

commit;
