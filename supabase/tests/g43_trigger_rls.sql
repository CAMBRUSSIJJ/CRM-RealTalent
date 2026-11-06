-- Non-production, empty-postgres fixture for G4.3 schema/RLS contract.
-- Run with: psql -v ON_ERROR_STOP=1 -f supabase/tests/g43_trigger_rls.sql
create schema auth;
create role anon nologin;
create role authenticated nologin;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.organizations(id uuid primary key);
create table public.organization_members(organization_id uuid not null,user_id uuid not null,role text);
create table public.prospecting_leads(
 id uuid primary key,organization_id uuid not null references public.organizations,
 created_by uuid references auth.users
);
create table public.leads(
 id uuid primary key,organization_id uuid not null references public.organizations,
 owner_id uuid references auth.users,tags text[] not null default '{}'
);
create function public.rt_access_action_allowed(org uuid,resource text,action text)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organization_members where organization_id=org and user_id=auth.uid()) $$;
create function public.rt_access_scope_allows(org uuid,resource text,owner uuid,team uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organization_members where organization_id=org and user_id=auth.uid())
  and coalesce(owner,auth.uid())=auth.uid() $$;

grant usage on schema public to authenticated;
grant select on public.organizations,public.organization_members,public.prospecting_leads,public.leads to authenticated;
insert into auth.users(id) values
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222');
insert into public.organizations(id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.organization_members(organization_id,user_id,role) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');
insert into public.prospecting_leads(id,organization_id,created_by) values
('aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
insert into public.leads(id,organization_id,owner_id,tags) values
('aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
 array['garimpo-id:aaaaaaaa-1111-4111-8111-111111111111']),
('bbbbbbbb-4444-4444-8444-444444444444','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
 array['garimpo-id:bbbbbbbb-2222-4222-8222-222222222222']);

\ir ../migrations/202611060001_g43_trigger_events_review_audit.sql

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
-- A valid source-bound candidate, only initially pending.
insert into public.prospecting_trigger_events(
 id,organization_id,prospect_id,category,event_label,
 source_url,source_excerpt,source_quote,hypothesis,review_status
) values (
 '99999999-9999-4999-8999-999999999999',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-1111-4111-8111-111111111111',
 'transition','Nova direção anunciada',
 'https://example.org/comunicado',
 'A Escola Aurora anunciou uma nova direção para o próximo ano letivo.',
 'A Escola Aurora anunciou uma nova direção',
 'A instituição poderá revisar suas prioridades de treinamento.',
 'needs_review'
);
do $$
declare allowed boolean:=false;
begin
  begin
    insert into public.prospecting_trigger_events(
      organization_id,prospect_id,category,event_label,source_url,source_excerpt,source_quote
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'bbbbbbbb-2222-4222-8222-222222222222','transition','Troca de diretoria',
      'https://example.org/news',
      'A empresa anunciou uma nova diretoria durante uma assembleia.',
      'A empresa anunciou uma nova diretoria');
    allowed:=true;
  exception when others then null;
  end;
  if allowed then raise exception 'ERROR: cross-workspace insert was allowed';end if;
end $$;

do $$
declare allowed boolean:=false;
begin
  begin
    update public.prospecting_trigger_events set review_status='approved' where id='99999999-9999-4999-8999-999999999999';
    allowed:=true;
  exception when others then null;
  end;
  if allowed then raise exception 'ERROR: review without source confirmation was allowed';end if;
end $$;

update public.prospecting_trigger_events
set review_status='approved',source_confirmed=true,reviewer_note='Fonte pública conferida.'
where id='99999999-9999-4999-8999-999999999999';
do $$ begin
  if (select count(*) from public.prospecting_trigger_reviews
      where event_id='99999999-9999-4999-8999-999999999999')<>1
  then raise exception 'ERROR: audit event missing';end if;
end $$;

-- A genuine Garimpo tag authorizes linking; the other workspace lead must not.
do $$
declare allowed boolean:=false;
begin
  begin
    update public.prospecting_trigger_events set crm_lead_id='bbbbbbbb-4444-4444-8444-444444444444'
      where id='99999999-9999-4999-8999-999999999999';
    allowed:=true;
  exception when others then null;
  end;
  if allowed then raise exception 'ERROR: foreign deal link was allowed';end if;
end $$;
update public.prospecting_trigger_events set crm_lead_id='aaaaaaaa-3333-4333-8333-333333333333'
where id='99999999-9999-4999-8999-999999999999';

-- Terminal review state and its evidence are immutable.
do $$
declare allowed boolean:=false;
begin
  begin
    update public.prospecting_trigger_events set source_quote='A empresa anunciou demissões'
      where id='99999999-9999-4999-8999-999999999999';
    allowed:=true;
  exception when others then null;
  end;
  if allowed then raise exception 'ERROR: source text changed after review';end if;
end $$;

do $$
declare allowed boolean:=false;
begin
  begin
    insert into public.prospecting_trigger_reviews(
      organization_id,event_id,actor_id,decision,source_confirmed
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '99999999-9999-4999-8999-999999999999',
      '11111111-1111-4111-8111-111111111111','approved',true);
    allowed:=true;
  exception when others then null;
  end;
  if allowed then raise exception 'ERROR: user inserted an audit event';end if;
end $$;

-- Another authenticated organization must not be able to read this data.
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select count(*) from public.prospecting_trigger_events)>0
  then raise exception 'ERROR: cross-organization trigger leak'; end if;
  if (select count(*) from public.prospecting_trigger_reviews)>0
  then raise exception 'ERROR: cross-organization audit leak'; end if;
end $$;
select 'G4.3 schema, review audit, RLS isolation and link tests PASSED' as result;
