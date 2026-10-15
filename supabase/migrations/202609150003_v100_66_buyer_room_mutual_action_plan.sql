begin;

create table if not exists public.buyer_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  proposal_id uuid not null references public.sales_proposals(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  title text not null,
  welcome_message text not null default '',
  status text not null default 'draft' check (status in ('draft','shared','active','completed','archived')),
  share_token text not null unique,
  share_enabled boolean not null default false,
  expires_at timestamptz,
  last_opened_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  participants jsonb not null default '[]'::jsonb check (jsonb_typeof(participants)='array'),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps)='array'),
  documents jsonb not null default '[]'::jsonb check (jsonb_typeof(documents)='array'),
  activity jsonb not null default '[]'::jsonb check (jsonb_typeof(activity)='array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, proposal_id)
);

create index if not exists buyer_rooms_org_status_idx on public.buyer_rooms(organization_id,status,updated_at desc);
create index if not exists buyer_rooms_lead_idx on public.buyer_rooms(lead_id,updated_at desc);
create index if not exists buyer_rooms_opportunity_idx on public.buyer_rooms(opportunity_id) where opportunity_id is not null;
create index if not exists buyer_rooms_share_enabled_idx on public.buyer_rooms(share_token) where share_enabled=true;
create index if not exists buyer_rooms_steps_gin_idx on public.buyer_rooms using gin(steps jsonb_path_ops);

alter table public.buyer_rooms enable row level security;

drop policy if exists buyer_rooms_select on public.buyer_rooms;
drop policy if exists buyer_rooms_write on public.buyer_rooms;
create policy buyer_rooms_select on public.buyer_rooms for select to authenticated using (public.is_organization_member(organization_id));
create policy buyer_rooms_write on public.buyer_rooms for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));

drop trigger if exists buyer_rooms_touch on public.buyer_rooms;
create trigger buyer_rooms_touch before update on public.buyer_rooms for each row execute function public.touch_updated_at();


