begin;

-- H22.3 — Field-Level Permissions + Approvals + Audit Log.
-- Rules remain profile-driven; critical writes are also enforced in PostgreSQL.

alter table public.access_profiles
  add column if not exists field_access jsonb not null default '{}'::jsonb,
  add column if not exists approval_policy jsonb not null default '{}'::jsonb;

create table if not exists public.access_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requester_id uuid references auth.users(id) on delete set null default auth.uid(),
  requester_name text not null default '',
  approver_id uuid references auth.users(id) on delete set null,
  approver_name text not null default '',
  resource text not null check (resource in ('contacts','pipeline','tasks','communications','proposals','prospecting','goals','settings')),
  kind text not null check (kind in ('proposal_policy','data_export')),
  entity_type text not null,
  entity_id text,
  reason text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists access_approval_requests_org_status_idx on public.access_approval_requests(organization_id,status,created_at desc);
create index if not exists access_approval_requests_entity_idx on public.access_approval_requests(organization_id,kind,entity_type,entity_id,created_at desc);
alter table public.access_approval_requests enable row level security;

drop policy if exists access_approval_requests_select on public.access_approval_requests;
create policy access_approval_requests_select on public.access_approval_requests for select to authenticated using (
  public.is_organization_member(organization_id)
  and (requester_id=auth.uid() or public.is_organization_admin(organization_id) or public.rt_access_action_allowed(organization_id,resource,'approve'))
);
revoke insert,update,delete on public.access_approval_requests from authenticated;
grant select on public.access_approval_requests to authenticated;

create or replace function public.rt_access_default_field_access(p_profile text)
returns jsonb language plpgsql immutable as $$
begin
  if p_profile in ('administrator','manager') then
    return '{"contact_phone":"edit","contact_email":"edit","deal_value":"edit","proposal_discount":"edit","proposal_margin":"edit","proposal_cost":"edit","proposal_total":"edit","revenue_amount":"edit"}'::jsonb;
  elsif p_profile='seller' then
    return '{"contact_phone":"edit","contact_email":"edit","deal_value":"edit","proposal_discount":"edit","proposal_margin":"view","proposal_cost":"hidden","proposal_total":"view","revenue_amount":"view"}'::jsonb;
  elsif p_profile='sdr' then
    return '{"contact_phone":"edit","contact_email":"edit","deal_value":"view","proposal_discount":"hidden","proposal_margin":"hidden","proposal_cost":"hidden","proposal_total":"hidden","revenue_amount":"hidden"}'::jsonb;
  elsif p_profile='viewer' then
    return '{"contact_phone":"view","contact_email":"view","deal_value":"view","proposal_discount":"hidden","proposal_margin":"hidden","proposal_cost":"hidden","proposal_total":"view","revenue_amount":"view"}'::jsonb;
  end if;
  return '{"contact_phone":"view","contact_email":"view","deal_value":"view","proposal_discount":"view","proposal_margin":"view","proposal_cost":"hidden","proposal_total":"view","revenue_amount":"view"}'::jsonb;
end $$;

create or replace function public.rt_access_default_approval_policy(p_profile text)
returns jsonb language plpgsql immutable as $$
begin
  if p_profile in ('administrator','manager') then
    return '{"proposalDiscountPercent":null,"proposalMinMarginPercent":null,"proposalTotalValue":null,"exportRequiresApproval":false}'::jsonb;
  elsif p_profile='seller' then
    return '{"proposalDiscountPercent":15,"proposalMinMarginPercent":20,"proposalTotalValue":50000,"exportRequiresApproval":true}'::jsonb;
  elsif p_profile='sdr' then
    return '{"proposalDiscountPercent":5,"proposalMinMarginPercent":25,"proposalTotalValue":10000,"exportRequiresApproval":true}'::jsonb;
  elsif p_profile='viewer' then
    return '{"proposalDiscountPercent":0,"proposalMinMarginPercent":100,"proposalTotalValue":0,"exportRequiresApproval":true}'::jsonb;
  end if;
  return '{"proposalDiscountPercent":15,"proposalMinMarginPercent":20,"proposalTotalValue":50000,"exportRequiresApproval":true}'::jsonb;
end $$;

