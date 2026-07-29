-- RealTalent CRM V100.42 — Comunicações Oficiais
begin;

alter table public.integration_connected_accounts
  add column if not exists connected_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  account_id uuid references public.integration_connected_accounts(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp','calendar')),
  external_thread_id text,
  subject text not null default '',
  status text not null default 'open' check (status in ('open','closed','archived')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid references public.communication_threads(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  account_id uuid references public.integration_connected_accounts(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp','calendar','call','meeting','note','system')),
  direction text not null check (direction in ('inbound','outbound','internal')),
  event_type text not null check (event_type in ('message','email','calendar_event','delivery_status','internal_note')),
  status text not null default 'received' check (status in ('queued','sent','delivered','read','received','failed','cancelled')),
  external_message_id text,
  idempotency_key text,
  sender_address text not null default '',
  recipient_addresses text[] not null default '{}',
  subject text not null default '',
  body_text text not null default '',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, channel, external_message_id),
  unique (organization_id, idempotency_key)
);

create table if not exists public.communication_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.communication_events(id) on delete cascade,
  account_id uuid not null references public.integration_connected_accounts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp')),
  status text not null default 'queued' check (status in ('queued','processing','retry','sent','failed','dead_letter','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table if not exists public.communication_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.integration_connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','whatsapp_cloud')),
  resource_type text not null check (resource_type in ('gmail','google_calendar','outlook_mail','outlook_calendar','whatsapp_messages')),
  external_subscription_id text,
  resource_id text,
  verification_secret_hash text,
  sync_cursor text,
  expiration_at timestamptz,
  status text not null default 'active' check (status in ('active','renewal_due','expired','paused','error')),
  last_notification_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, resource_type)
);

create table if not exists public.calendar_external_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  account_id uuid not null references public.integration_connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  external_event_id text not null,
  external_calendar_id text,
  etag text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_event_id),
  unique (event_id, account_id)
);

create index if not exists communication_threads_org_lead_idx on public.communication_threads(organization_id,lead_id,last_message_at desc);
create index if not exists communication_events_org_lead_time_idx on public.communication_events(organization_id,lead_id,occurred_at desc);
create index if not exists communication_events_org_channel_time_idx on public.communication_events(organization_id,channel,occurred_at desc);
create index if not exists communication_outbox_queue_idx on public.communication_outbox(status,available_at) where status in ('queued','retry');
create index if not exists communication_subscriptions_expiration_idx on public.communication_subscriptions(status,expiration_at);

alter table public.communication_threads enable row level security;
alter table public.communication_events enable row level security;
alter table public.communication_outbox enable row level security;
alter table public.communication_subscriptions enable row level security;
alter table public.calendar_external_links enable row level security;

create policy communication_threads_select on public.communication_threads for select to authenticated using (public.is_organization_member(organization_id));
create policy communication_threads_write on public.communication_threads for all to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy communication_events_select on public.communication_events for select to authenticated using (public.is_organization_member(organization_id));
create policy communication_outbox_select on public.communication_outbox for select to authenticated using (public.is_organization_member(organization_id));
create policy communication_subscriptions_select on public.communication_subscriptions for select to authenticated using (public.is_organization_admin(organization_id));
create policy calendar_external_links_select on public.calendar_external_links for select to authenticated using (public.is_organization_member(organization_id));

revoke insert,update,delete on public.communication_events from authenticated;
revoke insert,update,delete on public.communication_outbox from authenticated;
revoke insert,update,delete on public.communication_subscriptions from authenticated;
revoke insert,update,delete on public.calendar_external_links from authenticated;

create trigger communication_threads_touch before update on public.communication_threads for each row execute function public.touch_updated_at();
create trigger communication_outbox_touch before update on public.communication_outbox for each row execute function public.touch_updated_at();
create trigger communication_subscriptions_touch before update on public.communication_subscriptions for each row execute function public.touch_updated_at();
create trigger calendar_external_links_touch before update on public.calendar_external_links for each row execute function public.touch_updated_at();

