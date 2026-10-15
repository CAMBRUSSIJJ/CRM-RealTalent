begin;

-- H22.3-H1 — Stability & Security Closure.
-- Harden proposal approval helpers added by H22.3 without changing their business semantics.

create or replace function public.rt_access_approval_policy(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_role text; v_policy jsonb;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Sem acesso ao workspace.' using errcode='42501';
  end if;
  select role into v_role from public.organization_members where organization_id=p_organization_id and user_id=auth.uid();
  if v_role in ('owner','admin') then return public.rt_access_default_approval_policy('administrator'); end if;
  select approval_policy into v_policy from public.access_profiles where organization_id=p_organization_id and profile_key=public.rt_member_profile_key(p_organization_id);
  return coalesce(v_policy,public.rt_access_default_approval_policy('seller'));
end $$;

create or replace function public.rt_proposal_policy_reasons(p_organization_id uuid,p_proposal_id uuid)
returns text[] language plpgsql stable security definer set search_path=public as $$
declare v_policy jsonb; v_total numeric; v_max_discount numeric; v_min_margin numeric; v_reasons text[]:=array[]::text[]; v_discount_limit numeric; v_margin_limit numeric; v_total_limit numeric;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Sem acesso ao workspace.' using errcode='42501';
  end if;
  if not exists(select 1 from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id) then
    raise exception 'Proposta não encontrada.' using errcode='P0002';
  end if;
  if not public.rt_access_action_allowed(p_organization_id,'proposals','view') then
    raise exception 'Permissão negada para visualizar propostas.' using errcode='42501';
  end if;
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
returns boolean language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Sem acesso ao workspace.' using errcode='42501';
  end if;
  return exists(
    select 1 from public.access_approval_requests r
    where r.organization_id=p_organization_id
      and r.resource='proposals'
      and r.kind='proposal_policy'
      and r.entity_type='proposal'
      and r.entity_id=p_proposal_id::text
      and r.status='approved'
      and (r.requester_id=auth.uid() or public.rt_access_action_allowed(p_organization_id,'proposals','approve'))
  );
end $$;

-- Approval policy is safe for an authenticated workspace member; proposal helpers are internal only.
revoke all on function public.rt_access_approval_policy(uuid) from public,anon;
grant execute on function public.rt_access_approval_policy(uuid) to authenticated;

revoke all on function public.rt_proposal_policy_reasons(uuid,uuid) from public,anon,authenticated;
revoke all on function public.rt_proposal_has_approval(uuid,uuid) from public,anon,authenticated;

commit;
