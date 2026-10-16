begin;

-- H22.4 — mantém paridade entre o backfill H22.3 e organizações criadas depois dele.
-- Antes desta correção, rt_seed_access_profiles ainda usava as regras H22.1:
-- um workspace novo recebia Gestor sem a ação `approve` e field_access/approval_policy vazios.

create or replace function public.rt_access_default_rules(p_profile text)
returns jsonb language plpgsql immutable as $$
declare
  v_resources text[] := array['contacts','pipeline','tasks','communications','proposals','prospecting','goals','settings'];
  v_resource text;
  v_rules jsonb := '[]'::jsonb;
  v_scope text;
  v_actions jsonb;
begin
  foreach v_resource in array v_resources loop
    if p_profile='administrator' then
      v_scope:='all';
      v_actions:=case
        when v_resource='settings' then '["view","create","edit","delete","export","assign"]'::jsonb
        else '["view","create","edit","delete","export","assign","approve"]'::jsonb
      end;
    elsif p_profile='manager' then
      v_scope:='team';
      v_actions:=case
        when v_resource='settings' then '["view"]'::jsonb
        else '["view","create","edit","assign","approve"]'::jsonb
      end;
    elsif p_profile='viewer' then
      v_scope:=case when v_resource='settings' then 'none' else 'team' end;
      v_actions:=case when v_resource='settings' then '[]'::jsonb else '["view"]'::jsonb end;
    elsif p_profile='sdr' then
      if v_resource in ('proposals','settings') then
        v_scope:='none'; v_actions:='[]'::jsonb;
      elsif v_resource='goals' then
        v_scope:='own'; v_actions:='["view"]'::jsonb;
      elsif v_resource='prospecting' then
        v_scope:='team'; v_actions:='["view","create","edit"]'::jsonb;
      else
        v_scope:='own'; v_actions:='["view","create","edit"]'::jsonb;
      end if;
    else
      if v_resource='settings' then
        v_scope:='none'; v_actions:='[]'::jsonb;
      elsif v_resource='prospecting' then
        v_scope:='team'; v_actions:='["view","create","edit"]'::jsonb;
      else
        v_scope:='own'; v_actions:='["view","create","edit"]'::jsonb;
      end if;
    end if;
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('resource',v_resource,'scope',v_scope,'actions',v_actions));
  end loop;
  return v_rules;
end $$;

create or replace function public.rt_seed_access_profiles(p_organization_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.access_profiles(
    organization_id,profile_key,name,description,system_key,is_system,rules,field_access,approval_policy
  )
  values
    (
      p_organization_id,'system-administrator','Administrador',
      'Controle total do workspace, equipes, dados e configurações.',
      'administrator',true,
      public.rt_access_default_rules('administrator'),
      public.rt_access_default_field_access('administrator'),
      public.rt_access_default_approval_policy('administrator')
    ),
    (
      p_organization_id,'system-manager','Gestor',
      'Opera e acompanha todos os registros das equipes das quais participa.',
      'manager',true,
      public.rt_access_default_rules('manager'),
      public.rt_access_default_field_access('manager'),
      public.rt_access_default_approval_policy('manager')
    ),
    (
      p_organization_id,'system-seller','Vendedor',
      'Trabalha a própria carteira, tarefas, conversas e propostas.',
      'seller',true,
      public.rt_access_default_rules('seller'),
      public.rt_access_default_field_access('seller'),
      public.rt_access_default_approval_policy('seller')
    ),
    (
      p_organization_id,'system-sdr','SDR',
      'Prospecção e qualificação com acesso restrito à própria carteira.',
      'sdr',true,
      public.rt_access_default_rules('sdr'),
      public.rt_access_default_field_access('sdr'),
      public.rt_access_default_approval_policy('sdr')
    ),
    (
      p_organization_id,'system-viewer','Somente leitura',
      'Consulta os registros permitidos sem alterar dados.',
      'viewer',true,
      public.rt_access_default_rules('viewer'),
      public.rt_access_default_field_access('viewer'),
      public.rt_access_default_approval_policy('viewer')
    )
  on conflict (organization_id,profile_key) do nothing;
end $$;

-- Corrige organizações já existentes sem sobrescrever personalizações além da
-- governança mínima que H22.3 prometeu aos perfis de sistema.
update public.access_profiles p
set field_access = case
      when p.field_access='{}'::jsonb then public.rt_access_default_field_access(coalesce(p.system_key,'seller'))
      else p.field_access
    end,
    approval_policy = case
      when p.approval_policy='{}'::jsonb then public.rt_access_default_approval_policy(coalesce(p.system_key,'seller'))
      else p.approval_policy
    end,
    rules = case
      when p.system_key in ('administrator','manager') then (
        select jsonb_agg(
          case
            when elem->>'resource'<>'settings'
              and not coalesce(elem->'actions','[]'::jsonb) ? 'approve'
            then jsonb_set(elem,'{actions}',coalesce(elem->'actions','[]'::jsonb) || '["approve"]'::jsonb)
            else elem
          end
        )
        from jsonb_array_elements(p.rules) elem
      )
      else p.rules
    end,
    updated_at=now()
where p.is_system;

-- É helper interno acionado por trigger; não deve ser API pública.
revoke all on function public.rt_seed_access_profiles(uuid) from public,anon,authenticated;

commit;
