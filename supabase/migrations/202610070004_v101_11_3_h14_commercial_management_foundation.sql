-- V101.11.3-H14 — Commercial Management Foundation
-- Product taxonomy + team/workspace goal scopes.

alter table public.products add column if not exists commercial_type text;
update public.products set commercial_type = case
  when lower(category) like '%implant%' then 'implementation'
  when lower(category) like '%trein%' then 'training'
  when lower(category) like '%consult%' then 'consulting'
  when lower(category) like '%suporte%' then 'support'
  when lower(category) like '%licen%' then 'license'
  when lower(category) like '%software%' or lower(category) like '%crm%' then 'software'
  when product_kind = 'product' then 'software' else 'service' end
where commercial_type is null;

do $$ begin
  alter table public.products add constraint products_commercial_type_h14_check check (commercial_type is null or commercial_type in ('software','service','subscription','license','addon','bundle','training','consulting','implementation','support','other'));
exception when duplicate_object then null; end $$;

alter table public.goals
  add column if not exists scope text not null default 'workspace',
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists team_name text not null default '';

update public.goals set scope = case when user_id is not null then 'user' else 'workspace' end where scope not in ('workspace','team','user') or scope is null;

do $$ begin
  alter table public.goals add constraint goals_scope_h14_check check (scope in ('workspace','team','user'));
exception when duplicate_object then null; end $$;

create index if not exists goals_org_scope_team_h14_idx on public.goals(organization_id,scope,team_id,period_start,period_end);
comment on column public.products.commercial_type is 'Taxonomia comercial controlada usada por catálogo, propostas e analytics.';
comment on column public.goals.scope is 'Escopo canônico da meta: workspace, team ou user.';
comment on column public.goals.team_id is 'Equipe responsável quando scope=team.';
