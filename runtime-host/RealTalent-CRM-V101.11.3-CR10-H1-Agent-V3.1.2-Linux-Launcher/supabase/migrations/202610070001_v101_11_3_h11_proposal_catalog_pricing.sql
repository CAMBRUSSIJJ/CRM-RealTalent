begin;

-- V101.11.3-H11 — Proposal & Catalog Pricing 3.0
-- Guardrails comerciais no catálogo + snapshot de preço/custo na proposta.

alter table public.products
  add column if not exists max_discount_percent numeric(7,4) not null default 20,
  add column if not exists min_margin_percent numeric(7,4) not null default 0;

do $$ begin
  alter table public.products add constraint products_max_discount_range check (max_discount_percent between 0 and 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.products add constraint products_min_margin_range check (min_margin_percent between 0 and 100);
exception when duplicate_object then null; end $$;

alter table public.sales_proposal_items
  add column if not exists pricing_source text not null default 'manual',
  add column if not exists catalog_unit_price numeric(14,2),
  add column if not exists unit_cost_snapshot numeric(14,2),
  add column if not exists catalog_discount_percent numeric(7,4),
  add column if not exists pricing_overridden boolean not null default false;

do $$ begin
  alter table public.sales_proposal_items add constraint sales_proposal_items_pricing_source_check check (pricing_source in ('catalog','manual'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.sales_proposal_items add constraint sales_proposal_items_catalog_unit_price_nonnegative check (catalog_unit_price is null or catalog_unit_price >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.sales_proposal_items add constraint sales_proposal_items_unit_cost_snapshot_nonnegative check (unit_cost_snapshot is null or unit_cost_snapshot >= 0);
exception when duplicate_object then null; end $$;

update public.sales_proposal_items i
set pricing_source = case when i.product_id is null then 'manual' else 'catalog' end,
    catalog_unit_price = coalesce(i.catalog_unit_price, p.unit_price),
    unit_cost_snapshot = coalesce(i.unit_cost_snapshot, p.unit_cost, 0),
    catalog_discount_percent = coalesce(i.catalog_discount_percent, p.default_discount_percent, 0),
    pricing_overridden = case
      when i.product_id is null then false
      when p.id is null then i.pricing_overridden
      else abs(i.unit_price - p.unit_price) > 0.005
        or abs(i.discount_percent - p.default_discount_percent) > 0.005
        or abs(i.tax_rate - p.tax_rate) > 0.005
        or i.billing_type <> p.billing_type
        or coalesce(i.billing_interval,'') <> coalesce(p.billing_interval,'')
    end
from public.products p
where p.id = i.product_id;

comment on column public.products.max_discount_percent is 'Limite comercial de desconto recomendado; acima deste valor a proposta exige revisão/aprovação.';
comment on column public.products.min_margin_percent is 'Margem bruta comercial mínima recomendada para negociação.';
comment on column public.sales_proposal_items.catalog_unit_price is 'Snapshot do preço de tabela no momento em que o item entrou na proposta.';
comment on column public.sales_proposal_items.unit_cost_snapshot is 'Snapshot do custo unitário no momento da proposta para preservar a leitura histórica de margem.';
comment on column public.sales_proposal_items.pricing_source is 'Origem do preço: catalog ou manual.';

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
    case when pr.id is not null then coalesce(x.unit_cost_snapshot,pr.unit_cost,0) else coalesce(x.unit_cost_snapshot,0) end,
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

create or replace function public.create_sales_proposal_revision(p_organization_id uuid,p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_source public.sales_proposals; v_id uuid:=gen_random_uuid(); v_version integer; v_was_official boolean; v_new public.sales_proposals;
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_source from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
  if v_source.id is null then raise exception 'Proposta não encontrada'; end if;
  if not v_source.is_current_version then raise exception 'Crie a revisão a partir da versão vigente'; end if;
  if v_source.closed_won_at is not null or exists(select 1 from public.opportunities o where o.id=v_source.opportunity_id and (o.status='won' or o.closed_won_at is not null)) then raise exception 'Negócio ganho não pode ser revisado; crie um aditivo ou uma nova oportunidade'; end if;
  v_was_official:=v_source.is_official;
  perform set_config('realtalent.proposal_revision','on',true);
  select coalesce(max(version),0)+1 into v_version from public.sales_proposals where proposal_group_id=v_source.proposal_group_id;
  insert into public.sales_proposals(id,organization_id,proposal_group_id,version,proposal_number,lead_id,opportunity_id,company_id,contact_id,title,status,forecast_category,probability,currency,subtotal,discount_total,tax_total,total,recurring_monthly_total,one_time_total,annual_recurring_total,total_contract_value,is_official,is_current_version,expected_close_at,contract_start_at,contract_end_at,contract_term_months,auto_renew,post_sale_start_at,post_sale_cadence_name,valid_until,owner_id,notes,terms)
  select v_id,organization_id,proposal_group_id,v_version,proposal_number,lead_id,opportunity_id,company_id,contact_id,title,'draft',case when forecast_category='closed' then 'best_case' else forecast_category end,case when probability=100 then 60 else probability end,currency,subtotal,discount_total,tax_total,total,recurring_monthly_total,one_time_total,annual_recurring_total,total_contract_value,false,false,expected_close_at,contract_start_at,contract_end_at,contract_term_months,auto_renew,post_sale_start_at,post_sale_cadence_name,valid_until,owner_id,notes,terms from public.sales_proposals where id=p_proposal_id;
  insert into public.sales_proposal_items(organization_id,proposal_id,product_id,item_order,name,description,quantity,unit_price,discount_percent,tax_rate,billing_type,billing_interval,line_subtotal,line_discount,line_tax,line_total,recurring_monthly_total,pricing_source,catalog_unit_price,unit_cost_snapshot,catalog_discount_percent,pricing_overridden)
  select organization_id,v_id,product_id,item_order,name,description,quantity,unit_price,discount_percent,tax_rate,billing_type,billing_interval,line_subtotal,line_discount,line_tax,line_total,recurring_monthly_total,pricing_source,catalog_unit_price,unit_cost_snapshot,catalog_discount_percent,pricing_overridden from public.sales_proposal_items where proposal_id=p_proposal_id;
  update public.sales_proposals set is_current_version=false,is_official=false,superseded_by_id=v_id where id=v_source.id;
  update public.sales_proposals set is_current_version=true,is_official=v_was_official where id=v_id returning * into v_new;
  if v_was_official then
    update public.leads set value=v_new.total_contract_value,expected_close_at=v_new.expected_close_at where id=v_new.lead_id;
    update public.opportunities set official_proposal_id=v_id,value=v_new.total_contract_value,expected_close_at=v_new.expected_close_at,forecast_category=v_new.forecast_category,probability=v_new.probability where id=v_source.opportunity_id;
  end if;
  return v_id;
end; $$;

commit;
