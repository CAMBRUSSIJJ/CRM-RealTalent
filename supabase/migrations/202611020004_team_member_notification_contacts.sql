-- One directory contact per employee and workspace; storing a phone does NOT grant consent.
-- A verified self-confirmation remains mandatory for outbound WhatsApp.
create table if not exists public.team_member_notification_contacts (
  organization_id uuid not null,
  user_id uuid not null,
  phone_e164 text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id) on delete cascade,
  constraint team_contact_phone_format check (
    phone_e164 is null or phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'
  )
);
create index if not exists team_member_notification_contacts_updated_idx
  on public.team_member_notification_contacts(organization_id,updated_at desc);
alter table public.team_member_notification_contacts enable row level security;
revoke all on public.team_member_notification_contacts from anon, authenticated;
grant select,insert,update on public.team_member_notification_contacts to authenticated;
drop policy if exists team_notification_contact_read on public.team_member_notification_contacts;
create policy team_notification_contact_read on public.team_member_notification_contacts
 for select to authenticated using (
  public.is_organization_member(organization_id) and
  (user_id = (select auth.uid()) or public.is_organization_admin(organization_id))
 );
drop policy if exists team_notification_contact_insert on public.team_member_notification_contacts;
create policy team_notification_contact_insert on public.team_member_notification_contacts
 for insert to authenticated with check (
  public.is_organization_member(organization_id) and
  (user_id = (select auth.uid()) or public.is_organization_admin(organization_id))
 );
drop policy if exists team_notification_contact_update on public.team_member_notification_contacts;
create policy team_notification_contact_update on public.team_member_notification_contacts
 for update to authenticated using (
  public.is_organization_member(organization_id) and
  (user_id = (select auth.uid()) or public.is_organization_admin(organization_id))
 ) with check (
  public.is_organization_member(organization_id) and
  (user_id = (select auth.uid()) or public.is_organization_admin(organization_id))
 );
comment on table public.team_member_notification_contacts is
 'Contact directory only. Consent and verified ownership are separate mandatory gates for WhatsApp delivery.';
