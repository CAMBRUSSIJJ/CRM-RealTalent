-- V101.11.3 · RealTalent Connect · pairing without service_role on Linux.
-- No changes to existing work_tasks trigger or task_notification_outbox.
begin;

create table if not exists public.whatsapp_connect_pairings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  code_sha256 text not null unique check (code_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_connect_pairings enable row level security;
revoke all on public.whatsapp_connect_pairings from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_connect_pairings to service_role;

create table if not exists public.whatsapp_connect_devices (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid() unique,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  label text not null default 'RealTalent Connect Linux',
  paired_by uuid not null references auth.users(id),
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
alter table public.whatsapp_connect_devices enable row level security;
revoke all on public.whatsapp_connect_devices from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_connect_devices to service_role;
create index if not exists whatsapp_connect_devices_active_idx
  on public.whatsapp_connect_devices(id) where revoked_at is null;

comment on table public.whatsapp_connect_pairings is
  'Temporary SHA-256 pairing codes; redeemable once, no frontend table access.';
comment on table public.whatsapp_connect_devices is
  'Revocable device-scoped token hashes; service_role key never leaves Supabase.';
commit;
