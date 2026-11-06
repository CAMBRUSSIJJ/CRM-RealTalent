-- G4.3: reviewed public-event intelligence, never direct AI-to-CRM promotion.
-- Deploy only after validating policies with distinct authenticated workspace users.
create schema if not exists rt_internal;
revoke all on schema rt_internal from public, anon, authenticated;

create table public.prospecting_trigger_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospecting_leads(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  owner_id uuid not null references auth.users(id),
  crm_lead_id uuid references public.leads(id) on delete set null,
  category text not null check (category in ('negative_experience','transition','new_awareness')),
  event_label text not null check (length(btrim(event_label)) between 7 and 160),
  source_url text not null check (length(source_url) <= 500 and source_url ~* '^https://[^/[:space:]]+\.[^/[:space:]]+'),
  source_excerpt text not null check (length(source_excerpt) between 35 and 5400),
  source_quote text not null check (length(btrim(source_quote)) between 18 and 340),
  date_quote text,
  hypothesis text not null default '',
  rationale text not null default '',
  suggested_question text not null default '',
  review_status text not null default 'needs_review' check (review_status in ('needs_review','approved','rejected')),
  source_confirmed boolean not null default false,
  reviewer_note text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  evidence_fingerprint text generated always as (md5(lower(source_url || chr(10) || source_quote))) stored,
  constraint rt_g43_quoted_source check (
    position(lower(regexp_replace(btrim(source_quote),'[[:space:]]+',' ','g'))
      in lower(regexp_replace(source_excerpt,'[[:space:]]+',' ','g'))) > 0
  ),
  constraint rt_g43_review_integrity check (
    (review_status='needs_review' and reviewed_by is null and reviewed_at is null and source_confirmed=false)
    or (review_status='approved' and reviewed_by is not null and reviewed_at is not null and source_confirmed=true)
    or (review_status='rejected' and reviewed_by is not null and reviewed_at is not null and length(btrim(reviewer_note))>=3 and source_confirmed=false)
  )
);

create unique index rt_g43_prospect_source_key
  on public.prospecting_trigger_events(organization_id,prospect_id,evidence_fingerprint);
create index rt_g43_prospect_reviews_idx
  on public.prospecting_trigger_events(organization_id,prospect_id,updated_at desc);
create index rt_g43_pipeline_signals_idx
  on public.prospecting_trigger_events(organization_id,crm_lead_id,updated_at desc)
  where review_status='approved' and crm_lead_id is not null;

