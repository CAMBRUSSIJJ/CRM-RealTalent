begin;

-- H22.2 — enforcement transversal para Comunicações, Propostas, Garimpo e Metas.
-- A UI reflete a permissão, mas estes guards protegem o dado mesmo contra chamadas diretas.

create or replace function public.rt_communication_owner(p_organization_id uuid, p_lead_id uuid, p_account_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select coalesce(
    (select l.owner_id from public.leads l where l.organization_id=p_organization_id and l.id=p_lead_id),
    (select a.connected_by_user_id from public.integration_connected_accounts a where a.organization_id=p_organization_id and a.id=p_account_id)
  )
  where public.is_organization_member(p_organization_id)
$$;

create or replace function public.rt_cross_module_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  r record;
  v_resource text;
  v_action text;
  v_owner uuid;
  v_team uuid;
  v_org uuid;
  v_allowed boolean;
begin
  if auth.uid() is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  if tg_op='DELETE' then r:=old; else r:=new; end if;
  v_org:=r.organization_id;

  if tg_table_name in ('communication_threads','communication_events','communication_outbox') then
    v_resource:='communications';
    v_owner:=public.rt_communication_owner(v_org,r.lead_id,r.account_id);
  elsif tg_table_name='sales_proposals' then
    v_resource:='proposals'; v_owner:=coalesce(r.owner_id,(select l.owner_id from public.leads l where l.id=r.lead_id and l.organization_id=v_org));
  elsif tg_table_name='sales_proposal_items' then
    v_resource:='proposals';
    select coalesce(p.owner_id,l.owner_id) into v_owner from public.sales_proposals p left join public.leads l on l.id=p.lead_id where p.id=r.proposal_id and p.organization_id=v_org;
  elsif tg_table_name='revenue_entries' then
    v_resource:='proposals';
    v_owner:=coalesce(r.owner_id,(select p.owner_id from public.sales_proposals p where p.id=r.proposal_id and p.organization_id=v_org),(select l.owner_id from public.leads l where l.id=r.lead_id and l.organization_id=v_org));
  elsif tg_table_name='buyer_rooms' then
    v_resource:='proposals';
    select coalesce(p.owner_id,l.owner_id) into v_owner from public.sales_proposals p left join public.leads l on l.id=r.lead_id where p.id=r.proposal_id and p.organization_id=v_org;
  elsif tg_table_name='products' then
    v_resource:='proposals'; v_owner:=auth.uid();
  elsif tg_table_name in ('prospecting_batches','prospecting_leads','prospecting_events') then
    v_resource:='prospecting'; v_owner:=coalesce(r.created_by,auth.uid());
  elsif tg_table_name='goals' then
    v_resource:='goals';
    if r.scope='team' then v_team:=r.team_id; v_owner:=null; elsif r.scope='workspace' then v_owner:=auth.uid(); else v_owner:=r.user_id; end if;
  else
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  v_action:=case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'edit' when 'DELETE' then 'delete' else 'view' end;
  -- Mensagens/outbox são uma edição da conversa existente. Perfis personalizados podem
  -- ter Editar sem Criar; nesse caso responder continua permitido sem liberar Nova conversa.
  if tg_op='INSERT' and tg_table_name in ('communication_events','communication_outbox') then
    v_allowed:=(public.rt_access_action_allowed(v_org,'communications','edit') or public.rt_access_action_allowed(v_org,'communications','create'))
      and public.rt_access_scope_allows(v_org,'communications',v_owner,v_team);
  elsif tg_op='INSERT' and tg_table_name='prospecting_events' then
    v_allowed:=(public.rt_access_action_allowed(v_org,'prospecting','edit') or public.rt_access_action_allowed(v_org,'prospecting','create'))
      and public.rt_access_scope_allows(v_org,'prospecting',v_owner,v_team);
  else
    v_allowed:=public.rt_access_action_allowed(v_org,v_resource,v_action)
      and (tg_table_name='products' or (tg_table_name='goals' and r.scope='workspace' and public.rt_access_scope(v_org,v_resource)='all') or public.rt_access_scope_allows(v_org,v_resource,v_owner,v_team));
  end if;
  if not v_allowed then raise exception 'Permissão negada em %/%',v_resource,v_action using errcode='42501'; end if;

  if tg_op='UPDATE' and v_resource in ('proposals','goals') then
    if tg_table_name='sales_proposals' and new.owner_id is distinct from old.owner_id and not public.rt_access_action_allowed(v_org,'proposals','assign') then
      raise exception 'Permissão negada: o perfil não permite atribuir propostas.' using errcode='42501';
    end if;
    if tg_table_name='goals' and (new.user_id is distinct from old.user_id or new.team_id is distinct from old.team_id or new.scope is distinct from old.scope)
       and not public.rt_access_action_allowed(v_org,'goals','assign') then
      raise exception 'Permissão negada: o perfil não permite atribuir metas.' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

-- Comunicações: leitura por carteira e alteração de threads por ação/escopo.
drop policy if exists communication_threads_select on public.communication_threads;
drop policy if exists communication_threads_write on public.communication_threads;
create policy communication_threads_select on public.communication_threads for select to authenticated using (
  public.rt_access_action_allowed(organization_id,'communications','view') and
  public.rt_access_scope_allows(organization_id,'communications',public.rt_communication_owner(organization_id,lead_id,account_id),null)
);
create policy communication_threads_insert on public.communication_threads for insert to authenticated with check (
  public.rt_access_action_allowed(organization_id,'communications','create') and
  public.rt_access_scope_allows(organization_id,'communications',public.rt_communication_owner(organization_id,lead_id,account_id),null)
);
create policy communication_threads_update on public.communication_threads for update to authenticated using (
  public.rt_access_action_allowed(organization_id,'communications','edit') and
  public.rt_access_scope_allows(organization_id,'communications',public.rt_communication_owner(organization_id,lead_id,account_id),null)
) with check (
  public.rt_access_action_allowed(organization_id,'communications','edit') and
  public.rt_access_scope_allows(organization_id,'communications',public.rt_communication_owner(organization_id,lead_id,account_id),null)
);
create policy communication_threads_delete on public.communication_threads for delete to authenticated using (
  public.rt_access_action_allowed(organization_id,'communications','delete') and
  public.rt_access_scope_allows(organization_id,'communications',public.rt_communication_owner(organization_id,lead_id,account_id),null)
);
drop policy if exists communication_events_select on public.communication_events;
create policy communication_events_select on public.communication_events for select to authenticated using (
  public.rt_access_action_allowed(organization_id,'communications','view') and public.rt_access_scope_allows(organization_id,'communications',public.rt_communication_owner(organization_id,lead_id,account_id),null)
);
drop policy if exists communication_outbox_select on public.communication_outbox;
create policy communication_outbox_select on public.communication_outbox for select to authenticated using (
  public.rt_access_action_allowed(organization_id,'communications','view') and public.rt_access_scope_allows(organization_id,'communications',public.rt_communication_owner(organization_id,lead_id,account_id),null)
);

-- Propostas, itens, catálogo e receita.
drop policy if exists sales_proposals_select on public.sales_proposals;
drop policy if exists sales_proposals_write on public.sales_proposals;
create policy sales_proposals_select on public.sales_proposals for select to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','view') and public.rt_access_scope_allows(organization_id,'proposals',coalesce(owner_id,(select l.owner_id from public.leads l where l.id=lead_id)),null));
create policy sales_proposals_insert on public.sales_proposals for insert to authenticated with check (public.rt_access_action_allowed(organization_id,'proposals','create') and public.rt_access_scope_allows(organization_id,'proposals',coalesce(owner_id,(select l.owner_id from public.leads l where l.id=lead_id)),null));
create policy sales_proposals_update on public.sales_proposals for update to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','edit') and public.rt_access_scope_allows(organization_id,'proposals',coalesce(owner_id,(select l.owner_id from public.leads l where l.id=lead_id)),null)) with check (public.rt_access_action_allowed(organization_id,'proposals','edit') and public.rt_access_scope_allows(organization_id,'proposals',coalesce(owner_id,(select l.owner_id from public.leads l where l.id=lead_id)),null));
create policy sales_proposals_delete on public.sales_proposals for delete to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','delete') and public.rt_access_scope_allows(organization_id,'proposals',coalesce(owner_id,(select l.owner_id from public.leads l where l.id=lead_id)),null));

drop policy if exists products_select on public.products; drop policy if exists products_write on public.products;
create policy products_select on public.products for select to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','view'));
create policy products_insert on public.products for insert to authenticated with check (public.rt_access_action_allowed(organization_id,'proposals','create'));
create policy products_update on public.products for update to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','edit')) with check (public.rt_access_action_allowed(organization_id,'proposals','edit'));
create policy products_delete on public.products for delete to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','delete'));

drop policy if exists sales_proposal_items_select on public.sales_proposal_items; drop policy if exists sales_proposal_items_write on public.sales_proposal_items;
create policy sales_proposal_items_select on public.sales_proposal_items for select to authenticated using (exists(select 1 from public.sales_proposals p where p.id=proposal_id));
create policy sales_proposal_items_write on public.sales_proposal_items for all to authenticated using (exists(select 1 from public.sales_proposals p where p.id=proposal_id and public.rt_access_action_allowed(p.organization_id,'proposals','edit'))) with check (exists(select 1 from public.sales_proposals p where p.id=proposal_id and (public.rt_access_action_allowed(p.organization_id,'proposals','edit') or public.rt_access_action_allowed(p.organization_id,'proposals','create'))));

drop policy if exists revenue_entries_select on public.revenue_entries; drop policy if exists revenue_entries_write on public.revenue_entries;
create policy revenue_entries_select on public.revenue_entries for select to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','view') and public.rt_access_scope_allows(organization_id,'proposals',coalesce(owner_id,(select p.owner_id from public.sales_proposals p where p.id=proposal_id),(select l.owner_id from public.leads l where l.id=lead_id)),null));
create policy revenue_entries_write on public.revenue_entries for all to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','edit') and public.rt_access_scope_allows(organization_id,'proposals',coalesce(owner_id,(select p.owner_id from public.sales_proposals p where p.id=proposal_id),(select l.owner_id from public.leads l where l.id=lead_id)),null)) with check ((public.rt_access_action_allowed(organization_id,'proposals','edit') or public.rt_access_action_allowed(organization_id,'proposals','create')) and public.rt_access_scope_allows(organization_id,'proposals',coalesce(owner_id,(select p.owner_id from public.sales_proposals p where p.id=proposal_id),(select l.owner_id from public.leads l where l.id=lead_id)),null));

-- Buyer Rooms.
drop policy if exists buyer_rooms_select on public.buyer_rooms; drop policy if exists buyer_rooms_write on public.buyer_rooms;
create policy buyer_rooms_select on public.buyer_rooms for select to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','view') and exists(select 1 from public.sales_proposals p where p.id=proposal_id));
create policy buyer_rooms_write on public.buyer_rooms for all to authenticated using (public.rt_access_action_allowed(organization_id,'proposals','edit') and exists(select 1 from public.sales_proposals p where p.id=proposal_id)) with check ((public.rt_access_action_allowed(organization_id,'proposals','edit') or public.rt_access_action_allowed(organization_id,'proposals','create')) and exists(select 1 from public.sales_proposals p where p.id=proposal_id));

-- Garimpo por autor.
drop policy if exists prospecting_batches_select on public.prospecting_batches; drop policy if exists prospecting_batches_write on public.prospecting_batches;
create policy prospecting_batches_select on public.prospecting_batches for select to authenticated using (public.rt_access_action_allowed(organization_id,'prospecting','view') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));
create policy prospecting_batches_insert on public.prospecting_batches for insert to authenticated with check (public.rt_access_action_allowed(organization_id,'prospecting','create') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));
create policy prospecting_batches_update on public.prospecting_batches for update to authenticated using (public.rt_access_action_allowed(organization_id,'prospecting','edit') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null)) with check (public.rt_access_action_allowed(organization_id,'prospecting','edit') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));
create policy prospecting_batches_delete on public.prospecting_batches for delete to authenticated using (public.rt_access_action_allowed(organization_id,'prospecting','delete') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));

