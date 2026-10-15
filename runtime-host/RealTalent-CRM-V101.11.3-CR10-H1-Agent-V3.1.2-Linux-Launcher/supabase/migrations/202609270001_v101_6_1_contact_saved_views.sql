-- V101.6.1 — visualizações persistentes de Contatos
create table if not exists public.contact_saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  display text not null default 'table' check (display in ('table','board','compact')),
  filters jsonb not null default '{}'::jsonb,
  columns text[] not null default array[]::text[],
  density text not null default 'comfortable' check (density in ('comfortable','compact')),
  sort_key text not null default 'updated-desc',
  group_by text not null default 'stage' check (group_by in ('stage')),
  visibility text not null default 'private' check (visibility in ('private','workspace')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contact_saved_views_org_updated_idx on public.contact_saved_views(organization_id, updated_at desc);
create index if not exists contact_saved_views_owner_idx on public.contact_saved_views(created_by, organization_id);
create unique index if not exists contact_saved_views_one_default_per_user_idx on public.contact_saved_views(organization_id, created_by) where is_default;

alter table public.contact_saved_views enable row level security;
drop policy if exists contact_saved_views_select on public.contact_saved_views;
create policy contact_saved_views_select on public.contact_saved_views for select to authenticated using (
  public.is_organization_member(organization_id) and (visibility='workspace' or created_by=auth.uid())
);
drop policy if exists contact_saved_views_insert on public.contact_saved_views;
create policy contact_saved_views_insert on public.contact_saved_views for insert to authenticated with check (
  public.can_write_organization(organization_id) and created_by=auth.uid()
);
drop policy if exists contact_saved_views_update on public.contact_saved_views;
create policy contact_saved_views_update on public.contact_saved_views for update to authenticated using (
  public.can_write_organization(organization_id) and created_by=auth.uid()
) with check (public.can_write_organization(organization_id) and created_by=auth.uid());
drop policy if exists contact_saved_views_delete on public.contact_saved_views;
create policy contact_saved_views_delete on public.contact_saved_views for delete to authenticated using (
  public.can_write_organization(organization_id) and created_by=auth.uid()
);
grant select,insert,update,delete on public.contact_saved_views to authenticated;