-- Add the approve action to system manager/admin profiles and seed H22.3 governance values.
update public.access_profiles p
set field_access=case when field_access='{}'::jsonb then public.rt_access_default_field_access(coalesce(system_key,'seller')) else field_access end,
    approval_policy=case when approval_policy='{}'::jsonb then public.rt_access_default_approval_policy(coalesce(system_key,'seller')) else approval_policy end,
    rules=(select jsonb_agg(case when p.system_key in ('administrator','manager') and elem->>'resource'<>'settings'
      then jsonb_set(elem,'{actions}',coalesce(elem->'actions','[]'::jsonb) || case when coalesce(elem->'actions','[]'::jsonb) ? 'approve' then '[]'::jsonb else '["approve"]'::jsonb end)
      else elem end)
      from jsonb_array_elements(p.rules) elem),
    updated_at=now()
where p.is_system;

create or replace function public.rt_access_field_level(p_organization_id uuid,p_field text)
returns text language plpgsql stable security definer set search_path=public as $$
declare v_role text; v_profile public.access_profiles%rowtype; v_level text;
begin
  select role into v_role from public.organization_members where organization_id=p_organization_id and user_id=auth.uid();
  if v_role in ('owner','admin') then return 'edit'; end if;
  if v_role is null then return 'hidden'; end if;
  select * into v_profile from public.access_profiles where organization_id=p_organization_id and profile_key=public.rt_member_profile_key(p_organization_id);
  v_level:=coalesce(v_profile.field_access->>p_field,'hidden');
  if v_level not in ('hidden','view','edit') then return 'hidden'; end if;
  return v_level;
end $$;

