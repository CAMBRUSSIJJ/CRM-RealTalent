-- V101.11.3: local WhatsApp transport, preserving the existing task_notification_outbox.
-- Does NOT install assignment triggers, duplicate queues, or change existing notifications.
begin;

create table if not exists public.whatsapp_local_bridge (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  heartbeat_at timestamptz,
  connection_state text not null default 'close'
    check (connection_state in ('missing','close','connecting','open','error')),
  qr_base64 text check (length(qr_base64) <= 500000),
  qr_expires_at timestamptz,
  requested_action text check (requested_action in ('connect','disconnect')),
  request_id uuid,
  claimed_request_id uuid,
  request_created_at timestamptz,
  completed_request_id uuid,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_local_bridge enable row level security;
revoke all on public.whatsapp_local_bridge from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_local_bridge to service_role;

create or replace function public.claim_whatsapp_local_action(p_organization_id uuid)
returns setof public.whatsapp_local_bridge
language sql security definer set search_path = '' as $$
  update public.whatsapp_local_bridge
     set claimed_request_id = request_id, updated_at = now()
   where organization_id = p_organization_id
     and requested_action is not null and request_id is not null
     and request_id is distinct from claimed_request_id
     and request_created_at > now() - interval '2 minutes'
   returning *;
$$;

-- Claim existing jobs atomically; in-app and email channels are never claimed.
-- No new trigger and no duplicate task outbox.
create or replace function public.claim_whatsapp_local_jobs(p_organization_id uuid)
returns setof public.task_notification_outbox
language plpgsql security definer set search_path = '' as $$
begin
  -- Unknown outcome after an interrupted send: no automatic re-send.
  update public.task_notification_outbox
     set status = 'blocked',
         last_error = 'local_bridge_interrupted_delivery_requires_review',
         processed_at = now()
   where organization_id = p_organization_id and channel = 'whatsapp'
     and status = 'processing' and claimed_at < now() - interval '10 minutes';

  return query
    update public.task_notification_outbox q
       set status = 'processing',
           claimed_at = now(),
           attempt_count = q.attempt_count + 1
     where q.id in (
       select id from public.task_notification_outbox
        where organization_id = p_organization_id
          and channel = 'whatsapp'
          and status = 'pending'
          and scheduled_at <= now()
        order by scheduled_at, id limit 3 for update skip locked
     )
    returning q.*;
end;
$$;

revoke all on function public.claim_whatsapp_local_action(uuid) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_local_jobs(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_local_action(uuid) to service_role;
grant execute on function public.claim_whatsapp_local_jobs(uuid) to service_role;
comment on table public.whatsapp_local_bridge is
  'Outbound-only local Evolution status and QR handoff; sensitive QR never accessible via browser table queries.';
commit;
