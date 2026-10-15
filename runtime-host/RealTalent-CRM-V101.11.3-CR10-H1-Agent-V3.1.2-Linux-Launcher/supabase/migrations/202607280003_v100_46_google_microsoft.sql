-- RealTalent CRM V100.46 — Google e Microsoft
-- Gmail/Outlook/Calendários com sync incremental, subscriptions, defaults, conflitos e e-mail avançado.
begin;

alter table public.communication_events
  add column if not exists body_html text not null default '',
  add column if not exists internet_message_id text,
  add column if not exists reply_to_external_message_id text,
  add column if not exists has_attachments boolean not null default false;

alter table public.communication_subscriptions
  add column if not exists cursor_kind text,
  add column if not exists renew_after timestamptz,
  add column if not exists last_renewed_at timestamptz,
  add column if not exists notification_url text,
  add column if not exists lifecycle_notification_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.communication_subscriptions drop constraint if exists communication_subscriptions_cursor_kind_check;
alter table public.communication_subscriptions add constraint communication_subscriptions_cursor_kind_check
  check (cursor_kind is null or cursor_kind in ('gmail_history_id','google_sync_token','microsoft_delta_link'));

alter table public.calendar_external_links
  add column if not exists external_updated_at timestamptz,
  add column if not exists last_local_updated_at timestamptz,
  add column if not exists sync_fingerprint text,
  add column if not exists conflict_status text not null default 'clear';

alter table public.calendar_external_links drop constraint if exists calendar_external_links_conflict_status_check;
alter table public.calendar_external_links add constraint calendar_external_links_conflict_status_check
  check (conflict_status in ('clear','open','resolved_local','resolved_external','ignored'));

create table if not exists public.integration_account_defaults (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  capability text not null check (capability in ('email_send','mail_sync','calendar_sync','calendar_write')),
  account_id uuid not null references public.integration_connected_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists integration_account_defaults_user_unique
  on public.integration_account_defaults(organization_id,user_id,capability) where user_id is not null;
create unique index if not exists integration_account_defaults_org_unique
  on public.integration_account_defaults(organization_id,capability) where user_id is null;
create index if not exists integration_account_defaults_account_idx on public.integration_account_defaults(account_id);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'Geral',
  subject_template text not null default '',
  body_html_template text not null default '',
  body_text_template text not null default '',
  shared boolean not null default true,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name)
);
create index if not exists email_templates_org_active_idx on public.email_templates(organization_id,active,name);

create table if not exists public.communication_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.communication_events(id) on delete cascade,
  file_name text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes integer not null check (size_bytes between 0 and 10485760),
  storage_path text,
  content_id text,
  disposition text not null default 'attachment' check (disposition in ('attachment','inline')),
  provider_attachment_id text,
  created_at timestamptz not null default now()
);
create index if not exists communication_attachments_event_idx on public.communication_attachments(event_id);

