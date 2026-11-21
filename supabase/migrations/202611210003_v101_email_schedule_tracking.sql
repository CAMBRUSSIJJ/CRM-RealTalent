-- RealTalent CRM V101 — e-mail agendado (cancelar antes de sair) e rastreio de abertura/cliques.

begin;

-- Cancela um e-mail agendado que ainda não saiu. Só quem colocou na fila (ou admin).
create or replace function public.cancel_scheduled_email(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_event public.communication_events; v_rows integer;
begin
  select * into v_event from public.communication_events where id = p_event_id;
  if v_event.id is null or auth.uid() is null then raise exception 'E-mail não encontrado'; end if;
  if coalesce(v_event.metadata ->> 'queued_by', '') <> auth.uid()::text and not public.is_organization_admin(v_event.organization_id) then
    raise exception 'Somente quem agendou pode cancelar';
  end if;
  if v_event.status <> 'queued' then raise exception 'Este e-mail já foi enviado ou não está mais na fila'; end if;
  update public.communication_outbox set status = 'cancelled', locked_at = null, last_error = 'Agendamento cancelado'
   where event_id = p_event_id and status in ('queued', 'retry');
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Este e-mail já foi enviado ou não está mais na fila'; end if;
  update public.communication_events set status = 'cancelled',
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelled_at', now(), 'cancelled_by', auth.uid())
   where id = p_event_id;
  return true;
end; $$;
revoke all on function public.cancel_scheduled_email(uuid) from public, anon;
grant execute on function public.cancel_scheduled_email(uuid) to authenticated;

create table if not exists public.communication_email_tracking (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.communication_events(id) on delete cascade,
  kind text not null check (kind in ('open', 'click')),
  url text,
  user_agent text,
  occurred_at timestamptz not null default now()
);
create index if not exists communication_email_tracking_event_idx on public.communication_email_tracking(event_id, occurred_at desc);
create index if not exists communication_email_tracking_org_idx on public.communication_email_tracking(organization_id);
alter table public.communication_email_tracking enable row level security;
drop policy if exists communication_email_tracking_select on public.communication_email_tracking;
create policy communication_email_tracking_select on public.communication_email_tracking for select to authenticated
  using (exists (select 1 from public.communication_events e where e.id = communication_email_tracking.event_id));
revoke all on public.communication_email_tracking from anon;

-- Registra abertura/clique e resume no próprio e-mail (contagem e primeira/última vez).
-- Aberturas no primeiro minuto após o envio são descartadas: costumam ser o próprio Gmail
-- buscando as imagens da cópia em "Enviados", não o destinatário.
create or replace function public.record_email_tracking(p_event_id uuid, p_kind text, p_url text default null, p_user_agent text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_event public.communication_events; v_sent_at timestamptz; v_now timestamptz := now(); v_meta jsonb;
begin
  if current_user not in ('service_role', 'postgres') and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_event from public.communication_events where id = p_event_id and channel = 'email' and direction = 'outbound';
  if v_event.id is null or v_event.status not in ('sent', 'delivered', 'read') then return false; end if;
  v_sent_at := coalesce((v_event.metadata ->> 'sent_at')::timestamptz, v_event.occurred_at);
  if p_kind = 'open' and v_now < v_sent_at + interval '60 seconds' then return false; end if;
  insert into public.communication_email_tracking(organization_id, event_id, kind, url, user_agent)
  values (v_event.organization_id, v_event.id, p_kind, left(p_url, 2000), left(p_user_agent, 300));
  v_meta := coalesce(v_event.metadata, '{}'::jsonb);
  if p_kind = 'open' then
    v_meta := v_meta || jsonb_build_object('open_count', coalesce((v_meta ->> 'open_count')::int, 0) + 1,
      'first_opened_at', coalesce(v_meta ->> 'first_opened_at', v_now::text), 'last_opened_at', v_now);
  else
    v_meta := v_meta || jsonb_build_object('click_count', coalesce((v_meta ->> 'click_count')::int, 0) + 1,
      'first_clicked_at', coalesce(v_meta ->> 'first_clicked_at', v_now::text), 'last_clicked_at', v_now, 'last_clicked_url', left(p_url, 500),
      -- clicar implica ter aberto, mesmo com imagens bloqueadas
      'first_opened_at', coalesce(v_meta ->> 'first_opened_at', v_now::text));
  end if;
  update public.communication_events set metadata = v_meta where id = v_event.id;
  return true;
end; $$;
revoke all on function public.record_email_tracking(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_email_tracking(uuid, text, text, text) to service_role;

commit;
