begin;

-- V101.11.3-H22.6 — Manual Proposal Cost Null Safety
-- A proposta manual não deve materializar custo interno 0 quando o vendedor não
-- forneceu custo. NULL significa "custo não informado/oculto" e mantém o guardrail
-- H22.3 capaz de bloquear qualquer tentativa explícita de definir custo interno.

create or replace function public.save_sales_proposal(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_lead_id uuid,
  p_title text,
  p_forecast_category text,
  p_probability numeric,
  p_valid_until date,
  p_expected_close_at date,
  p_contract_start_at date,
  p_contract_end_at date,
  p_contract_term_months integer,
  p_auto_renew boolean,
  p_post_sale_start_at date,
  p_post_sale_cadence_name text,
  p_notes text,
  p_terms text,
  p_items jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_id uuid;
  v_lead public.leads;
  v_current public.sales_proposals;
  v_number text;
  v_group uuid;
  v_official boolean;
  v_term integer:=greatest(1,coalesce(p_contract_term_months,12));
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_lead from public.leads where id=p_lead_id and organization_id=p_organization_id;
  if v_lead.id is null then raise exception 'Lead não encontrado'; end if;
  if v_lead.status='won' or exists(select 1 from public.opportunities o where o.id=v_lead.opportunity_id and (o.status='won' or o.closed_won_at is not null)) then raise exception 'Negócio ganho não aceita novas propostas ou alterações; crie um aditivo ou uma nova oportunidade'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um item'; end if;
  if p_forecast_category not in ('pipeline','best_case','commit','closed','omitted') then raise exception 'Categoria de forecast inválida'; end if;
  if p_contract_end_at is not null and p_contract_start_at is not null and p_contract_end_at < p_contract_start_at then raise exception 'Fim do contrato anterior ao início'; end if;

  if p_proposal_id is null then
    v_id:=gen_random_uuid(); v_group:=gen_random_uuid(); v_number:=public.next_sales_proposal_number(p_organization_id);
    select not exists(select 1 from public.sales_proposals where organization_id=p_organization_id and lead_id=p_lead_id and is_official and is_current_version and status not in ('rejected','expired','cancelled')) into v_official;
    insert into public.sales_proposals(id,organization_id,proposal_group_id,version,proposal_number,lead_id,opportunity_id,company_id,contact_id,title,status,forecast_category,probability,is_official,is_current_version,expected_close_at,contract_start_at,contract_end_at,contract_term_months,auto_renew,post_sale_start_at,post_sale_cadence_name,valid_until,owner_id,notes,terms)
    values(v_id,p_organization_id,v_group,1,v_number,p_lead_id,v_lead.opportunity_id,v_lead.company_id,v_lead.primary_contact_id,left(trim(p_title),250),'draft',p_forecast_category,least(100,greatest(0,coalesce(p_probability,0))),v_official,true,p_expected_close_at,p_contract_start_at,p_contract_end_at,v_term,coalesce(p_auto_renew,false),p_post_sale_start_at,left(coalesce(nullif(trim(p_post_sale_cadence_name),''),'Onboarding padrão'),160),p_valid_until,v_lead.owner_id,left(coalesce(p_notes,''),10000),left(coalesce(p_terms,''),20000));
  else
    select * into v_current from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
    if v_current.id is null then raise exception 'Proposta não encontrada'; end if;
    if not v_current.is_current_version then raise exception 'Edite somente a revisão vigente'; end if;
    if v_current.status<>'draft' then raise exception 'Propostas enviadas ou encerradas são imutáveis; crie uma nova revisão'; end if;
    v_id:=v_current.id;
    update public.sales_proposals set title=left(trim(p_title),250),forecast_category=p_forecast_category,probability=least(100,greatest(0,coalesce(p_probability,0))),valid_until=p_valid_until,expected_close_at=p_expected_close_at,contract_start_at=p_contract_start_at,contract_end_at=p_contract_end_at,contract_term_months=v_term,auto_renew=coalesce(p_auto_renew,false),post_sale_start_at=p_post_sale_start_at,post_sale_cadence_name=left(coalesce(nullif(trim(p_post_sale_cadence_name),''),'Onboarding padrão'),160),notes=left(coalesce(p_notes,''),10000),terms=left(coalesce(p_terms,''),20000) where id=v_id;
    delete from public.sales_proposal_items where proposal_id=v_id;
  end if;

  insert into public.sales_proposal_items(
    organization_id,proposal_id,product_id,item_order,name,description,quantity,unit_price,discount_percent,tax_rate,billing_type,billing_interval,
    line_subtotal,line_discount,line_tax,line_total,recurring_monthly_total,pricing_source,catalog_unit_price,unit_cost_snapshot,catalog_discount_percent,pricing_overridden
  )
  select
    p_organization_id,v_id,pr.id,x.item_order,left(trim(x.name),250),left(coalesce(x.description,''),4000),greatest(0.01,coalesce(x.quantity,1)),greatest(0,coalesce(x.unit_price,0)),least(100,greatest(0,coalesce(x.discount_percent,0))),greatest(0,coalesce(x.tax_rate,0)),
    case when x.billing_type='recurring' then 'recurring' else 'one_time' end,case when x.billing_interval in ('month','quarter','year') then x.billing_interval else null end,
    round(greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0)),2),
    round(greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0))*least(100,greatest(0,coalesce(x.discount_percent,0)))/100,2),
    round((greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0))*(1-least(100,greatest(0,coalesce(x.discount_percent,0)))/100))*greatest(0,coalesce(x.tax_rate,0))/100,2),
    round((greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0))*(1-least(100,greatest(0,coalesce(x.discount_percent,0)))/100))*(1+greatest(0,coalesce(x.tax_rate,0))/100),2),
    case when x.billing_type='recurring' then round(((greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0))*(1-least(100,greatest(0,coalesce(x.discount_percent,0)))/100))*(1+greatest(0,coalesce(x.tax_rate,0))/100)) * case when x.billing_interval='year' then 1.0/12 when x.billing_interval='quarter' then 1.0/3 else 1 end,2) else 0 end,
    case when pr.id is not null and coalesce(x.pricing_source,'catalog') <> 'manual' then 'catalog' else 'manual' end,
    case when pr.id is not null then coalesce(x.catalog_unit_price,pr.unit_price) else null end,
    case when pr.id is not null then coalesce(x.unit_cost_snapshot,pr.unit_cost,0) else x.unit_cost_snapshot end,
    case when pr.id is not null then coalesce(x.catalog_discount_percent,pr.default_discount_percent,0) else null end,
    case when pr.id is null then false else coalesce(x.pricing_overridden,false) end
  from jsonb_to_recordset(p_items) as x(
    product_id uuid,item_order integer,name text,description text,quantity numeric,unit_price numeric,discount_percent numeric,tax_rate numeric,billing_type text,billing_interval text,
    pricing_source text,catalog_unit_price numeric,unit_cost_snapshot numeric,catalog_discount_percent numeric,pricing_overridden boolean
  )
  left join public.products pr on pr.id=x.product_id and pr.organization_id=p_organization_id;

  update public.sales_proposals p set subtotal=q.subtotal,discount_total=q.discount_total,tax_total=q.tax_total,total=q.total,recurring_monthly_total=q.mrr,one_time_total=q.one_time,annual_recurring_total=q.mrr*12,total_contract_value=q.one_time+q.mrr*v_term
  from (select proposal_id,sum(line_subtotal) subtotal,sum(line_discount) discount_total,sum(line_tax) tax_total,sum(line_total) total,sum(recurring_monthly_total) mrr,sum(case when billing_type='one_time' then line_total else 0 end) one_time from public.sales_proposal_items where proposal_id=v_id group by proposal_id) q where p.id=q.proposal_id;

  if exists(select 1 from public.sales_proposals where id=v_id and is_official) then
    update public.leads set value=(select total_contract_value from public.sales_proposals where id=v_id),expected_close_at=p_expected_close_at where id=p_lead_id;
    update public.opportunities set value=(select total_contract_value from public.sales_proposals where id=v_id),expected_close_at=p_expected_close_at,forecast_category=p_forecast_category,probability=least(100,greatest(0,coalesce(p_probability,0))),official_proposal_id=v_id where id=v_lead.opportunity_id;
  end if;
  return v_id;
end; $$;

comment on function public.save_sales_proposal(uuid,uuid,uuid,text,text,numeric,date,date,date,date,integer,boolean,date,text,text,text,jsonb)
  is 'Salva proposta comercial; em item manual preserva custo interno NULL quando não informado, sem contornar o guardrail H22.3.';

commit;