create table if not exists public.integration_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.integration_connected_accounts(id) on delete cascade,
  resource_type text not null check (resource_type in ('google_calendar','outlook_calendar')),
  local_resource_id uuid references public.calendar_events(id) on delete cascade,
  external_resource_id text not null,
  conflict_type text not null check (conflict_type in ('both_updated','local_deleted_external_updated','external_deleted_local_updated')),
  local_snapshot jsonb not null default '{}'::jsonb,
  external_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  resolution text check (resolution is null or resolution in ('keep_local','keep_external','merged','ignore')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists integration_sync_conflicts_org_status_idx on public.integration_sync_conflicts(organization_id,status,created_at desc);
create unique index if not exists integration_sync_conflicts_open_unique on public.integration_sync_conflicts(account_id,resource_type,external_resource_id) where status='open';

alter table public.integration_account_defaults enable row level security;
alter table public.email_templates enable row level security;
alter table public.communication_attachments enable row level security;
alter table public.integration_sync_conflicts enable row level security;

drop policy if exists communication_subscriptions_select on public.communication_subscriptions;
create policy communication_subscriptions_select on public.communication_subscriptions for select to authenticated
  using (public.is_organization_member(organization_id));

update public.integration_connected_accounts
set capabilities=coalesce(capabilities,'{}'::jsonb)||jsonb_build_object('mail_sync',true,'calendar_sync',true)
where provider in ('google','microsoft');

create policy integration_account_defaults_select on public.integration_account_defaults for select to authenticated
  using (public.is_organization_member(organization_id));
create policy email_templates_select on public.email_templates for select to authenticated
  using (public.is_organization_member(organization_id));
create policy email_templates_write on public.email_templates for all to authenticated
  using (public.is_organization_member(organization_id) and (shared or created_by=auth.uid() or public.is_organization_admin(organization_id)))
  with check (public.is_organization_member(organization_id) and (shared or created_by=auth.uid() or public.is_organization_admin(organization_id)));
create policy communication_attachments_select on public.communication_attachments for select to authenticated
  using (public.is_organization_member(organization_id));
create policy integration_sync_conflicts_select on public.integration_sync_conflicts for select to authenticated
  using (public.is_organization_member(organization_id));

revoke insert,update,delete on public.integration_account_defaults from authenticated;
revoke insert,update,delete on public.communication_attachments from authenticated;
revoke insert,update,delete on public.integration_sync_conflicts from authenticated;

create trigger integration_account_defaults_touch before update on public.integration_account_defaults for each row execute function public.touch_updated_at();
create trigger email_templates_touch before update on public.email_templates for each row execute function public.touch_updated_at();
create trigger integration_sync_conflicts_touch before update on public.integration_sync_conflicts for each row execute function public.touch_updated_at();

create or replace function public.set_default_integration_account(
  p_organization_id uuid,p_capability text,p_account_id uuid,p_scope text default 'personal'
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account public.integration_connected_accounts; v_user_id uuid; v_id uuid;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_capability not in ('email_send','mail_sync','calendar_sync','calendar_write') then raise exception 'Capacidade inválida'; end if;
  if p_scope not in ('personal','organization') then raise exception 'Escopo inválido'; end if;
  if p_scope='organization' and not public.is_organization_admin(p_organization_id) then raise exception 'Somente administradores definem o padrão da organização'; end if;
  select * into v_account from public.integration_connected_accounts
   where id=p_account_id and organization_id=p_organization_id and provider in ('google','microsoft') and status='connected' and has_credential=true;
  if v_account.id is null or not public.can_use_integration_account(p_account_id) then raise exception 'Conta indisponível'; end if;
  if not coalesce((v_account.capabilities->>p_capability)::boolean,false) then raise exception 'A conta não oferece esta capacidade'; end if;
  v_user_id:=case when p_scope='personal' then auth.uid() else null end;
  if v_user_id is null then
    insert into public.integration_account_defaults(organization_id,user_id,capability,account_id)
    values(p_organization_id,null,p_capability,p_account_id)
    on conflict(organization_id,capability) where user_id is null do update set account_id=excluded.account_id,updated_at=now()
    returning id into v_id;
  else
    insert into public.integration_account_defaults(organization_id,user_id,capability,account_id)
    values(p_organization_id,v_user_id,p_capability,p_account_id)
    on conflict(organization_id,user_id,capability) where user_id is not null do update set account_id=excluded.account_id,updated_at=now()
    returning id into v_id;
  end if;
  insert into public.integration_audit_events(organization_id,account_id,provider,event_type,severity,actor_user_id,message,metadata)
  values(p_organization_id,p_account_id,v_account.provider,'default_account_changed','info',auth.uid(),'Conta padrão atualizada',jsonb_build_object('capability',p_capability,'scope',p_scope));
  return v_id;
end; $$;

create or replace function public.resolve_default_integration_account(p_organization_id uuid,p_capability text)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then return null; end if;
  select d.account_id into v_id from public.integration_account_defaults d
   join public.integration_connected_accounts a on a.id=d.account_id
   where d.organization_id=p_organization_id and d.user_id=auth.uid() and d.capability=p_capability
     and a.status='connected' and a.has_credential=true and public.can_use_integration_account(a.id)
   limit 1;
  if v_id is not null then return v_id; end if;
  select d.account_id into v_id from public.integration_account_defaults d
   join public.integration_connected_accounts a on a.id=d.account_id
   where d.organization_id=p_organization_id and d.user_id is null and d.capability=p_capability
     and a.status='connected' and a.has_credential=true and public.can_use_integration_account(a.id)
   limit 1;
  if v_id is not null then return v_id; end if;
  select a.id into v_id from public.integration_connected_accounts a
   where a.organization_id=p_organization_id and a.provider in ('google','microsoft') and a.status='connected' and a.has_credential=true
     and coalesce((a.capabilities->>p_capability)::boolean,false) and public.can_use_integration_account(a.id)
   order by a.last_sync_at desc nulls last,a.created_at limit 1;
  return v_id;
end; $$;

create or replace function public.enqueue_advanced_email(
  p_organization_id uuid,
  p_lead_id uuid,
  p_account_id uuid,
  p_recipient text,
  p_cc text[] default '{}',
  p_bcc text[] default '{}',
  p_subject text default '',
  p_body_text text default '',
  p_body_html text default '',
  p_reply_to_external_message_id text default null,
  p_template_id uuid default null,
  p_attachments jsonb default '[]'::jsonb,
  p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account_id uuid; v_account public.integration_connected_accounts; v_lead public.leads; v_thread_id uuid; v_event_id uuid; v_key text; v_attachment jsonb; v_total_size bigint:=0; v_size integer;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_lead from public.leads where id=p_lead_id and organization_id=p_organization_id;
  if v_lead.id is null then raise exception 'Lead não encontrado'; end if;
  if coalesce(v_lead.do_not_contact,false) then raise exception 'Este lead está bloqueado para contato'; end if;
  v_account_id:=coalesce(p_account_id,public.resolve_default_integration_account(p_organization_id,'email_send'));
  select * into v_account from public.integration_connected_accounts where id=v_account_id and organization_id=p_organization_id and provider in ('google','microsoft') and status='connected' and has_credential=true;
  if v_account.id is null or not public.can_use_integration_account(v_account_id) then raise exception 'Conta de e-mail indisponível para este usuário'; end if;
  if length(trim(coalesce(p_recipient,'')))<5 or position('@' in p_recipient)=0 then raise exception 'Destinatário inválido'; end if;
  if length(coalesce(p_body_text,''))=0 and length(coalesce(p_body_html,''))=0 then raise exception 'O e-mail precisa de conteúdo'; end if;
  if jsonb_typeof(coalesce(p_attachments,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_attachments,'[]'::jsonb))>10 then raise exception 'Anexos inválidos ou acima do limite de 10 arquivos'; end if;
  for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    v_size:=greatest(0,coalesce((v_attachment->>'sizeBytes')::integer,0));
    if v_size>5242880 then raise exception 'Cada anexo deve ter no máximo 5 MB'; end if;
    if length(coalesce(v_attachment->>'base64',''))>7340032 then raise exception 'Conteúdo do anexo acima do limite'; end if;
    v_total_size:=v_total_size+v_size;
  end loop;
  if v_total_size>10485760 then raise exception 'O total de anexos deve ter no máximo 10 MB'; end if;
  v_key:=left(coalesce(nullif(trim(p_idempotency_key),''),'email:'||p_lead_id||':'||extract(epoch from clock_timestamp())::bigint),180);
  select id into v_event_id from public.communication_events where organization_id=p_organization_id and idempotency_key=v_key;
  if v_event_id is not null then return v_event_id; end if;
  select id into v_thread_id from public.communication_threads where organization_id=p_organization_id and lead_id=p_lead_id and account_id=v_account_id and channel='email' and status='open' order by updated_at desc limit 1;
  if v_thread_id is null then
    insert into public.communication_threads(organization_id,lead_id,account_id,channel,subject,last_message_at)
    values(p_organization_id,p_lead_id,v_account_id,'email',left(coalesce(p_subject,''),300),now()) returning id into v_thread_id;
  end if;
  insert into public.communication_events(organization_id,thread_id,lead_id,account_id,channel,direction,event_type,status,idempotency_key,recipient_addresses,subject,body_text,body_html,reply_to_external_message_id,has_attachments,metadata)
  values(p_organization_id,v_thread_id,p_lead_id,v_account_id,'email','outbound','email','queued',v_key,
         array[left(trim(p_recipient),320)]||coalesce(p_cc,'{}')||coalesce(p_bcc,'{}'),left(coalesce(p_subject,''),500),left(coalesce(p_body_text,''),50000),left(coalesce(p_body_html,''),200000),p_reply_to_external_message_id,jsonb_array_length(coalesce(p_attachments,'[]'::jsonb))>0,
         jsonb_build_object('queued_by',auth.uid(),'account_access_mode',v_account.access_mode,'cc',coalesce(p_cc,'{}'),'bcc',coalesce(p_bcc,'{}'),'template_id',p_template_id))
  returning id into v_event_id;
  insert into public.communication_outbox(organization_id,event_id,account_id,lead_id,channel,idempotency_key,payload)
  values(p_organization_id,v_event_id,v_account_id,p_lead_id,'email',v_key,jsonb_build_object('recipient',left(trim(p_recipient),320),'cc',coalesce(p_cc,'{}'),'bcc',coalesce(p_bcc,'{}'),'subject',left(coalesce(p_subject,''),500),'body',left(coalesce(p_body_text,''),50000),'bodyHtml',left(coalesce(p_body_html,''),200000),'replyToExternalMessageId',p_reply_to_external_message_id,'templateId',p_template_id,'attachments',coalesce(p_attachments,'[]'::jsonb),'queued_by',auth.uid()));
  for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    insert into public.communication_attachments(organization_id,event_id,file_name,content_type,size_bytes,content_id,disposition)
    values(p_organization_id,v_event_id,left(coalesce(v_attachment->>'fileName','arquivo'),255),left(coalesce(v_attachment->>'contentType','application/octet-stream'),150),greatest(0,coalesce((v_attachment->>'sizeBytes')::integer,0)),nullif(left(coalesce(v_attachment->>'contentId',''),255),''),case when coalesce(v_attachment->>'disposition','attachment')='inline' then 'inline' else 'attachment' end);
  end loop;
  update public.communication_threads set last_message_at=now(),subject=coalesce(nullif(left(p_subject,300),''),subject) where id=v_thread_id;
  return v_event_id;
end; $$;

create or replace function public.resolve_integration_sync_conflict(
  p_conflict_id uuid,p_resolution text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_conflict public.integration_sync_conflicts;
begin
  select * into v_conflict from public.integration_sync_conflicts where id=p_conflict_id;
  if v_conflict.id is null or auth.uid() is null or not public.is_organization_member(v_conflict.organization_id) then raise exception 'Conflito não encontrado'; end if;
  if p_resolution not in ('keep_local','keep_external','merged','ignore') then raise exception 'Resolução inválida'; end if;
  update public.integration_sync_conflicts set status=case when p_resolution='ignore' then 'ignored' else 'resolved' end,resolution=p_resolution,resolved_by=auth.uid(),resolved_at=now() where id=p_conflict_id;
  update public.calendar_external_links set conflict_status=case p_resolution when 'keep_local' then 'resolved_local' when 'keep_external' then 'resolved_external' when 'ignore' then 'ignored' else 'clear' end where account_id=v_conflict.account_id and external_event_id=v_conflict.external_resource_id;
  if p_resolution='keep_local' and v_conflict.local_resource_id is not null then
    perform public.enqueue_integration_sync_job(v_conflict.organization_id,v_conflict.account_id,case v_conflict.resource_type when 'google_calendar' then 'google_calendar_push' else 'microsoft_calendar_push' end,'conflict:'||v_conflict.id||':local',jsonb_build_object('eventId',v_conflict.local_resource_id,'mutation','update','externalEventId',v_conflict.external_resource_id,'source','conflict_resolution'));
  elsif p_resolution='keep_external' and v_conflict.local_resource_id is not null then
    update public.calendar_events set
      title=left(coalesce(nullif(v_conflict.external_snapshot->>'summary',''),nullif(v_conflict.external_snapshot->>'subject',''),title),240),
      description=left(coalesce(v_conflict.external_snapshot#>>'{description}',v_conflict.external_snapshot#>>'{body,content}',v_conflict.external_snapshot->>'bodyPreview',description),10000),
      starts_at=coalesce(nullif(v_conflict.external_snapshot#>>'{start,dateTime}','')::timestamptz,nullif(v_conflict.external_snapshot#>>'{start,date}','')::date::timestamptz,starts_at),
      ends_at=coalesce(nullif(v_conflict.external_snapshot#>>'{end,dateTime}','')::timestamptz,nullif(v_conflict.external_snapshot#>>'{end,date}','')::date::timestamptz,ends_at),
      location=left(coalesce(v_conflict.external_snapshot#>>'{location,displayName}',v_conflict.external_snapshot->>'location',location),500),
      status=case when coalesce(v_conflict.external_snapshot->>'status','')='cancelled' or coalesce((v_conflict.external_snapshot->>'isCancelled')::boolean,false) then 'cancelled' else status end,
      updated_at=now()
    where id=v_conflict.local_resource_id and organization_id=v_conflict.organization_id;
  end if;
  return true;
end; $$;

revoke all on function public.set_default_integration_account(uuid,text,uuid,text) from public,anon;
revoke all on function public.resolve_default_integration_account(uuid,text) from public,anon;
revoke all on function public.enqueue_advanced_email(uuid,uuid,uuid,text,text[],text[],text,text,text,text,uuid,jsonb,text) from public,anon;
revoke all on function public.resolve_integration_sync_conflict(uuid,text) from public,anon;
grant execute on function public.set_default_integration_account(uuid,text,uuid,text) to authenticated;
grant execute on function public.resolve_default_integration_account(uuid,text) to authenticated;
grant execute on function public.enqueue_advanced_email(uuid,uuid,uuid,text,text[],text[],text,text,text,text,uuid,jsonb,text) to authenticated;
grant execute on function public.resolve_integration_sync_conflict(uuid,text) to authenticated;

comment on table public.integration_account_defaults is 'Conta Google/Microsoft padrão por usuário ou organização e capacidade.';
comment on table public.email_templates is 'Templates de e-mail HTML/texto com variáveis comerciais.';
comment on table public.integration_sync_conflicts is 'Conflitos detectados na sincronização bidirecional de calendários.';

commit;
