-- V101.8.3 Hotfix 1 — Contact Identity Sync
-- ContactRecord is the canonical person identity when a Lead has primary_contact_id.
-- Direct edits remain bidirectional through guarded database triggers.

-- Heal legacy divergence before enabling the bidirectional guards.
-- Empty/unknown structured fields are first enriched from the commercial record;
-- after that, the ContactRecord becomes the canonical person identity.
update public.contacts c
set
  phone = coalesce(nullif(trim(c.phone), ''), (
    select nullif(trim(l.phone), '') from public.leads l
    where l.organization_id = c.organization_id and l.primary_contact_id = c.id and nullif(trim(l.phone), '') is not null
    order by l.updated_at desc, l.id limit 1
  ), ''),
  email = lower(coalesce(nullif(trim(c.email), ''), (
    select nullif(trim(l.email), '') from public.leads l
    where l.organization_id = c.organization_id and l.primary_contact_id = c.id and nullif(trim(l.email), '') is not null
    order by l.updated_at desc, l.id limit 1
  ), '')),
  job_title = coalesce(nullif(trim(c.job_title), ''), (
    select nullif(trim(l.job_title), '') from public.leads l
    where l.organization_id = c.organization_id and l.primary_contact_id = c.id and nullif(trim(l.job_title), '') is not null
    order by l.updated_at desc, l.id limit 1
  ), ''),
  decision_role = case when c.decision_role = 'unknown' then coalesce((
    select l.decision_role from public.leads l
    where l.organization_id = c.organization_id and l.primary_contact_id = c.id and l.decision_role <> 'unknown'
    order by l.updated_at desc, l.id limit 1
  ), c.decision_role) else c.decision_role end,
  influence_level = case when c.influence_level = 0 then coalesce((
    select nullif(l.influence_level, 0) from public.leads l
    where l.organization_id = c.organization_id and l.primary_contact_id = c.id and l.influence_level > 0
    order by l.updated_at desc, l.id limit 1
  ), c.influence_level) else c.influence_level end,
  consent_status = case when c.consent_status = 'unknown' then coalesce((
    select l.consent_status from public.leads l
    where l.organization_id = c.organization_id and l.primary_contact_id = c.id and l.consent_status <> 'unknown'
    order by l.updated_at desc, l.id limit 1
  ), c.consent_status) else c.consent_status end,
  do_not_contact = c.do_not_contact or exists(
    select 1 from public.leads l where l.organization_id = c.organization_id and l.primary_contact_id = c.id and l.do_not_contact
  ),
  do_not_contact_reason = coalesce(nullif(trim(c.do_not_contact_reason), ''), (
    select nullif(trim(l.do_not_contact_reason), '') from public.leads l
    where l.organization_id = c.organization_id and l.primary_contact_id = c.id and nullif(trim(l.do_not_contact_reason), '') is not null
    order by l.updated_at desc, l.id limit 1
  ), '')
where exists (
  select 1 from public.leads l where l.organization_id = c.organization_id and l.primary_contact_id = c.id
);

update public.leads l
set
  name = c.name,
  job_title = c.job_title,
  phone = c.phone,
  email = lower(trim(c.email)),
  decision_role = c.decision_role,
  influence_level = c.influence_level,
  consent_status = c.consent_status,
  do_not_contact = c.do_not_contact,
  do_not_contact_reason = c.do_not_contact_reason,
  updated_at = greatest(l.updated_at, c.updated_at)
from public.contacts c
where l.primary_contact_id = c.id
  and l.organization_id = c.organization_id
  and (
    l.name is distinct from c.name or
    l.job_title is distinct from c.job_title or
    l.phone is distinct from c.phone or
    lower(trim(l.email)) is distinct from lower(trim(c.email)) or
    l.decision_role is distinct from c.decision_role or
    l.influence_level is distinct from c.influence_level or
    l.consent_status is distinct from c.consent_status or
    l.do_not_contact is distinct from c.do_not_contact or
    l.do_not_contact_reason is distinct from c.do_not_contact_reason
  );

create or replace function public.sync_primary_contact_identity_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.primary_contact_id is null then
    return new;
  end if;

  update public.contacts c
  set
    name = new.name,
    job_title = coalesce(new.job_title, ''),
    phone = coalesce(new.phone, ''),
    email = lower(trim(coalesce(new.email, ''))),
    decision_role = coalesce(new.decision_role, 'unknown'),
    influence_level = coalesce(new.influence_level, 0),
    consent_status = coalesce(new.consent_status, 'unknown'),
    do_not_contact = coalesce(new.do_not_contact, false),
    do_not_contact_reason = coalesce(new.do_not_contact_reason, ''),
    lead_ids = case when new.id = any(c.lead_ids) then c.lead_ids else array_append(c.lead_ids, new.id) end
  where c.id = new.primary_contact_id
    and c.organization_id = new.organization_id;

  return new;
end;
$$;

create or replace function public.sync_primary_lead_identity_from_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  update public.leads l
  set
    name = new.name,
    job_title = new.job_title,
    phone = new.phone,
    email = lower(trim(new.email)),
    decision_role = new.decision_role,
    influence_level = new.influence_level,
    consent_status = new.consent_status,
    do_not_contact = new.do_not_contact,
    do_not_contact_reason = new.do_not_contact_reason
  where l.organization_id = new.organization_id
    and l.primary_contact_id = new.id;

  return new;
end;
$$;

drop trigger if exists leads_primary_contact_identity_sync on public.leads;
create trigger leads_primary_contact_identity_sync
after update of name, job_title, phone, email, decision_role, influence_level, consent_status, do_not_contact, do_not_contact_reason
on public.leads
for each row
when (
  old.name is distinct from new.name or
  old.job_title is distinct from new.job_title or
  old.phone is distinct from new.phone or
  old.email is distinct from new.email or
  old.decision_role is distinct from new.decision_role or
  old.influence_level is distinct from new.influence_level or
  old.consent_status is distinct from new.consent_status or
  old.do_not_contact is distinct from new.do_not_contact or
  old.do_not_contact_reason is distinct from new.do_not_contact_reason
)
execute function public.sync_primary_contact_identity_from_lead();

drop trigger if exists contacts_primary_lead_identity_sync on public.contacts;
create trigger contacts_primary_lead_identity_sync
after update of name, job_title, phone, email, decision_role, influence_level, consent_status, do_not_contact, do_not_contact_reason
on public.contacts
for each row
when (
  old.name is distinct from new.name or
  old.job_title is distinct from new.job_title or
  old.phone is distinct from new.phone or
  old.email is distinct from new.email or
  old.decision_role is distinct from new.decision_role or
  old.influence_level is distinct from new.influence_level or
  old.consent_status is distinct from new.consent_status or
  old.do_not_contact is distinct from new.do_not_contact or
  old.do_not_contact_reason is distinct from new.do_not_contact_reason
)
execute function public.sync_primary_lead_identity_from_contact();
