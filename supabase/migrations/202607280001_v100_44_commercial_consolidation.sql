begin;

create or replace function public.can_write_organization(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role in ('owner','admin','member')
  );
$$;

grant execute on function public.can_write_organization(uuid) to authenticated;

alter table public.sales_proposals
  add column if not exists is_official boolean not null default false,
  add column if not exists is_current_version boolean not null default true,
  add column if not exists superseded_by_id uuid references public.sales_proposals(id) on delete set null,
  add column if not exists expected_close_at date,
  add column if not exists contract_start_at date,
  add column if not exists contract_end_at date,
  add column if not exists contract_term_months integer not null default 12 check (contract_term_months between 1 and 600),
  add column if not exists auto_renew boolean not null default false,
  add column if not exists one_time_total numeric(14,2) not null default 0,
  add column if not exists annual_recurring_total numeric(14,2) not null default 0,
  add column if not exists total_contract_value numeric(14,2) not null default 0,
  add column if not exists post_sale_start_at date,
  add column if not exists post_sale_cadence_name text not null default 'Onboarding padrão',
  add column if not exists closed_won_at timestamptz;

alter table public.opportunities
  add column if not exists forecast_category text not null default 'pipeline' check (forecast_category in ('pipeline','best_case','commit','closed','omitted')),
  add column if not exists probability numeric(5,2) not null default 0 check (probability between 0 and 100),
  add column if not exists official_proposal_id uuid references public.sales_proposals(id) on delete set null,
  add column if not exists closed_won_at timestamptz;

alter table public.revenue_entries
  add column if not exists competence_date date,
  add column if not exists service_period_start date,
  add column if not exists service_period_end date,
  add column if not exists adjustment_reason text not null default '';

update public.revenue_entries set competence_date = recognized_at::date where competence_date is null;
alter table public.revenue_entries alter column competence_date set not null;

alter table public.sales_proposals drop constraint if exists sales_proposals_organization_id_proposal_number_key;
create unique index if not exists sales_proposals_org_number_version_uq on public.sales_proposals(organization_id,proposal_number,version);

with ranked as (
  select id, row_number() over(partition by proposal_group_id order by version desc,updated_at desc,id desc) as position
  from public.sales_proposals
)
update public.sales_proposals p
set is_current_version = ranked.position = 1
from ranked where ranked.id = p.id;

with ranked as (
  select id, row_number() over(partition by organization_id,lead_id order by is_current_version desc,updated_at desc,version desc,id desc) as position
  from public.sales_proposals
  where status not in ('rejected','expired','cancelled')
)
update public.sales_proposals p
set is_official = ranked.position = 1
from ranked where ranked.id = p.id;

update public.sales_proposals p set
  one_time_total = coalesce((select sum(case when i.billing_type='one_time' then i.line_total else 0 end) from public.sales_proposal_items i where i.proposal_id=p.id),0),
  annual_recurring_total = coalesce((select sum(i.recurring_monthly_total) from public.sales_proposal_items i where i.proposal_id=p.id),0) * 12,
  total_contract_value = coalesce((select sum(case when i.billing_type='one_time' then i.line_total else 0 end) from public.sales_proposal_items i where i.proposal_id=p.id),0)
    + coalesce((select sum(i.recurring_monthly_total) from public.sales_proposal_items i where i.proposal_id=p.id),0) * greatest(1,p.contract_term_months),
  expected_close_at = coalesce(
    p.expected_close_at,
    (select o.expected_close_at from public.opportunities o where o.id=p.opportunity_id),
    (select l.expected_close_at from public.leads l where l.id=p.lead_id)
  );

create unique index if not exists sales_proposals_one_current_group_uq
  on public.sales_proposals(proposal_group_id)
  where is_current_version;
create unique index if not exists sales_proposals_one_official_opportunity_uq
  on public.sales_proposals(organization_id,opportunity_id)
  where is_official and is_current_version and opportunity_id is not null;
create unique index if not exists sales_proposals_one_official_lead_uq
  on public.sales_proposals(organization_id,lead_id)
  where is_official and is_current_version;
create index if not exists sales_proposals_forecast_v10044_idx on public.sales_proposals(organization_id,is_official,is_current_version,expected_close_at,forecast_category);
create index if not exists revenue_entries_competence_v10044_idx on public.revenue_entries(organization_id,competence_date,status);

update public.opportunities o set
  official_proposal_id=p.id,
  value=p.total_contract_value,
  expected_close_at=p.expected_close_at,
  forecast_category=p.forecast_category,
  probability=p.probability
from public.sales_proposals p
where p.opportunity_id=o.id and p.is_official and p.is_current_version;

