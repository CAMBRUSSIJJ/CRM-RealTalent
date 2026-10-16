begin;

-- H22.5 — evita acesso a campos específicos de outra tabela dentro do trigger genérico.
-- PL/pgSQL `record` só expõe os campos do NEW/OLD corrente; communication_threads,
-- por exemplo, não possui `scope`, que existe em goals.

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
  v_workspace_goal boolean := false;
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op='DELETE' then r:=old; else r:=new; end if;
  v_org:=r.organization_id;

  if tg_table_name in ('communication_threads','communication_events','communication_outbox') then
    v_resource:='communications';
    v_owner:=public.rt_communication_owner(v_org,r.lead_id,r.account_id);
  elsif tg_table_name='sales_proposals' then
    v_resource:='proposals';
    v_owner:=coalesce(r.owner_id,(select l.owner_id from public.leads l where l.id=r.lead_id and l.organization_id=v_org));
  elsif tg_table_name='sales_proposal_items' then
    v_resource:='proposals';
    select coalesce(p.owner_id,l.owner_id) into v_owner
    from public.sales_proposals p
    left join public.leads l on l.id=p.lead_id
    where p.id=r.proposal_id and p.organization_id=v_org;
  elsif tg_table_name='revenue_entries' then
    v_resource:='proposals';
    v_owner:=coalesce(
      r.owner_id,
      (select p.owner_id from public.sales_proposals p where p.id=r.proposal_id and p.organization_id=v_org),
      (select l.owner_id from public.leads l where l.id=r.lead_id and l.organization_id=v_org)
    );
  elsif tg_table_name='buyer_rooms' then
    v_resource:='proposals';
    select coalesce(p.owner_id,l.owner_id) into v_owner
    from public.sales_proposals p
    left join public.leads l on l.id=p.lead_id
    where p.id=r.proposal_id and p.organization_id=v_org;
  elsif tg_table_name='products' then
    v_resource:='proposals';
    v_owner:=auth.uid();
  elsif tg_table_name in ('prospecting_batches','prospecting_leads','prospecting_events') then
    v_resource:='prospecting';
    v_owner:=coalesce(r.created_by,auth.uid());
  elsif tg_table_name='goals' then
    v_resource:='goals';
    v_workspace_goal:=r.scope='workspace';
    if r.scope='team' then
      v_team:=r.team_id;
      v_owner:=null;
    elsif v_workspace_goal then
      v_owner:=auth.uid();
    else
      v_owner:=r.user_id;
    end if;
  else
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  v_action:=case tg_op
    when 'INSERT' then 'create'
    when 'UPDATE' then 'edit'
    when 'DELETE' then 'delete'
    else 'view'
  end;

  -- Mensagens/outbox são uma edição da conversa existente. Perfis personalizados podem
  -- ter Editar sem Criar; nesse caso responder continua permitido sem liberar Nova conversa.
  if tg_op='INSERT' and tg_table_name in ('communication_events','communication_outbox') then
    v_allowed:=(
      public.rt_access_action_allowed(v_org,'communications','edit')
      or public.rt_access_action_allowed(v_org,'communications','create')
    ) and public.rt_access_scope_allows(v_org,'communications',v_owner,v_team);
  elsif tg_op='INSERT' and tg_table_name='prospecting_events' then
    v_allowed:=(
      public.rt_access_action_allowed(v_org,'prospecting','edit')
      or public.rt_access_action_allowed(v_org,'prospecting','create')
    ) and public.rt_access_scope_allows(v_org,'prospecting',v_owner,v_team);
  elsif tg_table_name='products' then
    v_allowed:=public.rt_access_action_allowed(v_org,v_resource,v_action);
  elsif v_resource='goals' and v_workspace_goal then
    v_allowed:=public.rt_access_action_allowed(v_org,v_resource,v_action)
      and public.rt_access_scope(v_org,v_resource)='all';
  else
    v_allowed:=public.rt_access_action_allowed(v_org,v_resource,v_action)
      and public.rt_access_scope_allows(v_org,v_resource,v_owner,v_team);
  end if;

  if not v_allowed then
    raise exception 'Permissão negada em %/%',v_resource,v_action using errcode='42501';
  end if;

  if tg_op='UPDATE' and v_resource in ('proposals','goals') then
    if tg_table_name='sales_proposals'
       and new.owner_id is distinct from old.owner_id
       and not public.rt_access_action_allowed(v_org,'proposals','assign') then
      raise exception 'Permissão negada: o perfil não permite atribuir propostas.' using errcode='42501';
    end if;
    if tg_table_name='goals'
       and (new.user_id is distinct from old.user_id or new.team_id is distinct from old.team_id or new.scope is distinct from old.scope)
       and not public.rt_access_action_allowed(v_org,'goals','assign') then
      raise exception 'Permissão negada: o perfil não permite atribuir metas.' using errcode='42501';
    end if;
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end $$;

-- Função exclusiva de trigger; não é endpoint RPC de negócio.
revoke all on function public.rt_cross_module_guard() from public,anon,authenticated;

commit;