create or replace function public.rt_access_approval_policy(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_role text; v_policy jsonb;
begin
  select role into v_role from public.organization_members where organization_id=p_organization_id and user_id=auth.uid();
  if v_role in ('owner','admin') then return public.rt_access_default_approval_policy('administrator'); end if;
  select approval_policy into v_policy from public.access_profiles where organization_id=p_organization_id and profile_key=public.rt_member_profile_key(p_organization_id);
  return coalesce(v_policy,public.rt_access_default_approval_policy('seller'));
end $$;

create or replace function public.rt_record_access_audit(p_organization_id uuid,p_action text,p_entity_type text,p_entity_id text default null,p_metadata jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_name text;
begin
  if not public.is_organization_member(p_organization_id) then raise exception 'Sem acesso ao workspace.' using errcode='42501'; end if;
  select coalesce(display_name,email,auth.uid()::text) into v_name from public.profiles where id=auth.uid();
  insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,after_data)
  values(p_organization_id,auth.uid(),p_action,p_entity_type,p_entity_id,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('actorName',coalesce(v_name,''))) returning id into v_id;
  return v_id;
end $$;

-- Security audit can be read by administrators or profiles allowed into administrative settings.
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (
  public.is_organization_admin(organization_id)
  or (public.is_organization_member(organization_id) and public.rt_access_action_allowed(organization_id,'settings','view'))
);

create or replace function public.rt_request_access_approval(p_organization_id uuid,p_resource text,p_kind text,p_entity_type text,p_entity_id text default null,p_reason text default '',p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_name text;
begin
  if not public.is_organization_member(p_organization_id) then raise exception 'Sem acesso ao workspace.' using errcode='42501'; end if;
  if p_kind not in ('proposal_policy','data_export') then raise exception 'Tipo de aprovação inválido.'; end if;
  if p_resource not in ('contacts','pipeline','tasks','communications','proposals','prospecting','goals','settings') then raise exception 'Recurso inválido.'; end if;
  select coalesce(display_name,email,auth.uid()::text) into v_name from public.profiles where id=auth.uid();
  update public.access_approval_requests set status='cancelled',updated_at=now()
  where organization_id=p_organization_id and requester_id=auth.uid() and status='pending' and kind=p_kind and resource=p_resource and entity_type=p_entity_type and coalesce(entity_id,'')=coalesce(p_entity_id,'');
  insert into public.access_approval_requests(organization_id,requester_id,requester_name,resource,kind,entity_type,entity_id,reason,payload)
  values(p_organization_id,auth.uid(),coalesce(v_name,''),p_resource,p_kind,p_entity_type,p_entity_id,p_reason,coalesce(p_payload,'{}'::jsonb)) returning id into v_id;
  perform public.rt_record_access_audit(p_organization_id,'approval_requested',p_entity_type,p_entity_id,jsonb_build_object('approvalId',v_id,'resource',p_resource,'kind',p_kind,'reason',p_reason));
  return v_id;
end $$;

create or replace function public.rt_decide_access_approval(p_approval_id uuid,p_decision text)
returns void language plpgsql security definer set search_path=public as $$
declare v_request public.access_approval_requests%rowtype; v_name text;
begin
  if p_decision not in ('approved','rejected') then raise exception 'Decisão inválida.'; end if;
  select * into v_request from public.access_approval_requests where id=p_approval_id for update;
  if not found or v_request.status<>'pending' then raise exception 'Solicitação não encontrada ou já decidida.'; end if;
  if not public.rt_access_action_allowed(v_request.organization_id,v_request.resource,'approve') then raise exception 'Seu perfil não permite aprovar esta solicitação.' using errcode='42501'; end if;
  select coalesce(display_name,email,auth.uid()::text) into v_name from public.profiles where id=auth.uid();
  update public.access_approval_requests set status=p_decision,approver_id=auth.uid(),approver_name=coalesce(v_name,''),decided_at=now(),updated_at=now() where id=p_approval_id;
  perform public.rt_record_access_audit(v_request.organization_id,case when p_decision='approved' then 'approval_approved' else 'approval_rejected' end,v_request.entity_type,v_request.entity_id,jsonb_build_object('approvalId',p_approval_id,'resource',v_request.resource,'kind',v_request.kind));
end $$;

create or replace function public.rt_consume_access_approval(p_approval_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_request public.access_approval_requests%rowtype;
begin
  select * into v_request from public.access_approval_requests where id=p_approval_id for update;
  if not found or v_request.status<>'approved' then raise exception 'Aprovação indisponível.'; end if;
  if v_request.requester_id<>auth.uid() and not public.rt_access_action_allowed(v_request.organization_id,v_request.resource,'approve') then raise exception 'Aprovação pertence a outro usuário.' using errcode='42501'; end if;
  update public.access_approval_requests set status='cancelled',updated_at=now() where id=p_approval_id;
end $$;

-- Sensitive writes are distinct from ordinary record edit permission.
create or replace function public.rt_enforce_sensitive_field_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_fields text[]:=array[]::text[]; v_cost numeric;
begin
  if auth.uid() is null then return new; end if;
  v_org:=new.organization_id;
  if tg_table_name='leads' then
    if (tg_op='INSERT' and coalesce(new.phone,'')<>'') or (tg_op='UPDATE' and new.phone is distinct from old.phone) then if public.rt_access_field_level(v_org,'contact_phone')<>'edit' then raise exception 'Permissão negada: telefone é somente leitura/oculto.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'contact_phone'); end if;
    if (tg_op='INSERT' and coalesce(new.email,'')<>'') or (tg_op='UPDATE' and new.email is distinct from old.email) then if public.rt_access_field_level(v_org,'contact_email')<>'edit' then raise exception 'Permissão negada: e-mail é somente leitura/oculto.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'contact_email'); end if;
    if (tg_op='INSERT' and coalesce(new.value,0)<>0) or (tg_op='UPDATE' and new.value is distinct from old.value) then if public.rt_access_field_level(v_org,'deal_value')<>'edit' then raise exception 'Permissão negada: valor da oportunidade é somente leitura/oculto.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'deal_value'); end if;
  elsif tg_table_name='contacts' then
    if (tg_op='INSERT' and coalesce(new.phone,'')<>'') or (tg_op='UPDATE' and new.phone is distinct from old.phone) then if public.rt_access_field_level(v_org,'contact_phone')<>'edit' then raise exception 'Permissão negada: telefone é somente leitura/oculto.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'contact_phone'); end if;
    if (tg_op='INSERT' and coalesce(new.email,'')<>'') or (tg_op='UPDATE' and new.email is distinct from old.email) then if public.rt_access_field_level(v_org,'contact_email')<>'edit' then raise exception 'Permissão negada: e-mail é somente leitura/oculto.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'contact_email'); end if;
  elsif tg_table_name='products' then
    if (tg_op='INSERT' and coalesce(new.unit_cost,0)<>0) or (tg_op='UPDATE' and new.unit_cost is distinct from old.unit_cost) then if public.rt_access_field_level(v_org,'proposal_cost')<>'edit' then raise exception 'Permissão negada: custo interno é protegido.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'proposal_cost'); end if;
    if (tg_op='INSERT' and (coalesce(new.default_discount_percent,0)<>0 or coalesce(new.max_discount_percent,20)<>20)) or (tg_op='UPDATE' and (new.default_discount_percent is distinct from old.default_discount_percent or new.max_discount_percent is distinct from old.max_discount_percent)) then if public.rt_access_field_level(v_org,'proposal_discount')<>'edit' then raise exception 'Permissão negada: política de desconto é protegida.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'proposal_discount'); end if;
    if (tg_op='INSERT' and coalesce(new.min_margin_percent,0)<>0) or (tg_op='UPDATE' and new.min_margin_percent is distinct from old.min_margin_percent) then if public.rt_access_field_level(v_org,'proposal_margin')<>'edit' then raise exception 'Permissão negada: política de margem é protegida.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'proposal_margin'); end if;
  elsif tg_table_name='sales_proposal_items' then
    if (tg_op='INSERT' and coalesce(new.discount_percent,0)<>0) or (tg_op='UPDATE' and new.discount_percent is distinct from old.discount_percent) then if public.rt_access_field_level(v_org,'proposal_discount')<>'edit' then raise exception 'Permissão negada: desconto da proposta é protegido.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'proposal_discount'); end if;
    if tg_op='UPDATE' and new.unit_cost_snapshot is distinct from old.unit_cost_snapshot then if public.rt_access_field_level(v_org,'proposal_cost')<>'edit' then raise exception 'Permissão negada: custo interno é protegido.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'proposal_cost');
    elsif tg_op='INSERT' and new.unit_cost_snapshot is not null then
      select unit_cost into v_cost from public.products where id=new.product_id and organization_id=v_org;
      if new.product_id is null or abs(coalesce(new.unit_cost_snapshot,0)-coalesce(v_cost,0))>0.005 then if public.rt_access_field_level(v_org,'proposal_cost')<>'edit' then raise exception 'Permissão negada: custo interno não pode ser definido manualmente.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'proposal_cost'); end if;
    end if;
  elsif tg_table_name='revenue_entries' then
    if (tg_op='INSERT' and (coalesce(new.amount,0)<>0 or coalesce(new.recurring_monthly_amount,0)<>0)) or (tg_op='UPDATE' and (new.amount is distinct from old.amount or new.recurring_monthly_amount is distinct from old.recurring_monthly_amount)) then if public.rt_access_field_level(v_org,'revenue_amount')<>'edit' then raise exception 'Permissão negada: receita é somente leitura/oculta.' using errcode='42501'; end if; v_fields:=array_append(v_fields,'revenue_amount'); end if;
  end if;
  if cardinality(v_fields)>0 then perform public.rt_record_access_audit(v_org,'sensitive_field_changed',tg_table_name,coalesce(new.id::text,null),jsonb_build_object('fields',to_jsonb(v_fields))); end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['leads','contacts','products','sales_proposal_items','revenue_entries'] loop
    execute format('drop trigger if exists %I on public.%I',t||'_h22_3_sensitive_fields',t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.rt_enforce_sensitive_field_write()',t||'_h22_3_sensitive_fields',t);
  end loop;
end $$;

create or replace function public.rt_proposal_policy_reasons(p_organization_id uuid,p_proposal_id uuid)
returns text[] language plpgsql stable security definer set search_path=public as $$
declare v_policy jsonb; v_total numeric; v_max_discount numeric; v_min_margin numeric; v_reasons text[]:=array[]::text[]; v_discount_limit numeric; v_margin_limit numeric; v_total_limit numeric;
begin
  v_policy:=public.rt_access_approval_policy(p_organization_id);
  select total_contract_value into v_total from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id;
  select coalesce(max(discount_percent),0),coalesce(min(case when (line_subtotal-line_discount)>0 then ((line_subtotal-line_discount)-(coalesce(unit_cost_snapshot,0)*quantity))/(line_subtotal-line_discount)*100 else 100 end),100)
    into v_max_discount,v_min_margin from public.sales_proposal_items where proposal_id=p_proposal_id and organization_id=p_organization_id;
  v_discount_limit:=nullif(v_policy->>'proposalDiscountPercent','')::numeric;
  v_margin_limit:=nullif(v_policy->>'proposalMinMarginPercent','')::numeric;
  v_total_limit:=nullif(v_policy->>'proposalTotalValue','')::numeric;
  if v_discount_limit is not null and v_max_discount>v_discount_limit then v_reasons:=array_append(v_reasons,format('Desconto %s%% acima da alçada %s%%.',round(v_max_discount,2),round(v_discount_limit,2))); end if;
  if v_margin_limit is not null and v_min_margin<v_margin_limit then v_reasons:=array_append(v_reasons,format('Margem %s%% abaixo da alçada %s%%.',round(v_min_margin,2),round(v_margin_limit,2))); end if;
  if v_total_limit is not null and coalesce(v_total,0)>v_total_limit then v_reasons:=array_append(v_reasons,format('TCV %s acima da alçada %s.',round(coalesce(v_total,0),2),round(v_total_limit,2))); end if;
  if exists(select 1 from public.sales_proposal_items i join public.products p on p.id=i.product_id and p.organization_id=i.organization_id where i.proposal_id=p_proposal_id and (i.discount_percent>p.max_discount_percent or ((i.line_subtotal-i.line_discount)>0 and (((i.line_subtotal-i.line_discount)-(coalesce(i.unit_cost_snapshot,p.unit_cost,0)*i.quantity))/(i.line_subtotal-i.line_discount)*100)<p.min_margin_percent))) then v_reasons:=array_append(v_reasons,'Item fora dos guardrails de preço/margem do catálogo.'); end if;
  return v_reasons;
end $$;

create or replace function public.rt_proposal_has_approval(p_organization_id uuid,p_proposal_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.access_approval_requests r where r.organization_id=p_organization_id and r.resource='proposals' and r.kind='proposal_policy' and r.entity_type='proposal' and r.entity_id=p_proposal_id::text and r.status='approved')
$$;

create or replace function public.rt_enforce_proposal_approval()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_reasons text[];
begin
  if auth.uid() is null then return new; end if;
  if public.rt_access_action_allowed(new.organization_id,'proposals','approve') then return new; end if;
  if (new.status in ('sent','viewed','accepted') and old.status is distinct from new.status) or (new.is_official and old.is_official is distinct from new.is_official) then
    v_reasons:=public.rt_proposal_policy_reasons(new.organization_id,new.id);
    if cardinality(v_reasons)>0 and not public.rt_proposal_has_approval(new.organization_id,new.id) then raise exception 'A proposta exige aprovação antes de avançar: %',array_to_string(v_reasons,' ') using errcode='42501'; end if;
  end if;
  return new;
end $$;

drop trigger if exists sales_proposals_h22_3_approval_guard on public.sales_proposals;
create trigger sales_proposals_h22_3_approval_guard before update of status,is_official on public.sales_proposals for each row execute function public.rt_enforce_proposal_approval();

-- Approved pricing requests become stale when a draft price changes.
create or replace function public.rt_invalidate_proposal_approval()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_proposal uuid; v_org uuid; v_status text; v_official boolean;
begin
  if tg_op='DELETE' then v_proposal:=old.proposal_id; v_org:=old.organization_id; else v_proposal:=new.proposal_id; v_org:=new.organization_id; end if;
  select status,is_official into v_status,v_official from public.sales_proposals where id=v_proposal;
  if auth.uid() is not null and not public.rt_access_action_allowed(v_org,'proposals','approve') and (v_status<>'draft' or v_official) then
    raise exception 'Preço de proposta enviada/oficial só pode ser alterado por aprovador ou em uma nova revisão.' using errcode='42501';
  end if;
  update public.access_approval_requests set status='cancelled',updated_at=now() where organization_id=v_org and kind='proposal_policy' and entity_type='proposal' and entity_id=v_proposal::text and status='approved';
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists sales_proposal_items_h22_3_invalidate_approval on public.sales_proposal_items;
create trigger sales_proposal_items_h22_3_invalidate_approval after insert or update or delete on public.sales_proposal_items for each row execute function public.rt_invalidate_proposal_approval();

revoke all on function public.rt_access_field_level(uuid,text) from public,anon;
grant execute on function public.rt_access_field_level(uuid,text) to authenticated;
revoke all on function public.rt_access_approval_policy(uuid) from public,anon;
grant execute on function public.rt_access_approval_policy(uuid) to authenticated;
revoke all on function public.rt_record_access_audit(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.rt_record_access_audit(uuid,text,text,text,jsonb) to authenticated;
revoke all on function public.rt_request_access_approval(uuid,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.rt_request_access_approval(uuid,text,text,text,text,text,jsonb) to authenticated;
revoke all on function public.rt_decide_access_approval(uuid,text) from public,anon;
grant execute on function public.rt_decide_access_approval(uuid,text) to authenticated;
revoke all on function public.rt_consume_access_approval(uuid) from public,anon;
grant execute on function public.rt_consume_access_approval(uuid) to authenticated;
revoke all on function public.rt_enforce_sensitive_field_write() from public,anon,authenticated;
revoke all on function public.rt_enforce_proposal_approval() from public,anon,authenticated;
revoke all on function public.rt_invalidate_proposal_approval() from public,anon,authenticated;

commit;