-- Viewer continua somente leitura; owner/admin/member podem operar catálogo, propostas e receita.
drop policy if exists products_write on public.products;
drop policy if exists sales_proposals_write on public.sales_proposals;
drop policy if exists sales_proposal_items_write on public.sales_proposal_items;
drop policy if exists revenue_entries_write on public.revenue_entries;
create policy products_write on public.products for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy sales_proposals_write on public.sales_proposals for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy sales_proposal_items_write on public.sales_proposal_items for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy revenue_entries_write on public.revenue_entries for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));

drop function if exists public.save_sales_proposal(uuid,uuid,uuid,text,text,numeric,date,text,text,jsonb);
drop function if exists public.save_sales_proposal(uuid,uuid,uuid,text,text,numeric,date,date,date,date,integer,boolean,date,text,text,text,jsonb);
create function public.save_sales_proposal(
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

  insert into public.sales_proposal_items(organization_id,proposal_id,product_id,item_order,name,description,quantity,unit_price,discount_percent,tax_rate,billing_type,billing_interval,line_subtotal,line_discount,line_tax,line_total,recurring_monthly_total)
  select p_organization_id,v_id,case when exists(select 1 from public.products pr where pr.id=x.product_id and pr.organization_id=p_organization_id) then x.product_id else null end,x.item_order,left(trim(x.name),250),left(coalesce(x.description,''),4000),greatest(0.01,coalesce(x.quantity,1)),greatest(0,coalesce(x.unit_price,0)),least(100,greatest(0,coalesce(x.discount_percent,0))),greatest(0,coalesce(x.tax_rate,0)),case when x.billing_type='recurring' then 'recurring' else 'one_time' end,case when x.billing_interval in ('month','quarter','year') then x.billing_interval else null end,
    round(greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0)),2),
    round(greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0))*least(100,greatest(0,coalesce(x.discount_percent,0)))/100,2),
    round((greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0))*(1-least(100,greatest(0,coalesce(x.discount_percent,0)))/100))*greatest(0,coalesce(x.tax_rate,0))/100,2),
    round((greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0))*(1-least(100,greatest(0,coalesce(x.discount_percent,0)))/100))*(1+greatest(0,coalesce(x.tax_rate,0))/100),2),
    case when x.billing_type='recurring' then round(((greatest(0.01,coalesce(x.quantity,1))*greatest(0,coalesce(x.unit_price,0))*(1-least(100,greatest(0,coalesce(x.discount_percent,0)))/100))*(1+greatest(0,coalesce(x.tax_rate,0))/100)) * case when x.billing_interval='year' then 1.0/12 when x.billing_interval='quarter' then 1.0/3 else 1 end,2) else 0 end
  from jsonb_to_recordset(p_items) as x(product_id uuid,item_order integer,name text,description text,quantity numeric,unit_price numeric,discount_percent numeric,tax_rate numeric,billing_type text,billing_interval text);

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
  insert into public.sales_proposal_items(organization_id,proposal_id,product_id,item_order,name,description,quantity,unit_price,discount_percent,tax_rate,billing_type,billing_interval,line_subtotal,line_discount,line_tax,line_total,recurring_monthly_total)
  select organization_id,v_id,product_id,item_order,name,description,quantity,unit_price,discount_percent,tax_rate,billing_type,billing_interval,line_subtotal,line_discount,line_tax,line_total,recurring_monthly_total from public.sales_proposal_items where proposal_id=p_proposal_id;
  update public.sales_proposals set is_current_version=false,is_official=false,superseded_by_id=v_id where id=v_source.id;
  update public.sales_proposals set is_current_version=true,is_official=v_was_official where id=v_id returning * into v_new;
  if v_was_official then
    update public.leads set value=v_new.total_contract_value,expected_close_at=v_new.expected_close_at where id=v_new.lead_id;
    update public.opportunities set official_proposal_id=v_id,value=v_new.total_contract_value,expected_close_at=v_new.expected_close_at,forecast_category=v_new.forecast_category,probability=v_new.probability where id=v_source.opportunity_id;
  end if;
  return v_id;
end; $$;

