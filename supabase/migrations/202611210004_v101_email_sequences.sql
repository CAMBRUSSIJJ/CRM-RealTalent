-- RealTalent CRM V101 — sequências automáticas de e-mail.
-- Uma sequência é uma série de e-mails com intervalo em dias. O contato inscrito recebe cada passo
-- pela conta do vendedor que o inscreveu; a sequência para sozinha quando o contato responde,
-- quando é marcado para não receber contato ou quando sai do funil (ganho/perdido/arquivado).

begin;

create table if not exists public.email_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  shared boolean not null default true,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists email_sequences_created_by_idx on public.email_sequences(created_by);

create table if not exists public.email_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_id uuid not null references public.email_sequences(id) on delete cascade,
  position integer not null check (position between 1 and 20),
  delay_days integer not null default 0 check (delay_days between 0 and 60),
  subject text not null default '',
  body text not null check (length(trim(body)) > 0),
  unique (sequence_id, position)
);
create index if not exists email_sequence_steps_org_idx on public.email_sequence_steps(organization_id);

create table if not exists public.email_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_id uuid not null references public.email_sequences(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  account_id uuid not null references public.integration_connected_accounts(id) on delete cascade,
  enrolled_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'replied', 'stopped', 'failed')),
  track boolean not null default false,
  current_position integer not null default 0,
  next_run_at timestamptz,
  last_event_id uuid references public.communication_events(id) on delete set null,
  last_error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists email_sequence_enrollments_one_active on public.email_sequence_enrollments(sequence_id, lead_id) where status = 'active';
create index if not exists email_sequence_enrollments_due on public.email_sequence_enrollments(next_run_at) where status = 'active';
create index if not exists email_sequence_enrollments_lead_idx on public.email_sequence_enrollments(lead_id);
create index if not exists email_sequence_enrollments_org_idx on public.email_sequence_enrollments(organization_id);
create index if not exists email_sequence_enrollments_account_idx on public.email_sequence_enrollments(account_id);
create index if not exists email_sequence_enrollments_user_idx on public.email_sequence_enrollments(enrolled_by);
create index if not exists email_sequence_enrollments_event_idx on public.email_sequence_enrollments(last_event_id);

alter table public.email_sequences enable row level security;
alter table public.email_sequence_steps enable row level security;
alter table public.email_sequence_enrollments enable row level security;
revoke all on public.email_sequences, public.email_sequence_steps, public.email_sequence_enrollments from anon;

drop policy if exists email_sequences_select on public.email_sequences;
drop policy if exists email_sequences_insert on public.email_sequences;
drop policy if exists email_sequences_update on public.email_sequences;
drop policy if exists email_sequences_delete on public.email_sequences;
create policy email_sequences_select on public.email_sequences for select to authenticated
  using (public.is_organization_member(organization_id) and (shared or created_by = (select auth.uid())));
create policy email_sequences_insert on public.email_sequences for insert to authenticated
  with check (public.is_organization_member(organization_id) and created_by = (select auth.uid()));
create policy email_sequences_update on public.email_sequences for update to authenticated
  using (public.is_organization_member(organization_id) and (created_by = (select auth.uid()) or public.is_organization_admin(organization_id)))
  with check (public.is_organization_member(organization_id) and (created_by = (select auth.uid()) or public.is_organization_admin(organization_id)));
create policy email_sequences_delete on public.email_sequences for delete to authenticated
  using (public.is_organization_member(organization_id) and (created_by = (select auth.uid()) or public.is_organization_admin(organization_id)));

-- Passos seguem a permissão da sequência a que pertencem.
drop policy if exists email_sequence_steps_select on public.email_sequence_steps;
drop policy if exists email_sequence_steps_write on public.email_sequence_steps;
create policy email_sequence_steps_select on public.email_sequence_steps for select to authenticated
  using (exists (select 1 from public.email_sequences s where s.id = email_sequence_steps.sequence_id));
create policy email_sequence_steps_write on public.email_sequence_steps for all to authenticated
  using (exists (select 1 from public.email_sequences s where s.id = email_sequence_steps.sequence_id and s.organization_id = email_sequence_steps.organization_id
                  and (s.created_by = (select auth.uid()) or public.is_organization_admin(s.organization_id))))
  with check (exists (select 1 from public.email_sequences s where s.id = email_sequence_steps.sequence_id and s.organization_id = email_sequence_steps.organization_id
                  and (s.created_by = (select auth.uid()) or public.is_organization_admin(s.organization_id))));

-- Inscrições: visíveis para membros; criadas e paradas só pelas funções abaixo.
drop policy if exists email_sequence_enrollments_select on public.email_sequence_enrollments;
create policy email_sequence_enrollments_select on public.email_sequence_enrollments for select to authenticated
  using (public.is_organization_member(organization_id));

