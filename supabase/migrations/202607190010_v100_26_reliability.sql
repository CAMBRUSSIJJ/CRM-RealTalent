-- RealTalent CRM V100.26 — integridade, consentimento, idempotência e segurança operacional.
begin;

alter table public.leads
  add column if not exists cnpj text not null default '',
  add column if not exists instagram text not null default '',
  add column if not exists last_contact_at timestamptz;

create index if not exists leads_org_phone_normalized_idx
  on public.leads (organization_id, (regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g')))
  where phone <> '';
create index if not exists leads_org_email_normalized_idx
  on public.leads (organization_id, (lower(trim(email)))) where email <> '';
create index if not exists leads_org_cnpj_idx on public.leads (organization_id, cnpj) where cnpj <> '';
create index if not exists leads_org_instagram_idx on public.leads (organization_id, (lower(trim(instagram)))) where instagram <> '';
create index if not exists leads_org_last_contact_idx on public.leads (organization_id, last_contact_at);

alter table public.calls
  add column if not exists consent_text text,
  add column if not exists consent_by uuid references auth.users(id) on delete set null;

update public.calls
set consent_text = coalesce(consent_text, 'O participante foi informado e consentiu com a gravação.'),
    consent_by = coalesce(consent_by, user_id)
where recording_path is not null and consent_at is not null;

alter table public.calls drop constraint if exists calls_recording_requires_consent;
alter table public.calls add constraint calls_recording_requires_consent check (
  recording_path is null or (
    consent_at is not null and
    nullif(trim(coalesce(consent_text, '')), '') is not null
  )
);

create or replace function public.touch_lead_last_contact_from_call()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.leads
     set last_contact_at = greatest(coalesce(last_contact_at, '-infinity'::timestamptz), coalesce(new.ended_at, new.started_at, new.created_at))
   where id = new.lead_id and organization_id = new.organization_id;
  return new;
end;
$$;

drop trigger if exists calls_touch_lead_last_contact on public.calls;
create trigger calls_touch_lead_last_contact after insert or update of ended_at on public.calls
for each row execute function public.touch_lead_last_contact_from_call();

create or replace function public.touch_lead_last_contact_from_activity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.lead_id is not null and new.completed_at is not null and new.activity_type in ('call','followup','meeting') then
    update public.leads
       set last_contact_at = greatest(coalesce(last_contact_at, '-infinity'::timestamptz), new.completed_at)
     where id = new.lead_id and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_touch_lead_last_contact on public.activities;
create trigger activities_touch_lead_last_contact after insert or update of completed_at on public.activities
for each row execute function public.touch_lead_last_contact_from_activity();

update public.leads l
set last_contact_at = greatest(
  coalesce(l.last_contact_at, '-infinity'::timestamptz),
  coalesce((select max(coalesce(c.ended_at,c.started_at,c.created_at)) from public.calls c where c.lead_id=l.id), '-infinity'::timestamptz),
  coalesce((select max(a.completed_at) from public.activities a where a.lead_id=l.id and a.activity_type in ('call','followup','meeting')), '-infinity'::timestamptz)
)
where exists (select 1 from public.calls c where c.lead_id=l.id)
   or exists (select 1 from public.activities a where a.lead_id=l.id and a.completed_at is not null and a.activity_type in ('call','followup','meeting'));

create table if not exists public.extension_rate_limits (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  primary key (organization_id, window_started_at)
);
alter table public.extension_rate_limits enable row level security;
revoke all on table public.extension_rate_limits from public, anon, authenticated;

create or replace function public.consume_extension_rate_limit(p_organization_id uuid, p_limit integer default 60)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  insert into public.extension_rate_limits(organization_id, window_started_at, request_count)
  values (p_organization_id, v_window, 1)
  on conflict (organization_id, window_started_at)
  do update set request_count = public.extension_rate_limits.request_count + 1
  returning request_count into v_count;
  delete from public.extension_rate_limits where window_started_at < now() - interval '2 days';
  return v_count <= greatest(1, least(coalesce(p_limit,60), 600));
end;
$$;
revoke all on function public.consume_extension_rate_limit(uuid,integer) from public, anon, authenticated;
grant execute on function public.consume_extension_rate_limit(uuid,integer) to service_role;

create or replace function public.find_extension_duplicate_lead(
  p_organization_id uuid, p_phone text, p_email text, p_cnpj text, p_instagram text
) returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.leads
  where organization_id = p_organization_id and (
    (length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 10 and regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) or
    (nullif(lower(trim(coalesce(p_email,''))), '') is not null and lower(trim(email)) = lower(trim(p_email))) or
    (nullif(regexp_replace(coalesce(p_cnpj,''), '[^0-9]', '', 'g'), '') is not null and cnpj = regexp_replace(coalesce(p_cnpj,''), '[^0-9]', '', 'g')) or
    (nullif(lower(trim(coalesce(p_instagram,''))), '') is not null and lower(trim(instagram)) = lower(trim(p_instagram)))
  ) order by updated_at desc limit 1;
$$;
revoke all on function public.find_extension_duplicate_lead(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.find_extension_duplicate_lead(uuid,text,text,text,text) to service_role;

create or replace function public.find_extension_duplicate_prospect(
  p_organization_id uuid, p_phone text, p_email text, p_cnpj text, p_instagram text
) returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.prospecting_leads
  where organization_id = p_organization_id and (
    (length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 10 and regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) or
    (nullif(lower(trim(coalesce(p_email,''))), '') is not null and lower(trim(email)) = lower(trim(p_email))) or
    (nullif(regexp_replace(coalesce(p_cnpj,''), '[^0-9]', '', 'g'), '') is not null and regexp_replace(coalesce(cnpj,''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_cnpj,''), '[^0-9]', '', 'g')) or
    (nullif(lower(trim(coalesce(p_instagram,''))), '') is not null and lower(trim(instagram)) = lower(trim(p_instagram)))
  ) order by updated_at desc limit 1;
$$;
revoke all on function public.find_extension_duplicate_prospect(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.find_extension_duplicate_prospect(uuid,text,text,text,text) to service_role;

create or replace function public.move_lead_with_reason(p_lead_id uuid, p_stage_id uuid, p_loss_reason text default null)
returns public.leads language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lead public.leads;
  v_stage public.pipeline_stages;
  v_note text;
begin
  select * into v_lead from public.leads where id=p_lead_id for update;
  if v_lead.id is null or auth.uid() is null or not public.can_write_organization(v_lead.organization_id) then
    raise exception 'Lead não encontrado ou sem permissão de escrita';
  end if;
  select * into v_stage from public.pipeline_stages where id=p_stage_id and organization_id=v_lead.organization_id;
  if v_stage.id is null then raise exception 'Etapa inválida para este workspace'; end if;
  if v_stage.is_lost then
    v_note := '[Motivo da perda] ' || coalesce(nullif(trim(p_loss_reason),''), 'Não informado');
  end if;
  update public.leads
     set stage_id=v_stage.id,
         status=case when v_stage.is_won then 'won'::public.lead_status when v_stage.is_lost then 'lost'::public.lead_status else 'active'::public.lead_status end,
         notes=case when v_note is null then notes else trim(concat_ws(E'\n', nullif(notes,''), v_note)) end
   where id=p_lead_id returning * into v_lead;
  insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,source_type,source_id)
  values(v_lead.organization_id,v_lead.id,'stage_change','Lead movido para '||v_stage.name,coalesce(v_note,''),now(),'system',v_lead.id::text);
  return v_lead;
end;
$$;
revoke all on function public.move_lead_with_reason(uuid,uuid,text) from public, anon;
grant execute on function public.move_lead_with_reason(uuid,uuid,text) to authenticated;

create or replace function public.bulk_move_leads_with_reason(
  p_organization_id uuid, p_lead_ids uuid[], p_stage_id uuid, p_loss_reason text default null
) returns setof public.leads language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_stage public.pipeline_stages;
  v_expected integer;
  v_found integer;
  v_note text;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then
    raise exception 'Sem permissão de escrita';
  end if;
  select * into v_stage from public.pipeline_stages where id=p_stage_id and organization_id=p_organization_id;
  if v_stage.id is null then raise exception 'Etapa inválida para este workspace'; end if;
  select count(distinct id) into v_expected from unnest(coalesce(p_lead_ids, array[]::uuid[])) as ids(id);
  if v_expected = 0 then return; end if;
  select count(*) into v_found from public.leads where organization_id=p_organization_id and id=any(p_lead_ids);
  if v_found <> v_expected then raise exception 'Um ou mais leads não pertencem a este workspace'; end if;
  if v_stage.is_lost then
    v_note := '[Motivo da perda] ' || coalesce(nullif(trim(p_loss_reason),''), 'Não informado');
  end if;

  update public.leads
     set stage_id=v_stage.id,
         status=case when v_stage.is_won then 'won'::public.lead_status when v_stage.is_lost then 'lost'::public.lead_status else 'active'::public.lead_status end,
         notes=case when v_note is null then notes else trim(concat_ws(E'\n', nullif(notes,''), v_note)) end
   where organization_id=p_organization_id and id=any(p_lead_ids);

  insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,source_type,source_id)
  select p_organization_id,l.id,'stage_change','Lead movido para '||v_stage.name,coalesce(v_note,''),v_now,'system',l.id::text
    from public.leads l where l.organization_id=p_organization_id and l.id=any(p_lead_ids);

  return query select l.* from public.leads l where l.organization_id=p_organization_id and l.id=any(p_lead_ids);
end;
$$;
revoke all on function public.bulk_move_leads_with_reason(uuid,uuid[],uuid,text) from public, anon;
grant execute on function public.bulk_move_leads_with_reason(uuid,uuid[],uuid,text) to authenticated;

create or replace function public.bulk_add_lead_tag(p_organization_id uuid, p_lead_ids uuid[], p_tag text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tag text := left(trim(coalesce(p_tag,'')),40);
  v_count integer;
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then raise exception 'Sem permissão de escrita'; end if;
  if v_tag = '' then raise exception 'Tag inválida'; end if;
  update public.leads l
     set tags = case when exists (select 1 from unnest(coalesce(l.tags,array[]::text[])) t where lower(trim(t))=lower(v_tag))
                     then l.tags else array_append(coalesce(l.tags,array[]::text[]),v_tag) end
   where l.organization_id=p_organization_id and l.id=any(p_lead_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.bulk_add_lead_tag(uuid,uuid[],text) from public, anon;
grant execute on function public.bulk_add_lead_tag(uuid,uuid[],text) to authenticated;

-- Regras antigas ou corrompidas nunca entram em modo real automaticamente.
update public.automation_rules
set enabled=false
where enabled=true and not exists (
  select 1 from jsonb_array_elements(coalesce(conditions,'[]'::jsonb)) item
  where item->>'field'='automation_guard'
);

drop policy if exists automation_events_select on public.automation_events;
create policy automation_events_select on public.automation_events for select to authenticated
  using (public.is_organization_admin(organization_id));

drop policy if exists seller_notifications_insert on public.seller_notifications;
create policy seller_notifications_insert on public.seller_notifications for insert to authenticated
  with check (public.is_organization_member(organization_id) and (public.is_organization_admin(organization_id) or user_id = auth.uid()));
drop policy if exists seller_notifications_update on public.seller_notifications;
create policy seller_notifications_update on public.seller_notifications for update to authenticated
  using (public.is_organization_member(organization_id) and (public.is_organization_admin(organization_id) or user_id = auth.uid()))
  with check (public.is_organization_member(organization_id) and (public.is_organization_admin(organization_id) or user_id = auth.uid()));

drop policy if exists contact_drafts_select on public.contact_drafts;
create policy contact_drafts_select on public.contact_drafts for select to authenticated
  using (public.is_organization_member(organization_id) and (public.is_organization_admin(organization_id) or exists (
    select 1 from public.leads l where l.id=contact_drafts.lead_id and l.organization_id=contact_drafts.organization_id and l.owner_id=auth.uid()
  )));

drop policy if exists contact_drafts_insert on public.contact_drafts;
create policy contact_drafts_insert on public.contact_drafts for insert to authenticated
  with check (public.is_organization_member(organization_id) and (public.is_organization_admin(organization_id) or exists (
    select 1 from public.leads l where l.id=contact_drafts.lead_id and l.organization_id=contact_drafts.organization_id and l.owner_id=auth.uid()
  )));
drop policy if exists contact_drafts_update on public.contact_drafts;
create policy contact_drafts_update on public.contact_drafts for update to authenticated
  using (public.is_organization_member(organization_id) and (public.is_organization_admin(organization_id) or exists (
    select 1 from public.leads l where l.id=contact_drafts.lead_id and l.organization_id=contact_drafts.organization_id and l.owner_id=auth.uid()
  )))
  with check (public.is_organization_member(organization_id) and (public.is_organization_admin(organization_id) or exists (
    select 1 from public.leads l where l.id=contact_drafts.lead_id and l.organization_id=contact_drafts.organization_id and l.owner_id=auth.uid()
  )));

commit;
