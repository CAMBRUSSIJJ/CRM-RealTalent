-- RealTalent CRM V101 — histórico da caixa recente no Gmail/Outlook.
--  1. E-mail que ainda não pertence a um contato só aparece para o dono da conta conectada
--     (nem administradores veem a caixa pessoal de um vendedor).
--  2. Quando um contato é criado ou recebe um e-mail, as conversas com aquele endereço passam a ser dele.
--  3. "Não é de trabalho": o vendedor ignora um remetente; o que já veio dele sai do CRM e não volta.

begin;

create table if not exists public.communication_ignored_senders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.integration_connected_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null check (length(address) between 3 and 320),
  created_at timestamptz not null default now(),
  unique (account_id, address)
);
create index if not exists communication_ignored_senders_org_idx on public.communication_ignored_senders(organization_id);
create index if not exists communication_ignored_senders_user_idx on public.communication_ignored_senders(user_id);
alter table public.communication_ignored_senders enable row level security;
drop policy if exists communication_ignored_senders_own on public.communication_ignored_senders;
create policy communication_ignored_senders_own on public.communication_ignored_senders
  for select to authenticated using (user_id = (select auth.uid()));

-- E-mail sem contato: visível só para quem conectou a conta.
create or replace function public.rt_communication_private_ok(p_organization_id uuid, p_lead_id uuid, p_account_id uuid, p_channel text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_lead_id is not null
      or coalesce(p_channel, '') <> 'email'
      or exists (select 1 from public.integration_connected_accounts a
                  where a.id = p_account_id and a.organization_id = p_organization_id
                    and a.connected_by_user_id = auth.uid())
$$;
revoke all on function public.rt_communication_private_ok(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.rt_communication_private_ok(uuid, uuid, uuid, text) to authenticated;

alter policy communication_events_select on public.communication_events using (
  public.rt_access_action_allowed(organization_id, 'communications', 'view')
  and public.rt_access_scope_allows(organization_id, 'communications', public.rt_communication_owner(organization_id, lead_id, account_id), null::uuid)
  and public.rt_communication_private_ok(organization_id, lead_id, account_id, channel)
);
alter policy communication_threads_select on public.communication_threads using (
  public.rt_access_action_allowed(organization_id, 'communications', 'view')
  and public.rt_access_scope_allows(organization_id, 'communications', public.rt_communication_owner(organization_id, lead_id, account_id), null::uuid)
  and public.rt_communication_private_ok(organization_id, lead_id, account_id, channel)
);
-- Anexos seguem a visibilidade do e-mail a que pertencem.
alter policy communication_attachments_select on public.communication_attachments using (
  exists (select 1 from public.communication_events e where e.id = communication_attachments.event_id)
);

-- Liga ao contato as conversas de e-mail sem contato trocadas com o endereço dele.
create or replace function public.link_email_history_to_lead(p_lead_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lead public.leads; v_email text; v_account record; v_thread uuid; v_count integer := 0; v_rows integer;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  v_email := lower(trim(coalesce(v_lead.email, '')));
  if v_lead.id is null or position('@' in v_email) = 0 then return 0; end if;
  for v_account in
    select distinct e.account_id from public.communication_events e
     where e.organization_id = v_lead.organization_id and e.lead_id is null and e.channel = 'email'
       and (lower(e.sender_address) = v_email or v_email = any (select lower(x) from unnest(e.recipient_addresses) x))
  loop
    select id into v_thread from public.communication_threads
     where organization_id = v_lead.organization_id and lead_id = v_lead.id and account_id is not distinct from v_account.account_id
       and channel = 'email' and status = 'open' order by updated_at desc limit 1;
    if v_thread is null then
      insert into public.communication_threads(organization_id, lead_id, account_id, channel, subject, last_message_at)
      values (v_lead.organization_id, v_lead.id, v_account.account_id, 'email', '', now()) returning id into v_thread;
    end if;
    update public.communication_events e set lead_id = v_lead.id, thread_id = v_thread
     where e.organization_id = v_lead.organization_id and e.lead_id is null and e.channel = 'email'
       and e.account_id is not distinct from v_account.account_id
       and (lower(e.sender_address) = v_email or v_email = any (select lower(x) from unnest(e.recipient_addresses) x));
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
    update public.communication_threads t set last_message_at = coalesce((select max(occurred_at) from public.communication_events where thread_id = v_thread), now())
     where t.id = v_thread;
  end loop;
  return v_count;
end; $$;
revoke all on function public.link_email_history_to_lead(uuid) from public, anon, authenticated;

create or replace function public.trg_leads_link_email_history()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.email, '') <> '' and (tg_op = 'INSERT' or lower(coalesce(old.email, '')) <> lower(new.email)) then
    perform public.link_email_history_to_lead(new.id);
  end if;
  return new;
end; $$;
revoke all on function public.trg_leads_link_email_history() from public, anon, authenticated;
drop trigger if exists leads_link_email_history on public.leads;
create trigger leads_link_email_history after insert or update of email on public.leads
  for each row execute function public.trg_leads_link_email_history();

-- "Não é de trabalho": só o dono da conta; remove do CRM o que veio desse endereço e ainda não é de contato.
create or replace function public.ignore_email_sender(p_account_id uuid, p_address text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account public.integration_connected_accounts; v_address text := lower(trim(coalesce(p_address, ''))); v_count integer;
begin
  select * into v_account from public.integration_connected_accounts where id = p_account_id;
  if v_account.id is null or auth.uid() is null or v_account.connected_by_user_id <> auth.uid() then raise exception 'Somente o dono da conta pode ignorar remetentes'; end if;
  if position('@' in v_address) = 0 then raise exception 'Endereço inválido'; end if;
  insert into public.communication_ignored_senders(organization_id, account_id, user_id, address)
  values (v_account.organization_id, v_account.id, auth.uid(), v_address)
  on conflict (account_id, address) do nothing;
  delete from public.communication_events e
   where e.account_id = v_account.id and e.lead_id is null and e.channel = 'email'
     and (lower(e.sender_address) = v_address or v_address = any (select lower(x) from unnest(e.recipient_addresses) x));
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function public.ignore_email_sender(uuid, text) from public, anon;
grant execute on function public.ignore_email_sender(uuid, text) to authenticated;

commit;