create table public.prospecting_trigger_reviews (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.prospecting_trigger_events(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  source_confirmed boolean not null,
  reviewer_note text not null default '',
  decided_at timestamptz not null default now()
);
create index rt_g43_review_audit_idx on public.prospecting_trigger_reviews(event_id,decided_at desc);

create function rt_internal.g43_guard_event() returns trigger
language plpgsql security invoker set search_path = pg_catalog
as $function$
declare v_prospect_owner uuid; v_prospect_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'G4.3 requires an authenticated reviewer';
  end if;
  if tg_op='INSERT' then
    select p.organization_id,p.created_by into v_prospect_org,v_prospect_owner
    from public.prospecting_leads p where p.id=new.prospect_id;
    if not found or v_prospect_org is distinct from new.organization_id then
      raise exception 'Prospect belongs to a different workspace';
    end if;
    if new.review_status<>'needs_review' or new.source_confirmed or
      new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'AI evidence must start pending human review';
    end if;
    new.created_by:=auth.uid();
    new.owner_id:=coalesce(v_prospect_owner,auth.uid());
    new.reviewer_note:='';
    new.created_at:=now();
  else
    if row(new.id,new.organization_id,new.prospect_id,new.created_by,new.owner_id,
       new.category,new.event_label,new.source_url,new.source_excerpt,new.source_quote,
       new.date_quote,new.hypothesis,new.rationale,new.suggested_question,new.created_at)
      is distinct from
      row(old.id,old.organization_id,old.prospect_id,old.created_by,old.owner_id,
       old.category,old.event_label,old.source_url,old.source_excerpt,old.source_quote,
       old.date_quote,old.hypothesis,old.rationale,old.suggested_question,old.created_at)
    then raise exception 'G4 source evidence is immutable; create a new candidate'; end if;
    if new.review_status is distinct from old.review_status then
      if old.review_status <> 'needs_review' then
        raise exception 'Reviewed G4 decisions are immutable';
      end if;
      if new.review_status not in ('approved','rejected') then
        raise exception 'Invalid G4 review transition';
      end if;
      if new.review_status='approved' and not new.source_confirmed then
        raise exception 'Source confirmation is required before approval';
      end if;
      if new.review_status='rejected' and length(btrim(new.reviewer_note))<3 then
        raise exception 'A reason is required to reject this event';
      end if;
      new.source_confirmed:=(new.review_status='approved');
      new.reviewed_by:=auth.uid();
      new.reviewed_at:=now();
    elsif row(new.review_status,new.source_confirmed,new.reviewer_note,
              new.reviewed_by,new.reviewed_at) is distinct from
          row(old.review_status,old.source_confirmed,old.reviewer_note,
              old.reviewed_by,old.reviewed_at) then
      raise exception 'Review fields cannot be edited without a decision';
    end if;
  end if;
  -- Only an existing, same-workspace opportunity with a real Garimpo import tag
  -- can be linked. A caller cannot link a signal to an arbitrary deal.
  if new.crm_lead_id is not null and not exists (
    select 1 from public.leads l
    where l.id=new.crm_lead_id and l.organization_id=new.organization_id
      and l.tags @> array['garimpo-id:' || new.prospect_id::text]::text[]
  ) then raise exception 'CRM opportunity does not match the Garimpo candidate'; end if;
  new.updated_at:=now();
  return new;
end;
$function$;
revoke all on function rt_internal.g43_guard_event() from public,anon,authenticated;
create trigger rt_g43_guard_before_write
before insert or update on public.prospecting_trigger_events
for each row execute function rt_internal.g43_guard_event();

create function rt_internal.g43_audit_review() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $function$
begin
  if old.review_status='needs_review' and new.review_status in ('approved','rejected') then
    insert into public.prospecting_trigger_reviews
      (organization_id,event_id,actor_id,decision,source_confirmed,reviewer_note,decided_at)
    values (new.organization_id,new.id,new.reviewed_by,new.review_status,
            new.source_confirmed,new.reviewer_note,new.reviewed_at);
  end if;
  return new;
end;
$function$;
revoke all on function rt_internal.g43_audit_review() from public,anon,authenticated;
create trigger rt_g43_audit_after_review
after update on public.prospecting_trigger_events
for each row execute function rt_internal.g43_audit_review();

alter table public.prospecting_trigger_events enable row level security;
alter table public.prospecting_trigger_reviews enable row level security;

-- Prospecting editors see only entities allowed by existing action+scope rules.
-- Pipeline users see only APPROVED signals linked to a permitted CRM lead.
create policy rt_g43_trigger_select on public.prospecting_trigger_events
for select to authenticated using (
  (
    public.rt_access_action_allowed(organization_id,'prospecting','view')
    and public.rt_access_scope_allows(organization_id,'prospecting',owner_id,null)
  )
  or
  (
    review_status='approved' and crm_lead_id is not null
    and public.rt_access_action_allowed(organization_id,'pipeline','view')
    and exists (
      select 1 from public.leads l
      where l.id=crm_lead_id and l.organization_id=organization_id
        and public.rt_access_scope_allows(organization_id,'pipeline',l.owner_id,null)
    )
  )
);
create policy rt_g43_trigger_insert on public.prospecting_trigger_events
for insert to authenticated with check (
  created_by=(select auth.uid()) and review_status='needs_review'
  and public.rt_access_action_allowed(organization_id,'prospecting','create')
  and public.rt_access_scope_allows(organization_id,'prospecting',owner_id,null)
  and exists (
    select 1 from public.prospecting_leads p
    where p.id=prospect_id and p.organization_id=organization_id
  )
);
create policy rt_g43_trigger_update on public.prospecting_trigger_events
for update to authenticated using (
  public.rt_access_action_allowed(organization_id,'prospecting','edit')
  and public.rt_access_scope_allows(organization_id,'prospecting',owner_id,null)
) with check (
  public.rt_access_action_allowed(organization_id,'prospecting','edit')
  and public.rt_access_scope_allows(organization_id,'prospecting',owner_id,null)
);
-- No DELETE policy; source evidence must be retained with its review history.

create policy rt_g43_audit_select on public.prospecting_trigger_reviews
for select to authenticated using (
  public.rt_access_action_allowed(organization_id,'prospecting','view')
  and exists (
    select 1 from public.prospecting_trigger_events e
    where e.id=event_id and e.organization_id=organization_id
      and public.rt_access_scope_allows(organization_id,'prospecting',e.owner_id,null)
  )
);
-- No authenticated INSERT/UPDATE/DELETE on the audit ledger. Only the server trigger writes.
revoke all on public.prospecting_trigger_events from anon, authenticated;
grant select,insert,update on public.prospecting_trigger_events to authenticated;
revoke all on public.prospecting_trigger_reviews from anon, authenticated;
grant select on public.prospecting_trigger_reviews to authenticated;
comment on table public.prospecting_trigger_events is 'Source-bound trigger hypotheses. Review and CRM linkage are constrained by existing prospecting and pipeline access rules.';
comment on table public.prospecting_trigger_reviews is 'Append-only G4.3 human decisions. No direct client write grant.';