create or replace function public.enqueue_official_communication(
  p_organization_id uuid,
  p_lead_id uuid,
  p_account_id uuid,
  p_channel text,
  p_recipient text,
  p_subject text,
  p_body text,
  p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account public.integration_connected_accounts; v_lead public.leads; v_thread_id uuid; v_event_id uuid;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_channel not in ('email','whatsapp') then raise exception 'Canal não suportado'; end if;
  select * into v_lead from public.leads where id=p_lead_id and organization_id=p_organization_id;
  if v_lead.id is null then raise exception 'Lead não encontrado'; end if;
  if coalesce(v_lead.do_not_contact,false) then raise exception 'Este lead está bloqueado para contato'; end if;
  select * into v_account from public.integration_connected_accounts where id=p_account_id and organization_id=p_organization_id and status='connected' and has_credential=true;
  if v_account.id is null then raise exception 'Conta oficial não conectada'; end if;
  if p_channel='email' and v_account.provider not in ('google','microsoft') then raise exception 'A conta selecionada não envia e-mail'; end if;
  if p_channel='whatsapp' and v_account.provider <> 'whatsapp_cloud' then raise exception 'A conta selecionada não envia WhatsApp'; end if;
  if length(trim(coalesce(p_recipient,''))) < 3 or length(trim(coalesce(p_body,''))) < 1 then raise exception 'Destinatário ou mensagem inválidos'; end if;

  select id into v_event_id from public.communication_events where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  if v_event_id is not null then return v_event_id; end if;

  select id into v_thread_id from public.communication_threads
   where organization_id=p_organization_id and lead_id=p_lead_id and account_id=p_account_id and channel=p_channel and status='open'
   order by updated_at desc limit 1;
  if v_thread_id is null then
    insert into public.communication_threads(organization_id,lead_id,account_id,channel,subject,last_message_at)
    values(p_organization_id,p_lead_id,p_account_id,p_channel,left(coalesce(p_subject,''),300),now()) returning id into v_thread_id;
  end if;

  insert into public.communication_events(organization_id,thread_id,lead_id,account_id,channel,direction,event_type,status,idempotency_key,recipient_addresses,subject,body_text,metadata)
  values(p_organization_id,v_thread_id,p_lead_id,p_account_id,p_channel,'outbound',case when p_channel='email' then 'email' else 'message' end,'queued',left(p_idempotency_key,180),array[left(trim(p_recipient),320)],left(coalesce(p_subject,''),500),left(p_body,50000),jsonb_build_object('queued_by',auth.uid()))
  returning id into v_event_id;

  insert into public.communication_outbox(organization_id,event_id,account_id,lead_id,channel,idempotency_key,payload)
  values(p_organization_id,v_event_id,p_account_id,p_lead_id,p_channel,left(p_idempotency_key,180),jsonb_build_object('recipient',left(trim(p_recipient),320),'subject',left(coalesce(p_subject,''),500),'body',left(p_body,50000)));
  update public.communication_threads set last_message_at=now() where id=v_thread_id;
  return v_event_id;
end; $$;

create or replace function public.read_integration_oauth_token(p_account_id uuid,p_encryption_key text)
returns table(access_token text,refresh_token text,expires_at timestamptz,token_type text) language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if length(coalesce(p_encryption_key,'')) < 32 then raise exception 'Invalid encryption key'; end if;
  return query select pgp_sym_decrypt(v.access_token_encrypted,p_encryption_key),case when v.refresh_token_encrypted is null then '' else pgp_sym_decrypt(v.refresh_token_encrypted,p_encryption_key) end,v.expires_at,v.token_type from public.integration_token_vault v where v.account_id=p_account_id;
end; $$;

create or replace function public.upsert_inbound_communication(
  p_organization_id uuid,p_account_id uuid,p_channel text,p_external_message_id text,p_sender text,p_recipients text[],p_subject text,p_body text,p_occurred_at timestamptz,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lead_id uuid; v_thread_id uuid; v_event_id uuid; v_sender_digits text;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if p_channel not in ('email','whatsapp','calendar') then raise exception 'Canal inválido'; end if;
  if not exists(select 1 from public.integration_connected_accounts where id=p_account_id and organization_id=p_organization_id) then raise exception 'Conta inválida'; end if;
  if p_channel='email' then
    select id into v_lead_id from public.leads where organization_id=p_organization_id and lower(email)=lower(trim(p_sender)) order by updated_at desc limit 1;
  elsif p_channel='whatsapp' then
    v_sender_digits:=regexp_replace(coalesce(p_sender,''),'\\D','','g');
    select id into v_lead_id from public.leads where organization_id=p_organization_id and right(regexp_replace(coalesce(phone,''),'\\D','','g'),11)=right(v_sender_digits,11) order by updated_at desc limit 1;
  end if;
  select id into v_event_id from public.communication_events where organization_id=p_organization_id and channel=p_channel and external_message_id=p_external_message_id;
  if v_event_id is not null then return v_event_id; end if;
  select id into v_thread_id from public.communication_threads where organization_id=p_organization_id and account_id=p_account_id and channel=p_channel and ((v_lead_id is null and lead_id is null) or lead_id=v_lead_id) and status='open' order by updated_at desc limit 1;
  if v_thread_id is null then
    insert into public.communication_threads(organization_id,lead_id,account_id,channel,external_thread_id,subject,last_message_at)
    values(p_organization_id,v_lead_id,p_account_id,p_channel,null,left(coalesce(p_subject,''),300),coalesce(p_occurred_at,now())) returning id into v_thread_id;
  end if;
  insert into public.communication_events(organization_id,thread_id,lead_id,account_id,channel,direction,event_type,status,external_message_id,sender_address,recipient_addresses,subject,body_text,occurred_at,metadata)
  values(p_organization_id,v_thread_id,v_lead_id,p_account_id,p_channel,'inbound',case when p_channel='email' then 'email' when p_channel='calendar' then 'calendar_event' else 'message' end,'received',left(p_external_message_id,500),left(coalesce(p_sender,''),320),coalesce(p_recipients,'{}'),left(coalesce(p_subject,''),500),left(coalesce(p_body,''),50000),coalesce(p_occurred_at,now()),coalesce(p_metadata,'{}')) returning id into v_event_id;
  update public.communication_threads set last_message_at=coalesce(p_occurred_at,now()),lead_id=coalesce(lead_id,v_lead_id) where id=v_thread_id;
  return v_event_id;
end; $$;

revoke all on function public.enqueue_official_communication(uuid,uuid,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.read_integration_oauth_token(uuid,text) from public,anon,authenticated;
revoke all on function public.upsert_inbound_communication(uuid,uuid,text,text,text,text[],text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_official_communication(uuid,uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.read_integration_oauth_token(uuid,text) to service_role;
grant execute on function public.upsert_inbound_communication(uuid,uuid,text,text,text,text[],text,text,timestamptz,jsonb) to service_role;

comment on table public.communication_events is 'Timeline oficial e auditável de e-mail, WhatsApp e calendário por lead.';
comment on table public.communication_outbox is 'Caixa de saída idempotente processada no backend com novas tentativas.';
comment on table public.communication_subscriptions is 'Assinaturas de push/webhook e cursores incrementais dos provedores.';

commit;
