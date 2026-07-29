begin;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text not null default '',
  description text not null default '',
  category text not null default '',
  active boolean not null default true,
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  billing_type text not null default 'one_time' check (billing_type in ('one_time','recurring')),
  billing_interval text check (billing_interval is null or billing_interval in ('month','quarter','year')),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_group_id uuid not null default gen_random_uuid(),
  version integer not null default 1 check (version >= 1),
  proposal_number text not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','rejected','expired','cancelled')),
  forecast_category text not null default 'pipeline' check (forecast_category in ('pipeline','best_case','commit','closed','omitted')),
  probability numeric(5,2) not null default 0 check (probability between 0 and 100),
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  recurring_monthly_total numeric(14,2) not null default 0,
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  owner_id uuid references public.profiles(id) on delete set null,
  notes text not null default '',
  terms text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, proposal_number),
  unique (proposal_group_id, version)
);

create table if not exists public.sales_proposal_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid not null references public.sales_proposals(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  item_order integer not null default 1,
  name text not null,
  description text not null default '',
  quantity numeric(14,4) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  discount_percent numeric(7,4) not null default 0 check (discount_percent between 0 and 100),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  billing_type text not null default 'one_time' check (billing_type in ('one_time','recurring')),
  billing_interval text check (billing_interval is null or billing_interval in ('month','quarter','year')),
  line_subtotal numeric(14,2) not null default 0,
  line_discount numeric(14,2) not null default 0,
  line_tax numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  recurring_monthly_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revenue_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid references public.sales_proposals(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  revenue_type text not null check (revenue_type in ('one_time','recurring')),
  status text not null default 'recognized' check (status in ('forecast','recognized','cancelled')),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  recurring_monthly_amount numeric(14,2) not null default 0 check (recurring_monthly_amount >= 0),
  recognized_at timestamptz not null default now(),
  description text not null default '',
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_org_active_idx on public.products(organization_id,active,name);
create unique index if not exists products_org_sku_unique_idx on public.products(organization_id,lower(sku)) where trim(sku) <> '';
create index if not exists sales_proposals_org_status_idx on public.sales_proposals(organization_id,status,updated_at desc);
create index if not exists sales_proposals_org_forecast_idx on public.sales_proposals(organization_id,forecast_category,valid_until);
create index if not exists sales_proposals_lead_idx on public.sales_proposals(lead_id,updated_at desc);
create index if not exists sales_proposal_items_proposal_idx on public.sales_proposal_items(proposal_id,item_order);
create index if not exists revenue_entries_org_time_idx on public.revenue_entries(organization_id,recognized_at desc);
create index if not exists revenue_entries_proposal_idx on public.revenue_entries(proposal_id);

alter table public.products enable row level security;
alter table public.sales_proposals enable row level security;
alter table public.sales_proposal_items enable row level security;
alter table public.revenue_entries enable row level security;

create policy products_select on public.products for select to authenticated using (public.is_organization_member(organization_id));
create policy products_write on public.products for all to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy sales_proposals_select on public.sales_proposals for select to authenticated using (public.is_organization_member(organization_id));
create policy sales_proposals_write on public.sales_proposals for all to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy sales_proposal_items_select on public.sales_proposal_items for select to authenticated using (public.is_organization_member(organization_id));
create policy sales_proposal_items_write on public.sales_proposal_items for all to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy revenue_entries_select on public.revenue_entries for select to authenticated using (public.is_organization_member(organization_id));
create policy revenue_entries_write on public.revenue_entries for all to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));

create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger sales_proposals_touch before update on public.sales_proposals for each row execute function public.touch_updated_at();
create trigger sales_proposal_items_touch before update on public.sales_proposal_items for each row execute function public.touch_updated_at();
create trigger revenue_entries_touch before update on public.revenue_entries for each row execute function public.touch_updated_at();