-- Troca {{variáveis}} pelos dados do contato e de quem inscreveu (mesmas variáveis dos modelos).
create or replace function public.render_email_template(p_text text, p_lead_id uuid, p_user_id uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lead public.leads; v_stage text; v_seller text; v_seller_email text; v_out text := coalesce(p_text, '');
begin
  select * into v_lead from public.leads where id = p_lead_id;
  select name into v_stage from public.pipeline_stages where id = v_lead.stage_id;
  select display_name, email into v_seller, v_seller_email from public.profiles where id = p_user_id;
  v_out := regexp_replace(v_out, '\{\{\s*primeiro_nome\s*\}\}', coalesce(split_part(trim(coalesce(v_lead.name, '')), ' ', 1), ''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*nome\s*\}\}', coalesce(trim(v_lead.name), ''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*empresa\s*\}\}', coalesce(trim(v_lead.company), ''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*cargo\s*\}\}', coalesce(trim(v_lead.job_title), ''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*cidade\s*\}\}', coalesce(trim(v_lead.city), ''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*etapa\s*\}\}', coalesce(v_stage, ''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*vendedor\s*\}\}', coalesce(v_seller, ''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*meu_email\s*\}\}', coalesce(v_seller_email, ''), 'gi');
  return regexp_replace(v_out, '[ \t]+([,.!?;:])', '\1', 'g');