create or replace function public.set_official_sales_proposal(p_organization_id uuid,p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_proposal public.sales_proposals;
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_proposal from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
  if v_proposal.id is null then raise exception 'Proposta não encontrada'; end if;
  if not v_proposal.is_current_version then raise exception 'Somente a revisão vigente pode ser oficial'; end if;
  if v_proposal.status in ('rejected','expired','cancelled') then raise exception 'Proposta encerrada não pode ser oficial'; end if;
  if exists(select 1 from public.opportunities o where o.id=v_proposal.opportunity_id and (o.status='won' or o.closed_won_at is not null)) then raise exception 'A proposta oficial de um negócio ganho não pode ser substituída'; end if;
  update public.sales_proposals set is_official=false where organization_id=p_organization_id and lead_id=v_proposal.lead_id and is_official;
  update public.sales_proposals set is_official=true where id=p_proposal_id returning * into v_proposal;
  update public.leads set value=v_proposal.total_contract_value,expected_close_at=v_proposal.expected_close_at where id=v_proposal.lead_id;
  update public.opportunities set official_proposal_id=v_proposal.id,value=v_proposal.total_contract_value,expected_close_at=v_proposal.expected_close_at,forecast_category=v_proposal.forecast_category,probability=v_proposal.probability where id=v_proposal.opportunity_id;
  return v_proposal.id;
end; $$;

create or replace function public.reassign_official_sales_proposal_v10044(p_organization_id uuid,p_lead_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_candidate public.sales_proposals; v_stage_probability numeric:=0;
begin
  select * into v_candidate
  from public.sales_proposals
  where organization_id=p_organization_id and lead_id=p_lead_id and is_current_version
    and status not in ('rejected','expired','cancelled') and closed_won_at is null
  order by case status when 'accepted' then 5 when 'viewed' then 4 when 'sent' then 3 when 'draft' then 2 else 0 end desc, updated_at desc, version desc
  limit 1;
  if v_candidate.id is not null then
    update public.sales_proposals set is_official=true where id=v_candidate.id;
    update public.leads set value=v_candidate.total_contract_value,expected_close_at=v_candidate.expected_close_at where id=p_lead_id;
    update public.opportunities set official_proposal_id=v_candidate.id,value=v_candidate.total_contract_value,expected_close_at=v_candidate.expected_close_at,forecast_category=v_candidate.forecast_category,probability=v_candidate.probability where id=v_candidate.opportunity_id;
    return v_candidate.id;
  end if;
  select coalesce(ps.probability,0) into v_stage_probability
  from public.opportunities o left join public.pipeline_stages ps on ps.id=o.stage_id
  where o.lead_id=p_lead_id and o.organization_id=p_organization_id limit 1;
  update public.leads set value=0 where id=p_lead_id and organization_id=p_organization_id;
  update public.opportunities set official_proposal_id=null,value=0,forecast_category='pipeline',probability=coalesce(v_stage_probability,0) where lead_id=p_lead_id and organization_id=p_organization_id;
  return null;
end; $$;

create or replace function public.set_sales_proposal_status(p_organization_id uuid,p_proposal_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_proposal public.sales_proposals; v_now timestamptz:=now(); v_proposal_stage uuid; v_allowed boolean:=false; v_was_official boolean:=false;
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_status not in ('draft','sent','viewed','accepted','rejected','expired','cancelled') then raise exception 'Status inválido'; end if;
  select * into v_proposal from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
  if v_proposal.id is null then raise exception 'Proposta não encontrada'; end if;
  if not v_proposal.is_current_version then raise exception 'Altere apenas a revisão vigente'; end if;
  if v_proposal.closed_won_at is not null or exists(select 1 from public.opportunities o where o.id=v_proposal.opportunity_id and (o.status='won' or o.closed_won_at is not null)) then raise exception 'O status de uma proposta vinculada a negócio ganho não pode ser alterado'; end if;
  if v_proposal.status=p_status then return v_proposal.id; end if;
  v_allowed := (v_proposal.status='draft' and p_status in ('sent','cancelled'))
    or (v_proposal.status='sent' and p_status in ('viewed','accepted','rejected','expired','cancelled'))
    or (v_proposal.status='viewed' and p_status in ('accepted','rejected','expired','cancelled'))
    or (v_proposal.status='accepted' and p_status='cancelled');
  if not v_allowed then raise exception 'Transição de status inválida'; end if;
  v_was_official:=v_proposal.is_official;

  if p_status='accepted' then
    perform public.set_official_sales_proposal(p_organization_id,p_proposal_id);
  end if;
  update public.sales_proposals set status=p_status,
    sent_at=case when p_status in ('sent','viewed') then coalesce(sent_at,v_now) else sent_at end,
    viewed_at=case when p_status='viewed' then v_now else viewed_at end,
    accepted_at=case when p_status='accepted' then v_now else accepted_at end,
    rejected_at=case when p_status='rejected' then v_now else rejected_at end,
    is_official=case when p_status in ('rejected','expired','cancelled') then false else is_official end,
    forecast_category=case when p_status='accepted' then 'commit' when p_status in ('rejected','expired','cancelled') then 'omitted' else forecast_category end,
    probability=case when p_status='accepted' then 100 when p_status in ('rejected','expired','cancelled') then 0 else probability end
  where id=p_proposal_id returning * into v_proposal;

  if p_status='sent' then
    select id into v_proposal_stage from public.pipeline_stages where organization_id=p_organization_id and lower(name) like '%proposta%' order by stage_order limit 1;
    if v_proposal_stage is not null then update public.leads set stage_id=v_proposal_stage where id=v_proposal.lead_id and status='active'; end if;
    insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
    values(p_organization_id,v_proposal.lead_id,'note','Proposta enviada — '||v_proposal.proposal_number,v_proposal.title,v_now,v_proposal.owner_id,'system',v_proposal.id::text);
  elsif p_status='accepted' then
    update public.leads set value=v_proposal.total_contract_value,expected_close_at=v_proposal.expected_close_at where id=v_proposal.lead_id;
    update public.opportunities set official_proposal_id=v_proposal.id,value=v_proposal.total_contract_value,expected_close_at=v_proposal.expected_close_at,forecast_category='commit',probability=100 where id=v_proposal.opportunity_id;
    insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
    values(p_organization_id,v_proposal.lead_id,'note','Aceite registrado — '||v_proposal.proposal_number,'Aceite comercial registrado. Fechamento e reconhecimento de receita permanecem pendentes.',v_now,v_proposal.owner_id,'system',v_proposal.id::text);
  elsif p_status in ('rejected','expired','cancelled') and v_was_official then
    perform public.reassign_official_sales_proposal_v10044(p_organization_id,v_proposal.lead_id);
  end if;
  return v_proposal.id;
end; $$;

create or replace function public.close_opportunity_from_proposal(p_organization_id uuid,p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_proposal public.sales_proposals; v_now timestamptz:=now(); v_won_stage uuid; v_due timestamptz;
begin
  if auth.uid() is null or not public.can_write_organization(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_proposal from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
  if v_proposal.id is null then raise exception 'Proposta não encontrada'; end if;
  if not v_proposal.is_current_version or not v_proposal.is_official or v_proposal.status<>'accepted' then raise exception 'Aceite e oficialize a revisão vigente antes de fechar'; end if;
  if v_proposal.closed_won_at is not null then return v_proposal.id; end if;
  select id into v_won_stage from public.pipeline_stages where organization_id=p_organization_id and is_won=true order by stage_order limit 1;
  update public.sales_proposals set forecast_category='closed',probability=100,closed_won_at=v_now where id=v_proposal.id returning * into v_proposal;
  update public.leads set status='won',stage_id=coalesce(v_won_stage,stage_id),value=v_proposal.total_contract_value where id=v_proposal.lead_id;
  update public.opportunities set status='won',stage_id=coalesce(v_won_stage,stage_id),value=v_proposal.total_contract_value,forecast_category='closed',probability=100,official_proposal_id=v_proposal.id,closed_won_at=v_now where id=v_proposal.opportunity_id;
  insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
  values(p_organization_id,v_proposal.lead_id,'note','Oportunidade ganha — '||v_proposal.proposal_number,'Contrato confirmado. Receita ainda deve ser reconhecida na competência correta.',v_now,v_proposal.owner_id,'system',v_proposal.id::text);
  v_due:=coalesce(v_proposal.post_sale_start_at::timestamptz,v_now);
  insert into public.activities(organization_id,lead_id,activity_type,title,description,due_at,assigned_to,source_type,source_id)
  values(p_organization_id,v_proposal.lead_id,'followup','Iniciar pós-venda — '||coalesce(nullif(v_proposal.post_sale_cadence_name,''),'Onboarding padrão'),'Cadência criada após o fechamento; a data pode ser ajustada.',v_due,v_proposal.owner_id,'system',v_proposal.id::text);
  return v_proposal.id;
end; $$;

create or replace function public.protect_sales_proposal_history_v10044()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_setting('realtalent.proposal_revision',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' and old.is_official then raise exception 'A proposta oficial não pode ser excluída'; end if;
  if old.closed_won_at is not null or exists(select 1 from public.opportunities o where o.id=old.opportunity_id and (o.status='won' or o.closed_won_at is not null)) then
    raise exception 'Propostas vinculadas a negócio ganho são imutáveis';
  end if;
  if not old.is_current_version then raise exception 'Revisões históricas são imutáveis'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

drop trigger if exists protect_sales_proposal_history_v10044 on public.sales_proposals;
create trigger protect_sales_proposal_history_v10044 before update or delete on public.sales_proposals
for each row execute function public.protect_sales_proposal_history_v10044();

grant execute on function public.save_sales_proposal(uuid,uuid,uuid,text,text,numeric,date,date,date,date,integer,boolean,date,text,text,text,jsonb) to authenticated;
grant execute on function public.create_sales_proposal_revision(uuid,uuid) to authenticated;
grant execute on function public.set_official_sales_proposal(uuid,uuid) to authenticated;
grant execute on function public.set_sales_proposal_status(uuid,uuid,text) to authenticated;
grant execute on function public.close_opportunity_from_proposal(uuid,uuid) to authenticated;

commit;