-- Wrapper V100.66: retarget Buyer Rooms before the legacy transactional merge deletes
-- the duplicate lead, then reconcile opportunity/company references from the preserved proposal.
create or replace function public.merge_duplicate_leads_v10066(
  p_organization_id uuid,
  p_primary_lead_id uuid,
  p_duplicate_lead_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_result uuid;
begin
  if not public.can_write_organization(p_organization_id) then raise exception 'Sem permissão para alterar este workspace.'; end if;
  update public.buyer_rooms set lead_id=p_primary_lead_id,updated_at=now()
    where organization_id=p_organization_id and lead_id=p_duplicate_lead_id;
  v_result:=public.merge_duplicate_leads(p_organization_id,p_primary_lead_id,p_duplicate_lead_id);
  update public.buyer_rooms br set
    lead_id=sp.lead_id,
    opportunity_id=sp.opportunity_id,
    company_id=sp.company_id,
    updated_at=now()
  from public.sales_proposals sp
  where br.organization_id=p_organization_id and br.proposal_id=sp.id;
  return v_result;
end; $$;

create or replace function public.append_buyer_room_activity(p_room_id uuid, p_event jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.buyer_rooms;
begin
  select * into v_room from public.buyer_rooms where id=p_room_id for update;
  if v_room.id is null then raise exception 'Buyer Room não encontrada'; end if;
  if auth.uid() is null or not public.can_write_organization(v_room.organization_id) then raise exception 'Acesso negado'; end if;
  update public.buyer_rooms
    set activity=(case when jsonb_array_length(activity) >= 250 then (select coalesce(jsonb_agg(value),'[]'::jsonb) from (select value from jsonb_array_elements(activity) with ordinality x(value,ord) where ord > jsonb_array_length(activity)-249) q) else activity end) || jsonb_build_array(p_event)
    where id=p_room_id;
  return p_room_id;
end; $$;

create or replace function public.rotate_buyer_room_token(p_room_id uuid, p_new_token text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.buyer_rooms; v_now timestamptz:=now();
begin
  select * into v_room from public.buyer_rooms where id=p_room_id for update;
  if v_room.id is null then raise exception 'Buyer Room não encontrada'; end if;
  if auth.uid() is null or not public.can_write_organization(v_room.organization_id) then raise exception 'Acesso negado'; end if;
  if length(trim(coalesce(p_new_token,''))) < 32 then raise exception 'Token público inválido'; end if;
  update public.buyer_rooms set share_token=trim(p_new_token), activity=activity || jsonb_build_array(jsonb_build_object(
    'id',gen_random_uuid()::text,'type','token_rotated','actorName','Equipe RealTalent','description','Link público regenerado.','occurredAt',v_now::text,'metadata',jsonb_build_object()
  )) where id=p_room_id;
  return p_room_id;
end; $$;

create or replace function public.get_buyer_room_public(p_share_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.buyer_rooms; v_proposal public.sales_proposals; v_lead public.leads;
begin
  select * into v_room from public.buyer_rooms
    where share_token=p_share_token and share_enabled=true and status <> 'archived'
      and (expires_at is null or expires_at >= now())
    limit 1;
  if v_room.id is null then return null; end if;
  select * into v_proposal from public.sales_proposals where id=v_room.proposal_id;
  select * into v_lead from public.leads where id=v_room.lead_id;
  return jsonb_build_object(
    'id',v_room.id,'title',v_room.title,'welcomeMessage',v_room.welcome_message,'status',v_room.status,
    'expiresAt',v_room.expires_at,'lastOpenedAt',v_room.last_opened_at,'viewCount',v_room.view_count,
    'participants',v_room.participants,'steps',v_room.steps,'documents',v_room.documents,
    'proposal',jsonb_build_object('id',v_proposal.id,'proposalNumber',v_proposal.proposal_number,'title',v_proposal.title,'status',v_proposal.status,'totalContractValue',v_proposal.total_contract_value,'recurringMonthlyTotal',v_proposal.recurring_monthly_total,'currency',v_proposal.currency,'validUntil',v_proposal.valid_until,'terms',v_proposal.terms),
    'customer',jsonb_build_object('name',v_lead.name,'company',v_lead.company)
  );
end; $$;

create or replace function public.track_buyer_room_public_open(p_share_token text, p_actor_name text default 'Visitante')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.buyer_rooms; v_now timestamptz:=now();
begin
  select * into v_room from public.buyer_rooms where share_token=p_share_token and share_enabled=true and status <> 'archived' and (expires_at is null or expires_at >= v_now) for update;
  if v_room.id is null then return null; end if;
  update public.buyer_rooms set last_opened_at=v_now, view_count=view_count+1, status=case when status in ('draft','shared') then 'active' else status end,
    activity=activity || jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'type','opened','actorName',left(coalesce(nullif(trim(p_actor_name),''),'Visitante'),120),'description','Buyer Room aberta.','occurredAt',v_now::text,'metadata',jsonb_build_object('public',true)))
    where id=v_room.id;
  return public.get_buyer_room_public(p_share_token);
end; $$;

create or replace function public.update_buyer_room_public_step(p_share_token text, p_step_id text, p_completed boolean, p_actor_name text default 'Comprador')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.buyer_rooms; v_now timestamptz:=now(); v_steps jsonb; v_changed boolean:=false; v_progress integer;
begin
  select * into v_room from public.buyer_rooms where share_token=p_share_token and share_enabled=true and status <> 'archived' and (expires_at is null or expires_at >= v_now) for update;
  if v_room.id is null then return null; end if;
  select coalesce(jsonb_agg(
    case when elem->>'id'=p_step_id and elem->>'owner' in ('buyer','shared') then
      elem || jsonb_build_object('status',case when p_completed then 'completed' else 'in_progress' end,'completedAt',case when p_completed then to_jsonb(v_now::text) else 'null'::jsonb end)
    else elem end order by ord
  ),'[]'::jsonb), bool_or(elem->>'id'=p_step_id and elem->>'owner' in ('buyer','shared'))
  into v_steps,v_changed from jsonb_array_elements(v_room.steps) with ordinality x(elem,ord);
  if not coalesce(v_changed,false) then raise exception 'Etapa pública não encontrada ou sem permissão de comprador'; end if;
  select case when count(*)=0 then 0 else round(100.0*count(*) filter(where value->>'status'='completed')/count(*))::integer end into v_progress from jsonb_array_elements(v_steps);
  update public.buyer_rooms set steps=v_steps, status=case when v_progress=100 then 'completed' else 'active' end,
    activity=activity || jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'type','step_updated','actorName',left(coalesce(nullif(trim(p_actor_name),''),'Comprador'),120),'description',case when p_completed then 'Etapa concluída pelo comprador.' else 'Etapa reaberta pelo comprador.' end,'occurredAt',v_now::text,'metadata',jsonb_build_object('stepId',p_step_id,'completed',p_completed)))
    where id=v_room.id;
  return public.get_buyer_room_public(p_share_token);
