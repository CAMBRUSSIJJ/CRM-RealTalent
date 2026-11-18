-- QSA public corporate relationships, source RFB open CNPJ dataset (RS pilot).
-- Deliberately excludes CPF (even partially masked), DOB, age, phone, emails and representatives' documents.
-- This migration is additive; do not run on production until staging tests and privacy review.
create schema if not exists realtalent_internal;
revoke all on schema realtalent_internal from public, anon;
-- USAGE + SELECT are for SECURITY INVOKER RPCs only. Do NOT expose this schema
-- in the Supabase Data API "Exposed schemas" configuration.
grant usage on schema realtalent_internal to authenticated;

create table if not exists realtalent_internal.realtalent_company_qsa (
  cnpj_basic text not null check (cnpj_basic ~ '^[0-9]{8}$'),
  partner_key text not null check (partner_key ~ '^[0-9a-f]{32}$'),
  partner_name text not null check (length(partner_name) between 1 and 180),
  partner_type text not null check (partner_type in ('Pessoa jurídica','Pessoa física','Estrangeiro')),
  role_code text not null check (role_code ~ '^[0-9]{2}$'),
  role_label text not null check (length(role_label) between 1 and 140),
  joined_on date,
  source_month date not null,
  source_url text not null default 'https://www.gov.br/receitafederal/dados',
  imported_at timestamptz not null default now(),
  primary key (cnpj_basic, partner_key)
);
create index if not exists realtalent_qsa_root_role_idx
  on realtalent_internal.realtalent_company_qsa (cnpj_basic, role_code);
alter table realtalent_internal.realtalent_company_qsa enable row level security;
revoke all on realtalent_internal.realtalent_company_qsa from anon, authenticated;
grant select on realtalent_internal.realtalent_company_qsa to authenticated;

-- QSA is a shared official dataset, not private CRM contact information.
-- It can only be read by authenticated members with prospecting write access
-- and only for companies present in the prepared RS index.
create policy realtalent_qsa_member_select on realtalent_internal.realtalent_company_qsa
  for select to authenticated using (
    exists (select 1 from public.organization_members m
            where m.user_id = (select auth.uid()) and m.role in ('owner','admin','member'))
    and exists (select 1 from public.realtalent_company_index c
                where substring(c.cnpj from 1 for 8) = cnpj_basic)
  );

create or replace function public.realtalent_qsa_list(
  p_org uuid, p_cnpj text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  p_root text;
  result jsonb;
  qty integer;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','member')
  ) then
    raise exception 'workspace_forbidden' using errcode = '42501';
  end if;
  if p_cnpj !~ '^[0-9]{14}$' then
    raise exception 'invalid_cnpj' using errcode = '22023';
  end if;
  if not exists (select 1 from public.realtalent_company_index c where c.cnpj = p_cnpj) then
    raise exception 'company_not_in_index' using errcode = '22023';
  end if;
  p_root := substring(p_cnpj from 1 for 8);
  select count(*) into qty from (
    select 1 from realtalent_internal.realtalent_company_qsa q
    where q.cnpj_basic = p_root limit 51
  ) b;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into result
  from (
    select partner_name, partner_type, role_code, role_label,
           joined_on, source_month, source_url
    from realtalent_internal.realtalent_company_qsa
    where cnpj_basic = p_root
    order by role_code, partner_name, partner_key
    limit 50
  ) q;
  return jsonb_build_object('people', result, 'truncated', qty > 50,
    'company_cnpj', p_cnpj, 'source', 'Receita Federal / QSA',
    'has_records', qty > 0);
end $$;
revoke all on function public.realtalent_qsa_list(uuid,text) from public, anon;
grant execute on function public.realtalent_qsa_list(uuid,text) to authenticated;

-- Optional "QSA identificado" search filter; existing index search RPC remains intact.
create or replace function public.realtalent_company_index_search_with_qsa(
  p_org uuid,
  p_uf text default 'RS',
  p_city text default null,
  p_cnae text default null,
  p_name text default null,
  p_only_active boolean default true,
  p_limit integer default 30,
  p_offset integer default 0,
  p_headquarters boolean default null,
  p_opened_after date default null,
  p_opened_before date default null,
  p_cnae_scope text default 'any',
  p_has_qsa boolean default null
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
  if p_has_qsa is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','member')
  ) then
    raise exception 'workspace_forbidden' using errcode = '42501';
  end if;
  if p_uf <> 'RS' or page_offset > 10000 or
     p_cnae_scope not in ('any','main','secondary') or
     (p_opened_after is not null and p_opened_before is not null and p_opened_after > p_opened_before) or
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
      and (nullif(p_name,'') is null or c.cnpj = p_name or position(p_name in c.name_search) > 0)
      and (p_headquarters is null or c.headquarters = p_headquarters)
      and (p_has_qsa is null or (exists (select 1 from realtalent_internal.realtalent_company_qsa q where q.cnpj_basic = substring(c.cnpj from 1 for 8))) = p_has_qsa)
      and (p_opened_after is null or c.opened_on >= p_opened_after)
      and (p_opened_before is null or c.opened_on <= p_opened_before)
      and (nullif(p_cnae,'') is null or
           (p_cnae_scope in ('any','main') and c.main_cnae like p_cnae || '%') or
           (p_cnae_scope in ('any','secondary') and exists (
             select 1 from unnest(c.secondary_cnaes) s where s like p_cnae || '%'
           )))
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
revoke all on function public.realtalent_company_index_search_with_qsa(
  uuid,text,text,text,text,boolean,integer,integer,boolean,date,date,text,boolean
) from public, anon;
grant execute on function public.realtalent_company_index_search_with_qsa(
  uuid,text,text,text,text,boolean,integer,integer,boolean,date,date,text,boolean
) to authenticated;