drop policy if exists prospecting_leads_select on public.prospecting_leads; drop policy if exists prospecting_leads_write on public.prospecting_leads;
create policy prospecting_leads_select on public.prospecting_leads for select to authenticated using (public.rt_access_action_allowed(organization_id,'prospecting','view') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));
create policy prospecting_leads_insert on public.prospecting_leads for insert to authenticated with check (public.rt_access_action_allowed(organization_id,'prospecting','create') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));
create policy prospecting_leads_update on public.prospecting_leads for update to authenticated using (public.rt_access_action_allowed(organization_id,'prospecting','edit') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null)) with check (public.rt_access_action_allowed(organization_id,'prospecting','edit') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));
create policy prospecting_leads_delete on public.prospecting_leads for delete to authenticated using (public.rt_access_action_allowed(organization_id,'prospecting','delete') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));

drop policy if exists prospecting_events_select on public.prospecting_events; drop policy if exists prospecting_events_insert on public.prospecting_events; drop policy if exists prospecting_events_write on public.prospecting_events;
create policy prospecting_events_select on public.prospecting_events for select to authenticated using (public.rt_access_action_allowed(organization_id,'prospecting','view') and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));
create policy prospecting_events_insert on public.prospecting_events for insert to authenticated with check ((public.rt_access_action_allowed(organization_id,'prospecting','create') or public.rt_access_action_allowed(organization_id,'prospecting','edit')) and public.rt_access_scope_allows(organization_id,'prospecting',coalesce(created_by,auth.uid()),null));