create or replace function public.next_sales_proposal_number(p_organization_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_year text := to_char(now(),'YYYY'); v_next integer;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  select coalesce(max(nullif(regexp_replace(proposal_number,'^PROP-[0-9]{4}-','','g'),'')::integer),0)+1 into v_next
    from public.sales_proposals where organization_id=p_organization_id and proposal_number like 'PROP-'||v_year||'-%';
  return 'PROP-'||v_year||'-'||lpad(v_next::text,3,'0');
end; $$;

create or replace function public.save_sales_proposal(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_lead_id uuid,
  p_title text,
  p_forecast_category text,
  p_probability numeric,
  p_valid_until date,
  p_notes text,
  p_terms text,
  p_items jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_lead public.leads; v_current public.sales_proposals; v_number text; v_group uuid; v_version integer; v_status text; v_owner uuid;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_lead from public.leads where id=p_lead_id and organization_id=p_organization_id;
  if v_lead.id is null then raise exception 'Lead não encontrado'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um item'; end if;
  if p_forecast_category not in ('pipeline','best_case','commit','closed','omitted') then raise exception 'Categoria de forecast inválida'; end if;

  if p_proposal_id is null then
    v_id := gen_random_uuid(); v_group := gen_random_uuid(); v_version := 1; v_status := 'draft'; v_owner := v_lead.owner_id;
    v_number := public.next_sales_proposal_number(p_organization_id);
    insert into public.sales_proposals(id,organization_id,proposal_group_id,version,proposal_number,lead_id,opportunity_id,company_id,contact_id,title,status,forecast_category,probability,valid_until,owner_id,notes,terms)
    values(v_id,p_organization_id,v_group,v_version,v_number,p_lead_id,v_lead.opportunity_id,v_lead.company_id,v_lead.primary_contact_id,left(trim(p_title),250),v_status,p_forecast_category,least(100,greatest(0,coalesce(p_probability,0))),p_valid_until,v_owner,left(coalesce(p_notes,''),10000),left(coalesce(p_terms,''),20000));
  else
    select * into v_current from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
    if v_current.id is null then raise exception 'Proposta não encontrada'; end if;
    if v_current.status in ('accepted','cancelled') then raise exception 'Crie uma revisão para alterar esta proposta'; end if;
    v_id := v_current.id;
    update public.sales_proposals set lead_id=p_lead_id,opportunity_id=v_lead.opportunity_id,company_id=v_lead.company_id,contact_id=v_lead.primary_contact_id,title=left(trim(p_title),250),forecast_category=p_forecast_category,probability=least(100,greatest(0,coalesce(p_probability,0))),valid_until=p_valid_until,notes=left(coalesce(p_notes,''),10000),terms=left(coalesce(p_terms,''),20000) where id=v_id;
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

  update public.sales_proposals p set subtotal=q.subtotal,discount_total=q.discount_total,tax_total=q.tax_total,total=q.total,recurring_monthly_total=q.mrr
  from (select proposal_id,sum(line_subtotal) subtotal,sum(line_discount) discount_total,sum(line_tax) tax_total,sum(line_total) total,sum(recurring_monthly_total) mrr from public.sales_proposal_items where proposal_id=v_id group by proposal_id) q where p.id=q.proposal_id;
  update public.leads set value=(select total from public.sales_proposals where id=v_id),expected_close_at=coalesce(p_valid_until,expected_close_at) where id=p_lead_id;
  update public.opportunities set value=(select total from public.sales_proposals where id=v_id),expected_close_at=coalesce(p_valid_until,expected_close_at) where id=v_lead.opportunity_id;
  return v_id;
end; $$;

create or replace function public.create_sales_proposal_revision(p_organization_id uuid,p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_source public.sales_proposals; v_id uuid:=gen_random_uuid(); v_version integer;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  select * into v_source from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id;
  if v_source.id is null then raise exception 'Proposta não encontrada'; end if;
  select coalesce(max(version),0)+1 into v_version from public.sales_proposals where proposal_group_id=v_source.proposal_group_id;
  insert into public.sales_proposals(id,organization_id,proposal_group_id,version,proposal_number,lead_id,opportunity_id,company_id,contact_id,title,status,forecast_category,probability,currency,subtotal,discount_total,tax_total,total,recurring_monthly_total,valid_until,owner_id,notes,terms)
  select v_id,organization_id,proposal_group_id,v_version,proposal_number,lead_id,opportunity_id,company_id,contact_id,title,'draft',case when forecast_category='closed' then 'best_case' else forecast_category end,case when probability=100 then 60 else probability end,currency,subtotal,discount_total,tax_total,total,recurring_monthly_total,valid_until,owner_id,notes,terms from public.sales_proposals where id=p_proposal_id;
  insert into public.sales_proposal_items(organization_id,proposal_id,product_id,item_order,name,description,quantity,unit_price,discount_percent,tax_rate,billing_type,billing_interval,line_subtotal,line_discount,line_tax,line_total,recurring_monthly_total)
  select organization_id,v_id,product_id,item_order,name,description,quantity,unit_price,discount_percent,tax_rate,billing_type,billing_interval,line_subtotal,line_discount,line_tax,line_total,recurring_monthly_total from public.sales_proposal_items where proposal_id=p_proposal_id;
  return v_id;
end; $$;

create or replace function public.set_sales_proposal_status(p_organization_id uuid,p_proposal_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_proposal public.sales_proposals; v_now timestamptz:=now(); v_won_stage uuid; v_proposal_stage uuid; v_one_time numeric;
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_status not in ('draft','sent','viewed','accepted','rejected','expired','cancelled') then raise exception 'Status inválido'; end if;
  select * into v_proposal from public.sales_proposals where id=p_proposal_id and organization_id=p_organization_id for update;
  if v_proposal.id is null then raise exception 'Proposta não encontrada'; end if;
  if v_proposal.status = p_status then return v_proposal.id; end if;
  update public.sales_proposals set status=p_status,
    sent_at=case when p_status in ('sent','viewed') then coalesce(sent_at,v_now) else sent_at end,
    viewed_at=case when p_status='viewed' then v_now else viewed_at end,
    accepted_at=case when p_status='accepted' then v_now else accepted_at end,
    rejected_at=case when p_status='rejected' then v_now else rejected_at end,
    forecast_category=case when p_status='accepted' then 'closed' when p_status in ('rejected','expired','cancelled') then 'omitted' else forecast_category end,
    probability=case when p_status='accepted' then 100 when p_status in ('rejected','expired','cancelled') then 0 else probability end
  where id=p_proposal_id returning * into v_proposal;

  if p_status='sent' then
    select id into v_proposal_stage from public.pipeline_stages where organization_id=p_organization_id and lower(name) like '%proposta%' order by stage_order limit 1;
    if v_proposal_stage is not null then update public.leads set stage_id=v_proposal_stage,value=v_proposal.total where id=v_proposal.lead_id and status='active'; end if;
    insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
    values(p_organization_id,v_proposal.lead_id,'note','Proposta enviada — '||v_proposal.proposal_number,v_proposal.title,v_now,v_proposal.owner_id,'system',v_proposal.id::text);
  elsif p_status='accepted' then
    select id into v_won_stage from public.pipeline_stages where organization_id=p_organization_id and is_won=true order by stage_order limit 1;
    update public.leads set status='won',stage_id=coalesce(v_won_stage,stage_id),value=v_proposal.total where id=v_proposal.lead_id;
    update public.opportunities set status='won',stage_id=coalesce(v_won_stage,stage_id),value=v_proposal.total where id=v_proposal.opportunity_id;
    delete from public.revenue_entries where proposal_id=v_proposal.id;
    select coalesce(sum(line_total),0) into v_one_time from public.sales_proposal_items where proposal_id=v_proposal.id and billing_type='one_time';
    if v_one_time>0 then insert into public.revenue_entries(organization_id,proposal_id,lead_id,opportunity_id,revenue_type,status,amount,recognized_at,description,owner_id) values(p_organization_id,v_proposal.id,v_proposal.lead_id,v_proposal.opportunity_id,'one_time','recognized',v_one_time,v_now,v_proposal.proposal_number||' · receita única',v_proposal.owner_id); end if;
    if v_proposal.recurring_monthly_total>0 then insert into public.revenue_entries(organization_id,proposal_id,lead_id,opportunity_id,revenue_type,status,recurring_monthly_amount,recognized_at,description,owner_id) values(p_organization_id,v_proposal.id,v_proposal.lead_id,v_proposal.opportunity_id,'recurring','recognized',v_proposal.recurring_monthly_total,v_now,v_proposal.proposal_number||' · receita recorrente mensal',v_proposal.owner_id); end if;
    insert into public.activities(organization_id,lead_id,activity_type,title,description,completed_at,assigned_to,source_type,source_id)
    values(p_organization_id,v_proposal.lead_id,'note','Proposta aceita — '||v_proposal.proposal_number,'Valor fechado: R$ '||v_proposal.total::text||' · MRR: R$ '||v_proposal.recurring_monthly_total::text,v_now,v_proposal.owner_id,'system',v_proposal.id::text);
  end if;
  return v_proposal.id;
end; $$;

grant execute on function public.next_sales_proposal_number(uuid) to authenticated;
grant execute on function public.save_sales_proposal(uuid,uuid,uuid,text,text,numeric,date,text,text,jsonb) to authenticated;
grant execute on function public.create_sales_proposal_revision(uuid,uuid) to authenticated;
grant execute on function public.set_sales_proposal_status(uuid,uuid,text) to authenticated;

commit;
