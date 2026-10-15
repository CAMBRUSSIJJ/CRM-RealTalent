-- V101.6.3 — Contact Views 2.0: identidade visual, ordem e presets editáveis.
alter table public.contact_saved_views add column if not exists color text not null default '#315fd6';
alter table public.contact_saved_views add column if not exists icon text not null default 'table';
alter table public.contact_saved_views add column if not exists position integer not null default 100 check (position >= 0);
alter table public.contact_saved_views add column if not exists starter_key text null check (starter_key is null or starter_key in ('all','hot','due','no-action'));
alter table public.contact_saved_views add column if not exists is_archived boolean not null default false;

create unique index if not exists contact_saved_views_starter_per_user_idx
  on public.contact_saved_views(organization_id, created_by, starter_key)
  where starter_key is not null;
create index if not exists contact_saved_views_visible_order_idx
  on public.contact_saved_views(organization_id, is_archived, position, updated_at desc);
