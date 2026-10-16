export const normalizeRouterText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const rx = (text, pattern) => pattern.test(text)
const available = (candidates, id) => candidates.some((item) => String(item?.id || '') === id)
const exact = (candidates, id, rationale) => available(candidates, id) ? { ids: [id], confidence: 0.999, rationale } : null

export const routeBusinessDomain = (prompt, modules = []) => {
  const text = normalizeRouterText(prompt)
  const pool = new Set(modules)
  const pick = (module, rationale) => pool.has(module)
    ? { modules: [module], primaryModule: module, confidence: 0.995, rationale: `anchor: ${rationale}`, source: 'deterministic-domain' }
    : null

  const rules = [
    ['goals', /\b(meta|metas|quota|quotas|objetivo|objetivos|alvo|alvos)\b/, 'meta ou objetivo comercial explícito'],
    ['communications', /\b(email|e-mail|whatsapp|mensagem|mensagens)\b.*\b(envie|enviar|mande|mandar|responda|responder|escreva|escrever)\b|\b(envie|enviar|mande|mandar|responda|responder|escreva|escrever)\b.*\b(email|e-mail|whatsapp|mensagem|mensagens)\b/, 'canal externo explícito'],
    ['dashboard', /\b(notificacao|notificacoes|aviso|avisos|campainha|desfaca|desfazer|undo)\b/, 'notificação, undo ou ação global explícita'],
    ['followups', /\b(cadencia|cadencias|follow[- ]?up|followups|atividade|atividades|nota|notas)\b/, 'atividade, follow-up, nota ou cadência explícita'],
    ['calls', /\b(ligacao|ligacoes|telefonema|telefonemas|discador|gravacao)\b/, 'operação de ligação explícita'],
    ['tasks', /\b(tarefa|tarefas|lembrete|lembretes)\b/, 'tarefa ou lembrete explícito'],
    ['agenda', /\b(reuniao|reunioes|compromisso|compromissos|evento|eventos|agenda|calendario)\b/, 'evento ou agendamento explícito'],
    ['automations', /\b(automacao|automacoes|automatizacao|gatilho|regra automatica)\b/, 'automação explícita'],
    ['teams', /\b(equipe|equipes|membro|membros|convite|convide|papel|permissao|permissoes)\b/, 'equipe ou membro explícito'],
    ['settings', /\b(auditoria|audit log|logs de auditoria|eventos de auditoria|sincronize a estrutura|sincronizar a estrutura|workspace|dados operacionais)\b/, 'administração do workspace explícita'],
    ['revenue', /\b(receita|receitas|faturamento)\b/, 'receita ou reconhecimento financeiro explícito'],
    ['playbooks', /\b(playbook|playbooks|roteiro comercial|script de vendas|script comercial)\b/, 'roteiro ou playbook explícito'],
    ['prospecting', /\b(garimpo|garimpar|garimpe|prospeccao|prospect|prospects|icp|ranqueie|ranking de prospects)\b/, 'descoberta de novos prospects explícita'],
    ['pipeline', /\b(mova|mover|movimente|etapa|pipeline|funil|marque como ganha|marque como perdida|negociacao)\b.*\b(oportunidade|oportunidades|lead|leads|negocio|negocios|etapa|em lote)\b|\b(oportunidade|oportunidades|lead|leads|negocio|negocios|etapa|em lote)\b.*\b(mova|mover|movimente|etapa|pipeline|funil|negociacao)\b/, 'movimentação de oportunidade no funil'],
    ['proposals', /\b(buyer room|sala de negociacao|proposta|propostas|catalogo|produto|produtos|servico|servicos)\b/, 'proposta, Buyer Room ou catálogo explícito'],
    ['leads', /\b(relacao|relacionamento|reporta|influencia|trabalha diretamente com|parceiro|socio)\b/, 'relação entre contatos explícita'],
    ['leads', /\b(lead|leads|contato|contatos|pessoa|pessoas|empresa|empresas|cliente|clientes)\b.*\b(cadastre|cadastrar|crie|criar|adicione|adicionar|atualize|atualizar|altere|alterar|exclua|excluir|mescle|mesclar|tag|reclassifique)\b|\b(cadastre|cadastrar|crie|criar|adicione|adicionar|atualize|atualizar|altere|alterar|exclua|excluir|mescle|mesclar|tag|reclassifique)\b.*\b(lead|leads|contato|contatos|pessoa|pessoas|empresa|empresas|cliente|clientes)\b/, 'cadastro ou manutenção comercial explícita'],
    ['dashboard', /\b(mostre|mostrar|liste|listar|quais|quantos|consulte|consultar)\b/, 'consulta global do CRM'],
  ]

  for (const [module, pattern, rationale] of rules) {
    if (rx(text, pattern)) {
      const result = pick(module, rationale)
      if (result) return result
    }
  }
  return null
}