-- Metas por pessoa/equipe/workspace.
drop policy if exists goals_select on public.goals; drop policy if exists goals_write on public.goals;
create policy goals_select on public.goals for select to authenticated using (
  public.rt_access_action_allowed(organization_id,'goals','view') and
  ((scope='workspace' and public.rt_access_scope(organization_id,'goals')='all') or (scope='team' and public.rt_access_scope_allows(organization_id,'goals',null,team_id)) or (scope='user' and public.rt_access_scope_allows(organization_id,'goals',user_id,null)))
);
create policy goals_insert on public.goals for insert to authenticated with check (
  public.rt_access_action_allowed(organization_id,'goals','create') and
  ((scope='workspace' and public.rt_access_scope(organization_id,'goals')='all') or (scope='team' and public.rt_access_scope_allows(organization_id,'goals',null,team_id)) or (scope='user' and public.rt_access_scope_allows(organization_id,'goals',user_id,null)))
);
create policy goals_update on public.goals for update to authenticated using (
  public.rt_access_action_allowed(organization_id,'goals','edit') and ((scope='workspace' and public.rt_access_scope(organization_id,'goals')='all') or (scope='team' and public.rt_access_scope_allows(organization_id,'goals',null,team_id)) or (scope='user' and public.rt_access_scope_allows(organization_id,'goals',user_id,null)))
) with check (
  public.rt_access_action_allowed(organization_id,'goals','edit') and ((scope='workspace' and public.rt_access_scope(organization_id,'goals')='all') or (scope='team' and public.rt_access_scope_allows(organization_id,'goals',null,team_id)) or (scope='user' and public.rt_access_scope_allows(organization_id,'goals',user_id,null)))
);
create policy goals_delete on public.goals for delete to authenticated using (
  public.rt_access_action_allowed(organization_id,'goals','delete') and ((scope='workspace' and public.rt_access_scope(organization_id,'goals')='all') or (scope='team' and public.rt_access_scope_allows(organization_id,'goals',null,team_id)) or (scope='user' and public.rt_access_scope_allows(organization_id,'goals',user_id,null)))
);

-- Triggers: protegem inclusive funções SECURITY DEFINER.
do $$ declare t text; begin
  foreach t in array array['communication_threads','communication_events','communication_outbox','sales_proposals','sales_proposal_items','products','revenue_entries','buyer_rooms','prospecting_batches','prospecting_leads','prospecting_events','goals'] loop
    execute format('drop trigger if exists %I on public.%I',t||'_h22_2_access_guard',t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.rt_cross_module_guard()',t||'_h22_2_access_guard',t);
  end loop;
end $$;

revoke all on function public.rt_cross_module_guard() from public,anon,authenticated;
revoke all on function public.rt_communication_owner(uuid,uuid,uuid) from public,anon;
grant execute on function public.rt_communication_owner(uuid,uuid,uuid) to authenticated;

commit;