end; $$;
revoke all on function public.render_email_template(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.enroll_lead_in_email_sequence(p_sequence_id uuid, p_lead_id uuid, p_account_id uuid, p_track boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sequence public.email_sequences; v_lead public.leads; v_first_delay integer; v_id uuid;
begin
  select * into v_sequence from public.email_sequences where id = p_sequence_id and active;
  if v_sequence.id is null or auth.uid() is null or not public.is_organization_member(v_sequence.organization_id) then raise exception 'Sequência não encontrada'; end if;
  if not v_sequence.shared and v_sequence.created_by <> auth.uid() then raise exception 'Sequência não encontrada'; end if;
  select * into v_lead from public.leads where id = p_lead_id and organization_id = v_sequence.organization_id;
  if v_lead.id is null then raise exception 'Contato não encontrado'; end if;
  if coalesce(v_lead.do_not_contact, false) then raise exception 'Este contato está marcado para não receber contato'; end if;
  if position('@' in coalesce(v_lead.email, '')) = 0 then raise exception 'O contato não tem e-mail cadastrado'; end if;
  if not exists (select 1 from public.integration_connected_accounts a where a.id = p_account_id and a.organization_id = v_sequence.organization_id
                  and a.status = 'connected' and a.has_credential and a.provider in ('google', 'microsoft'))
     or not public.can_use_integration_account(p_account_id) then raise exception 'Conta de e-mail indisponível para você'; end if;
  select delay_days into v_first_delay from public.email_sequence_steps where sequence_id = p_sequence_id order by position limit 1;
  if v_first_delay is null then raise exception 'A sequência não tem passos'; end if;
  if exists (select 1 from public.email_sequence_enrollments where sequence_id = p_sequence_id and lead_id = p_lead_id and status = 'active') then
    raise exception 'Este contato já está nesta sequência';
  end if;
  insert into public.email_sequence_enrollments(organization_id, sequence_id, lead_id, account_id, enrolled_by, track, next_run_at)
  values (v_sequence.organization_id, p_sequence_id, p_lead_id, p_account_id, auth.uid(), coalesce(p_track, false), now() + make_interval(days => v_first_delay))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.enroll_lead_in_email_sequence(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.enroll_lead_in_email_sequence(uuid, uuid, uuid, boolean) to authenticated;

create or replace function public.stop_email_sequence_enrollment(p_enrollment_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.email_sequence_enrollments;
begin
  select * into v_row from public.email_sequence_enrollments where id = p_enrollment_id;
  if v_row.id is null or auth.uid() is null then raise exception 'Inscrição não encontrada'; end if;
  if v_row.enrolled_by <> auth.uid() and not public.is_organization_admin(v_row.organization_id) then raise exception 'Somente quem inscreveu pode parar'; end if;
  update public.email_sequence_enrollments set status = 'stopped', next_run_at = null, finished_at = now() where id = p_enrollment_id and status = 'active';
  return found;
end; $$;
revoke all on function public.stop_email_sequence_enrollment(uuid) from public, anon;
grant execute on function public.stop_email_sequence_enrollment(uuid) to authenticated;

-- Resposta do contato para a sequência na hora.
create or replace function public.trg_stop_sequences_on_reply()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.channel = 'email' and new.direction = 'inbound' and new.lead_id is not null then
    update public.email_sequence_enrollments set status = 'replied', next_run_at = null, finished_at = now()
     where lead_id = new.lead_id and status = 'active' and new.occurred_at >= started_at;
  end if;
  return new;
end; $$;
revoke all on function public.trg_stop_sequences_on_reply() from public, anon, authenticated;
drop trigger if exists communication_events_stop_sequences on public.communication_events;
create trigger communication_events_stop_sequences after insert or update of lead_id on public.communication_events
  for each row execute function public.trg_stop_sequences_on_reply();

-- Executado pelo pg_cron: envia os passos vencidos.
create or replace function public.run_email_sequences(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.email_sequence_enrollments; v_lead public.leads; v_step public.email_sequence_steps; v_first public.email_sequence_steps;
  v_next_delay integer; v_subject text; v_body text; v_thread uuid; v_event uuid; v_key text; v_sent integer := 0;
begin
  for v_row in
    select * from public.email_sequence_enrollments where status = 'active' and next_run_at <= now()
     order by next_run_at limit greatest(1, least(p_limit, 200)) for update skip locked
  loop
    if not exists (select 1 from public.email_sequences q where q.id = v_row.sequence_id and q.active) then
      update public.email_sequence_enrollments set status = 'stopped', next_run_at = null, finished_at = now(), last_error = 'Sequência excluída' where id = v_row.id;
      continue;
    end if;
    select * into v_lead from public.leads where id = v_row.lead_id;
    if v_lead.id is null or coalesce(v_lead.do_not_contact, false) or v_lead.status in ('won', 'lost', 'archived') then
      update public.email_sequence_enrollments set status = 'stopped', next_run_at = null, finished_at = now(), last_error = 'Contato fora do funil ou bloqueado para contato' where id = v_row.id;
      continue;
    end if;
    if exists (select 1 from public.communication_events e where e.lead_id = v_row.lead_id and e.channel = 'email' and e.direction = 'inbound' and e.occurred_at >= v_row.started_at) then
      update public.email_sequence_enrollments set status = 'replied', next_run_at = null, finished_at = now() where id = v_row.id;
      continue;
    end if;
    if not exists (select 1 from public.integration_connected_accounts a where a.id = v_row.account_id and a.status = 'connected' and a.has_credential) then
      update public.email_sequence_enrollments set status = 'failed', next_run_at = null, finished_at = now(), last_error = 'A conta de e-mail foi desconectada' where id = v_row.id;
      continue;
    end if;
    select * into v_step from public.email_sequence_steps where sequence_id = v_row.sequence_id and position > v_row.current_position order by position limit 1;
    if v_step.id is null then
      update public.email_sequence_enrollments set status = 'completed', next_run_at = null, finished_at = now() where id = v_row.id;
      continue;
    end if;
    select * into v_first from public.email_sequence_steps where sequence_id = v_row.sequence_id order by position limit 1;
    v_subject := nullif(trim(public.render_email_template(v_step.subject, v_lead.id, v_row.enrolled_by)), '');
    if v_subject is null then v_subject := 'Re: ' || public.render_email_template(v_first.subject, v_lead.id, v_row.enrolled_by); end if;
    v_body := public.render_email_template(v_step.body, v_lead.id, v_row.enrolled_by);
    v_key := 'seq:' || v_row.id || ':' || v_step.position;

    select id into v_thread from public.communication_threads
     where organization_id = v_row.organization_id and lead_id = v_lead.id and account_id = v_row.account_id and channel = 'email' and status = 'open'
     order by updated_at desc limit 1;
    if v_thread is null then
      insert into public.communication_threads(organization_id, lead_id, account_id, channel, subject, last_message_at)
      values (v_row.organization_id, v_lead.id, v_row.account_id, 'email', left(v_subject, 300), now()) returning id into v_thread;
    end if;
    insert into public.communication_events(organization_id, thread_id, lead_id, account_id, channel, direction, event_type, status, idempotency_key, recipient_addresses, subject, body_text, metadata)
    values (v_row.organization_id, v_thread, v_lead.id, v_row.account_id, 'email', 'outbound', 'email', 'queued', v_key, array[left(trim(v_lead.email), 320)], left(v_subject, 500), left(v_body, 50000),
            jsonb_build_object('queued_by', v_row.enrolled_by, 'sequence_id', v_row.sequence_id, 'enrollment_id', v_row.id, 'sequence_step', v_step.position, 'tracking', v_row.track))
    on conflict do nothing
    returning id into v_event;
    if v_event is not null then
      insert into public.communication_outbox(organization_id, event_id, account_id, lead_id, channel, idempotency_key, payload)
      values (v_row.organization_id, v_event, v_row.account_id, v_lead.id, 'email', v_key,
              jsonb_build_object('recipient', left(trim(v_lead.email), 320), 'cc', '{}'::text[], 'bcc', '{}'::text[], 'subject', left(v_subject, 500), 'body', left(v_body, 50000), 'bodyHtml', '', 'attachments', '[]'::jsonb, 'queued_by', v_row.enrolled_by, 'track', v_row.track))
      on conflict do nothing;
      v_sent := v_sent + 1;
    end if;
    select delay_days into v_next_delay from public.email_sequence_steps where sequence_id = v_row.sequence_id and position > v_step.position order by position limit 1;
    update public.email_sequence_enrollments
       set current_position = v_step.position, last_event_id = coalesce(v_event, last_event_id), last_error = null,
           status = case when v_next_delay is null then 'completed' else 'active' end,
           next_run_at = case when v_next_delay is null then null else now() + make_interval(days => v_next_delay) end,
           finished_at = case when v_next_delay is null then now() else null end
     where id = v_row.id;
  end loop;
  return v_sent;
end; $$;
revoke all on function public.run_email_sequences(integer) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'realtalent-email-sequences';
  perform cron.schedule('realtalent-email-sequences', '*/5 * * * *', 'select public.run_email_sequences();');
end $$;

commit;