end; $$;


create or replace function public.track_buyer_room_public_document(p_share_token text, p_document_id text, p_actor_name text default 'Comprador')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.buyer_rooms; v_now timestamptz:=now(); v_exists boolean:=false;
begin
  select * into v_room from public.buyer_rooms where share_token=p_share_token and share_enabled=true and status <> 'archived' and (expires_at is null or expires_at >= v_now) for update;
  if v_room.id is null then return false; end if;
  select exists(select 1 from jsonb_array_elements(v_room.documents) d where d->>'id'=p_document_id and coalesce((d->>'visible')::boolean,true)) into v_exists;
  if not v_exists then return false; end if;
  update public.buyer_rooms set activity=activity || jsonb_build_array(jsonb_build_object(
    'id',gen_random_uuid()::text,'type','document_opened','actorName',left(coalesce(nullif(trim(p_actor_name),''),'Comprador'),120),
    'description','Documento aberto pelo comprador.','occurredAt',v_now::text,'metadata',jsonb_build_object('documentId',p_document_id,'public',true)
  )) where id=v_room.id;
  return true;
end; $$;

create or replace function public.add_buyer_room_public_comment(p_share_token text, p_message text, p_actor_name text default 'Comprador')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.buyer_rooms; v_now timestamptz:=now(); v_message text:=left(trim(coalesce(p_message,'')),2000);
begin
  if length(v_message) < 2 then raise exception 'Comentário vazio'; end if;
  select * into v_room from public.buyer_rooms where share_token=p_share_token and share_enabled=true and status <> 'archived' and (expires_at is null or expires_at >= v_now) for update;
  if v_room.id is null then return false; end if;
  update public.buyer_rooms set activity=activity || jsonb_build_array(jsonb_build_object(
    'id',gen_random_uuid()::text,'type','comment','actorName',left(coalesce(nullif(trim(p_actor_name),''),'Comprador'),120),
    'description',v_message,'occurredAt',v_now::text,'metadata',jsonb_build_object('public',true)
  )) where id=v_room.id;
  return true;
end; $$;

-- Functions are capability endpoints. Revoke PostgreSQL's default PUBLIC EXECUTE grant
-- and expose only the intended API roles.
revoke all on function public.merge_duplicate_leads_v10066(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.append_buyer_room_activity(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.rotate_buyer_room_token(uuid,text) from public, anon, authenticated;
revoke all on function public.get_buyer_room_public(text) from public, anon, authenticated;
revoke all on function public.track_buyer_room_public_open(text,text) from public, anon, authenticated;
revoke all on function public.update_buyer_room_public_step(text,text,boolean,text) from public, anon, authenticated;
revoke all on function public.track_buyer_room_public_document(text,text,text) from public, anon, authenticated;
revoke all on function public.add_buyer_room_public_comment(text,text,text) from public, anon, authenticated;

grant execute on function public.get_buyer_room_public(text) to anon, authenticated;
grant execute on function public.track_buyer_room_public_open(text,text) to anon, authenticated;
grant execute on function public.update_buyer_room_public_step(text,text,boolean,text) to anon, authenticated;
grant execute on function public.track_buyer_room_public_document(text,text,text) to anon, authenticated;
grant execute on function public.add_buyer_room_public_comment(text,text,text) to anon, authenticated;
grant execute on function public.append_buyer_room_activity(uuid,jsonb) to authenticated;
grant execute on function public.rotate_buyer_room_token(uuid,text) to authenticated;
grant execute on function public.merge_duplicate_leads_v10066(uuid,uuid,uuid) to authenticated;

commit;
