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

-- Private opt-in phone verification: only service_role can access the code.
create table if not exists public.whatsapp_local_phone_challenges (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  code text not null check (code ~ '^[0-9]{6}$'),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  requests_today integer not null default 1,
  request_day date not null default current_date,
  primary key (organization_id,user_id)
);
alter table public.whatsapp_local_phone_challenges enable row level security;
revoke all on public.whatsapp_local_phone_challenges from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_local_phone_challenges to service_role;

create or replace function public.queue_whatsapp_local_phone_code(
  p_organization_id uuid, p_user_id uuid, p_phone text, p_code text
) returns boolean language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' or p_code !~ '^[0-9]{6}$' then return false; end if;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || p_user_id::text));
  select exists(
    select 1 from public.organization_members
     where organization_id=p_organization_id and user_id=p_user_id
  ) into allowed;
  if not allowed then return false; end if;
  insert into public.whatsapp_local_phone_challenges
    (organization_id,user_id,phone_e164,code,expires_at)
    values (p_organization_id,p_user_id,p_phone,p_code,now()+interval '5 minutes')
  on conflict (organization_id,user_id) do update set
    phone_e164=excluded.phone_e164,code=excluded.code,requested_at=now(),
    expires_at=excluded.expires_at,claimed_at=null,sent_at=null,attempts=0,
    requests_today=case when whatsapp_local_phone_challenges.request_day=current_date
      then whatsapp_local_phone_challenges.requests_today+1 else 1 end,
    request_day=current_date
  where whatsapp_local_phone_challenges.requested_at < now()-interval '90 seconds'
    and (whatsapp_local_phone_challenges.request_day<>current_date or
      whatsapp_local_phone_challenges.requests_today < 5);
  return found;
end $$;

create or replace function public.confirm_whatsapp_local_phone_code(
  p_organization_id uuid, p_user_id uuid, p_code text
) returns boolean language plpgsql security definer set search_path='' as $$
declare c record;
begin
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || p_user_id::text));
  update public.whatsapp_local_phone_challenges
     set attempts=attempts+1
   where organization_id=p_organization_id and user_id=p_user_id
     and sent_at is not null and expires_at>now() and attempts < 5
   returning phone_e164,code into c;
  if not found then return false; end if;
  if c.code is distinct from p_code then return false; end if;
  insert into public.task_notification_verified_phones
    (organization_id,user_id,phone_e164,verified_at)
    values (p_organization_id,p_user_id,c.phone_e164,now())
  on conflict (organization_id,user_id) do update
    set phone_e164=excluded.phone_e164,verified_at=now();
  delete from public.whatsapp_local_phone_challenges
   where organization_id=p_organization_id and user_id=p_user_id;
  return true;
end $$;

create or replace function public.claim_whatsapp_local_phone_codes(p_organization_id uuid)
returns setof public.whatsapp_local_phone_challenges
language sql security definer set search_path='' as $$
  update public.whatsapp_local_phone_challenges
     set claimed_at=now()
   where (organization_id,user_id) in
     (select organization_id,user_id from public.whatsapp_local_phone_challenges
        where organization_id=p_organization_id and expires_at>now()
          and claimed_at is null and sent_at is null
        order by requested_at limit 2 for update skip locked)
   returning *;
$$;
revoke all on function public.queue_whatsapp_local_phone_code(uuid,uuid,text,text),
  public.confirm_whatsapp_local_phone_code(uuid,uuid,text),
  public.claim_whatsapp_local_phone_codes(uuid) from public, anon, authenticated;
grant execute on function public.queue_whatsapp_local_phone_code(uuid,uuid,text,text),
  public.confirm_whatsapp_local_phone_code(uuid,uuid,text),
  public.claim_whatsapp_local_phone_codes(uuid) to service_role;

commit;
