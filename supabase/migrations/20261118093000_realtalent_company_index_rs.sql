-- RealTalent Intelligence pilot. Public company registration only; no personal contacts.
-- Additive migration; import separately from the Receita Federal official monthly CNPJ snapshot.
create table if not exists public.realtalent_company_index (
  cnpj text primary key check (cnpj ~ '^[0-9]{14}$'),
  legal_name text not null,
  trade_name text not null default '',
  name_search text not null,
  uf text not null check (uf = 'RS'),
  municipality_code text not null,
  city text not null,
  city_search text not null,
  main_cnae text not null check (main_cnae ~ '^[0-9]{7}$'),
  secondary_cnaes text[] not null default '{}',
  status text not null check (status in ('01','02','03','04','08')),
  opened_on date,
  headquarters boolean not null default true,
  source_month date not null,
  source_url text not null default 'https://www.gov.br/receitafederal/dados',
  imported_at timestamptz not null default now()
);
create index if not exists realtalent_ci_location_idx
  on public.realtalent_company_index (uf, city_search, status, main_cnae);
create index if not exists realtalent_ci_cnae_idx
  on public.realtalent_company_index (uf, main_cnae, status);
create index if not exists realtalent_ci_secondary_idx
  on public.realtalent_company_index using gin (secondary_cnaes);
alter table public.realtalent_company_index enable row level security;
revoke all on public.realtalent_company_index from anon, authenticated;
grant select on public.realtalent_company_index to authenticated;
-- The index contains public organizational attributes, no phones, emails or partner identities.
-- Only users with an active CRM membership can read it (even via direct Data API calls).
create policy realtalent_ci_member_read on public.realtalent_company_index
  for select to authenticated using (
    exists (select 1 from public.organization_members m
            where m.user_id = (select auth.uid()))
  );

create or replace function public.realtalent_company_index_search(
  p_org uuid,
  p_uf text default 'RS',
  p_city text default null,
  p_cnae text default null,
  p_name text default null,
  p_only_active boolean default true,
  p_limit integer default 30,
  p_offset integer default 0
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  page_size integer := least(greatest(coalesce(p_limit,30),1),100);
  page_offset integer := greatest(coalesce(p_offset,0),0);
  payload jsonb;
  n integer;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
  ) then
    raise exception 'workspace_forbidden' using errcode = '42501';
  end if;
  if p_uf <> 'RS' or page_offset > 10000 or
     (p_city is not null and length(p_city) > 100) or
     (p_name is not null and length(p_name) > 120) or
     (p_cnae is not null and p_cnae !~ '^[0-9]{2,7}$')
  then
    raise exception 'invalid_index_filter' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
    into payload
  from (
    select cnpj, legal_name, trade_name, uf, municipality_code, city,
           main_cnae, secondary_cnaes, status, opened_on,
           headquarters, source_month, source_url
    from public.realtalent_company_index c
    where c.uf = p_uf
      and (not p_only_active or c.status = '02')
      and (nullif(p_city,'') is null or c.city_search = p_city)
      and (nullif(p_name,'') is null or position(p_name in c.name_search) > 0)
      and (nullif(p_cnae,'') is null
           or c.main_cnae like p_cnae || '%'
           or exists (select 1 from unnest(c.secondary_cnaes) s
                      where s like p_cnae || '%'))
    order by coalesce(nullif(c.trade_name,''),c.legal_name), c.cnpj
    limit page_size + 1 offset page_offset
  ) q;
  n := jsonb_array_length(payload);
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb)
              from jsonb_array_elements(payload) with ordinality e(value,ordinality)
              where e.ordinality <= page_size),
    'has_more', n > page_size,
    'limit', page_size,
    'offset', page_offset
  );
end $$;
revoke all on function public.realtalent_company_index_search(
  uuid,text,text,text,text,boolean,integer,integer) from public, anon;
grant execute on function public.realtalent_company_index_search(
  uuid,text,text,text,text,boolean,integer,integer) to authenticated;