export const routeCapability = (prompt, candidates = [], pendingId = '') => {
  const text = normalizeRouterText(prompt)
  if (pendingId && available(candidates, pendingId)) return exact(candidates, pendingId, 'capability pendente preservada')
  const has = (pattern) => rx(text, pattern)
  const choose = (id, rationale) => exact(candidates, id, rationale)

  if (has(/\b(notificacao|notificacoes|aviso|avisos|campainha)\b/)) return choose(has(/\b(restaure|restaurar|traga de volta|reexiba)\b/) ? 'notifications.restore_all' : 'notifications.dismiss_all', 'notificações')
  if (has(/\b(desfaca|desfazer|undo|volte a ultima mudanca)\b/)) return choose('agent.undo_last', 'desfazer última ação')
  if (has(/\b(email|e-mail)\b/) && has(/\b(envie|enviar|mande|mandar|escreva|escrever|responda|responder)\b/)) return choose('communications.send_email', 'enviar e-mail')
  if (has(/\bwhatsapp\b/) && has(/\b(envie|enviar|mande|mandar|escreva|escrever|responda|responder)\b/)) return choose('communications.send_whatsapp', 'enviar WhatsApp')

  if (has(/\b(relacao|relacionamento|reporta|influencia|trabalha diretamente com|parceiro|socio)\b/)) {
    if (has(/\b(exclua|excluir|remova|remover|apague|apagar)\b/)) return choose('contacts.relationship_delete', 'excluir relação')
    if (has(/\b(atualize|atualizar|altere|alterar|mude|mudar)\b/)) return choose('contacts.relationship_update', 'atualizar relação')
    return choose('contacts.relationship_create', 'criar relação')
  }

  // Prioridade semântica: objeto principal explícito vence substantivos incidentais.
  if (has(/\blead|leads\b/) && has(/\b(crie|criar|cadastre|cadastrar)\b/)) return choose('leads.create', 'criar lead')
  if (has(/\bmescl(e|ar)|duplicado|duplicados\b/)) return choose('leads.merge', 'mesclar duplicados')
  if (has(/\btag\b/) && has(/\b(adicione|adicionar|inclua|incluir)\b/)) return choose('leads.bulk_tag', 'tag em lote')
  if (has(/\breclassifique|reclassificar\b/)) return choose('leads.reclassify', 'reclassificar leads')
  if (has(/\b(em lote|varios|varias|todos|todas)\b/) && has(/\b(atualize|atualizar)\b/)) return choose('leads.bulk_update', 'atualizar leads em lote')
  if (has(/\b(em lote|varios|varias|todos|todas)\b/) && has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('leads.bulk_delete', 'excluir leads em lote')
  if (has(/\bcontato|contatos|pessoa|pessoas\b/) && has(/\b(cadastre|cadastrar|crie|criar|adicione|adicionar)\b/)) return choose('contacts.create', 'criar contato')
  if (has(/\bcontato|contatos|pessoa|pessoas\b/) && has(/\b(atualize|atualizar|altere|alterar)\b/)) return choose('contacts.update', 'atualizar contato')
  if (has(/\bcontato|contatos|pessoa|pessoas\b/) && has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('contacts.delete', 'excluir contato')
  if (has(/\bempresa|empresas\b/) && has(/\b(cadastre|cadastrar|crie|criar)\b/) && !has(/\blead|contato|pessoa\b/)) return choose('companies.create', 'criar empresa')
  if (has(/\bempresa|empresas\b/) && has(/\b(atualize|atualizar|altere|alterar)\b/)) return choose('companies.update', 'atualizar empresa')

  if (has(/\b(mova|mover|movimente)\b/) && has(/\b(etapa|pipeline|funil|negociacao)\b/)) return choose(has(/\b(em lote|varios|varias|todos|todas)\b/) ? 'leads.bulk_move' : 'pipeline.move', 'mover oportunidade')
  if (has(/\b(ganha|ganho|ganhou|vencida|feche como ganha)\b/)) return choose('pipeline.mark_won', 'marcar ganha')
  if (has(/\b(perdida|perdeu|perdido|feche como perdida)\b/)) return choose('pipeline.mark_lost', 'marcar perdida')
  if (has(/\betapa\b/) && has(/\b(crie|criar|adicione|adicionar)\b/)) return choose('pipeline.create_stage', 'criar etapa')
  if (has(/\betapa\b/) && has(/\b(renomeie|renomear|atualize|atualizar|altere|alterar)\b/)) return choose('pipeline.update_stage', 'atualizar etapa')
  if (has(/\betapa\b/) && has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('pipeline.delete_stage', 'excluir etapa')

  if (has(/\btarefa|tarefas|lembrete|lembretes\b/)) {
    if (has(/\b(conclua|concluir|complete|completar)\b/)) return choose('tasks.complete', 'concluir tarefa')
    if (has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('tasks.delete', 'excluir tarefa')
    return choose('tasks.create', 'criar tarefa')
  }
  if (has(/\bcadencia|cadencias\b/)) return choose(has(/\b(pause|pausar|retome|retomar|encerre|encerrar|pare|parar)\b/) ? 'cadences.update_state' : 'cadences.create', 'cadência')
  if (has(/\bnota|notas\b/)) return choose('activities.create_note', 'criar nota')
  if (has(/\bfollow[- ]?up|atividade|atividades\b/)) {
    if (has(/\b(resultado|desfecho|demonstrou interesse|interessado|respondeu|nao respondeu)\b/)) return choose('activities.register_outcome', 'resultado de atividade')
    if (has(/\b(reagende|reagendar|atualize|atualizar|altere|alterar|mude|mudar)\b/)) return choose('activities.update', 'atualizar atividade')
    if (has(/\b(conclua|concluir|complete|completar)\b/)) return choose('activities.complete', 'concluir atividade')
    if (has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('activities.delete', 'excluir atividade')
    return choose('activities.create_followup', 'criar follow-up')
  }

  if (has(/\breuniao|compromisso|evento|agenda|calendario\b/)) {
    if (has(/\b(reagende|reagendar|atualize|atualizar|altere|alterar)\b/)) return choose('calendar.update', 'atualizar compromisso')
    if (has(/\b(cancele|cancelar|exclua|excluir|apague|apagar)\b/)) return choose('calendar.delete', 'cancelar compromisso')
    return choose('calendar.create', 'criar compromisso')
  }

  if (has(/\bligacao|ligacoes|telefonema|telefonemas|discador|gravacao\b/)) {
    if (has(/\bgravacao\b/) && has(/\b(abra|abrir|mostre|mostrar)\b/)) return choose('calls.recording_url', 'abrir gravação')
    if (has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('calls.delete', 'excluir ligação')
    if (has(/\b(proxima acao|proxima tentativa|agende a proxima|retorno)\b/) && has(/\b(registre|registrar|resultado|desfecho|pediu)\b/)) return choose('calls.register_outcome', 'ligação com próxima ação')
    if (has(/\b(registre|registrar|resultado|desfecho|atendeu|nao atendeu|ocupado|caixa postal)\b/)) return choose('calls.log_outcome', 'resultado de ligação')
    return choose('calls.open', 'abrir ligação')
  }

  if (has(/\bbuyer room|sala de negociacao\b/)) {
    if (has(/\bnovo link|gere novo link|rotacione|rotacionar\b/)) return choose('buyer_rooms.rotate_token', 'novo link Buyer Room')
    if (has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('buyer_rooms.delete', 'excluir Buyer Room')
    if (has(/\b(atualize|atualizar|altere|alterar)\b/)) return choose('buyer_rooms.update', 'atualizar Buyer Room')
    return choose('buyer_rooms.create', 'criar Buyer Room')
  }

  // Proposta explícita vence menções incidentais a produto/serviço.
  if (has(/\bproposta|propostas\b/)) {
    if (has(/\brevisao|nova versao\b/)) return choose('proposals.create_revision', 'revisão de proposta')
    if (has(/\boficial\b/)) return choose('proposals.make_official', 'proposta oficial')
    if (has(/\bfeche|fechar\b/) && has(/\boportunidade|negocio\b/)) return choose('proposals.close_opportunity', 'fechar oportunidade')
    if (has(/\bstatus\b/) && has(/\b(altere|alterar|mude|mudar|atualize|atualizar)\b/)) return choose('proposals.update_status', 'alterar status')
    if (has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('proposals.delete', 'excluir proposta')
    if (has(/\b(altere|alterar|atualize|atualizar|validade|probabilidade|termos)\b/)) return choose('proposals.update', 'atualizar proposta')
    return choose('proposals.create', 'criar proposta')
  }
  if (has(/\bcatalogo\b/) || (has(/\bproduto|produtos|servico|servicos\b/) && !has(/\bproposta|propostas\b/))) {
    if (has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('catalog.delete_product', 'excluir item do catálogo')
    if (has(/\b(atualize|atualizar|altere|alterar)\b/)) return choose('catalog.update_product', 'atualizar item do catálogo')
    if (has(/\b(crie|criar|adicione|adicionar|cadastre|cadastrar)\b/)) return choose('catalog.create_product', 'criar item do catálogo')
  }

  if (has(/\bmeta|metas|quota|objetivo|objetivos|alvo|alvos\b/)) {
    if (has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('goals.delete', 'excluir meta')
    if (has(/\b(atualize|atualizar|altere|alterar|mude|mudar)\b/)) return choose('goals.update', 'atualizar meta')
    return choose('goals.create', 'criar meta')
  }
  if (has(/\bplaybook|roteiro comercial|script de vendas|script comercial\b/)) {
    if (has(/\b(exclua|excluir|apague|apagar)\b/)) return choose('playbooks.delete', 'excluir playbook')
    if (has(/\b(atualize|atualizar|altere|alterar|renomeie|renomear)\b/)) return choose('playbooks.update', 'atualizar playbook')
    return choose('playbooks.create', 'criar playbook')
  }
  if (has(/\bautomacao|automacoes|automatizacao\b/)) {
    if (has(/\bsimule|simular|teste sem executar\b/)) return choose('automations.simulate', 'simular automação')
    if (has(/\bdesative|desativar|ative|ativar|ligue|desligue\b/)) return choose('automations.toggle', 'ligar/desligar automação')
    if (has(/\brenomeie|renomear|atualize|atualizar|altere|alterar\b/)) return choose('automations.update', 'atualizar automação')
    if (has(/\bcrie|criar\b/)) return choose('automations.create', 'criar automação')
    if (has(/\bdesfaca|desfazer\b/) && has(/\bexecucao|run\b/)) return choose('automations.undo_run', 'desfazer execução')
    if (has(/\bverifique|verificar|checks|checagens\b/)) return choose('automations.run_checks', 'verificar automações')
    if (has(/\bexecute|executar|rode|rodar\b/)) return choose('automations.run', 'executar automação')
    if (has(/\bexclua|excluir|apague|apagar\b/)) return choose('automations.delete', 'excluir automação')
  }

  if (has(/\bconvide|convidar|convite\b/) && has(/@|\bequipe\b/)) return choose('teams.invite', 'convidar membro')
  if (has(/\bmembro|workspace\b/) && has(/\b(adicione|adicionar|crie|criar)\b/)) return choose('teams.create_member', 'criar membro')
  if (has(/\bpapel|role|funcao\b/) && has(/\b(altere|alterar|atualize|atualizar|mude|mudar)\b/)) return choose('teams.update_role', 'alterar papel')
  if (has(/\bmembro\b/) && has(/\b(remova|remover|exclua|excluir)\b/)) return choose('teams.remove_member', 'remover membro')

  if (has(/\breceita|faturamento\b/)) return choose(has(/\b(lance|lancar|crie|criar|registre|registrar)\b/) ? 'revenue.create' : 'revenue.update_status', 'receita')

  if (has(/\bgarimpo|garimpar|garimpe|prospeccao|prospects|icp|ranqueie|ranking\b/)) {
    if (has(/\bicp|perfil de cliente ideal\b/) && has(/\b(crie|criar|monte|montar)\b/)) return choose('prospecting.build_icp', 'construir ICP')
    if (has(/\branqueie|ranquear|priorize|priorizar|ranking\b/)) return choose('prospecting.rank', 'ranquear prospects')
    if (has(/\baprove|aprovar\b/)) return choose('prospecting.approve_top', 'aprovar prospects')
    if (has(/\bdescarte|descartar\b/)) return choose('prospecting.discard_low', 'descartar prospects')
    if (has(/\bmande para o crm|enviar para o crm|coloque no crm|colocar no crm\b/)) return choose('prospecting.send_to_crm', 'enviar ao CRM')
    if (has(/\banalise|analisar|recalcule|recalcular\b/)) return choose('prospecting.analyze', 'analisar prospects')
    return choose('prospecting.search', 'buscar prospects')
  }

  if (has(/\bauditoria|logs de auditoria|eventos de auditoria\b/)) return choose('workspace.audit_logs', 'consultar auditoria')
  if (has(/\bsincronize a estrutura|sincronizar a estrutura|estrutura comercial\b/)) return choose('workspace.sync_structure', 'sincronizar estrutura')
  if (has(/\bmembros do workspace|liste os membros\b/)) return choose('workspace.members', 'listar membros')
  if (has(/\bconvites do workspace|liste os convites\b/)) return choose('workspace.invites', 'listar convites')
  if (has(/\bcrie um workspace|criar workspace\b/)) return choose('workspace.create', 'criar workspace')
  if (has(/\btroque o workspace|mude o workspace|selecionar workspace\b/)) return choose('workspace.select', 'trocar workspace')
  if (has(/\b(limpe|limpar)\b/) && has(/\bdados operacionais\b/)) return choose('workspace.clear_operational_data', 'limpar dados operacionais')
  if (has(/\b(mostre|mostrar|liste|listar|quais|quantos|consulte|consultar)\b/)) return choose('crm.query', 'consultar CRM')
  return null
}

const hasArg = (step, names) => Array.isArray(step?.args) && step.args.some((item) => names.includes(String(item?.name || '')) && String(item?.value || '').trim())
const appendArg = (step, name, value) => {
  const clean = String(value || '').trim()
  if (!step || !clean) return
  if (!Array.isArray(step.args)) step.args = []
  step.args.push({ name, value: clean })
}

const explicitCalendarEntity = (prompt) => {
  const raw = String(prompt || '').trim()
  const match = raw.match(/\bcom\s+(.+?)(?=\s+(?:amanh[ãa]|hoje|ontem|na\s+pr[oó]xima|no\s+pr[oó]ximo|às|as\s+\d|em\s+\d)|[,.!?]|$)/i)
  return match ? match[1].replace(/^(?:o|a|um|uma)\s+/i, '').trim().slice(0, 200) : ''
}

export const preserveExplicitPlannerArguments = (prompt, payload) => {
  if (!payload || typeof payload !== 'object') return payload
  const steps = Array.isArray(payload?.plan?.steps) ? payload.plan.steps : []
  for (const step of steps) {
    if (String(step?.capabilityId || '') === 'calendar.create' && !hasArg(step, ['record_query', 'contact_query', 'lead_query'])) {
      const entity = explicitCalendarEntity(prompt)
      if (entity) appendArg(step, 'contact_query', entity)
    }
  }
  return payload
}
