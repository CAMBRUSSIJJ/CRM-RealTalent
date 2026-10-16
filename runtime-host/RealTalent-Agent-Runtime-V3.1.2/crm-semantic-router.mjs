export const normalizeRouterText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const has = (text, pattern) => pattern.test(text)

export const routeBusinessDomain = (prompt, modules = []) => {
  const text = normalizeRouterText(prompt)
  const available = new Set(modules)
  const pick = (module, rationale) => available.has(module)
    ? { modules: [module], primaryModule: module, confidence: 0.995, rationale: `anchor: ${rationale}`, source: 'deterministic-domain' }
    : null

  if (has(text, /\b(meta|metas|quota|quotas|objetivo|objetivos|alvo|alvos)\b/)) return pick('goals', 'meta ou objetivo comercial explícito')
  if (has(text, /\b(email|e-mail|whatsapp|mensagem|mensagens)\b/) && has(text, /\b(envie|enviar|mande|mandar|responda|responder|escreva|escrever)\b/)) return pick('communications', 'canal externo explícito')
  if (has(text, /\b(notificacao|notificacoes|aviso|avisos|campainha|desfaca|desfazer|undo)\b/)) return pick('dashboard', 'notificação, undo ou ação global explícita')
  if (has(text, /\b(cadencia|cadencias|follow[- ]?up|followups|atividade|atividades|nota|notas)\b/)) return pick('followups', 'atividade, follow-up, nota ou cadência explícita')
  if (has(text, /\b(ligacao|ligacoes|telefonema|telefonemas|discador|gravacao)\b/)) return pick('calls', 'operação de ligação explícita')
  if (has(text, /\b(tarefa|tarefas|lembrete|lembretes)\b/)) return pick('tasks', 'tarefa ou lembrete explícito')
  if (has(text, /\b(reuniao|reunioes|compromisso|compromissos|evento|eventos|agenda|calendario)\b/) || (has(text, /\b(agende|agendar|marque|marcar|reagende|reagendar)\b/) && has(text, /\b(call|conversa)\b/))) return pick('agenda', 'evento ou agendamento explícito')
  if (has(text, /\b(automacao|automacoes|automatizacao|gatilho|regra automatica)\b/)) return pick('automations', 'automação explícita')
  if (has(text, /\b(equipe|equipes|membro|membros|convite|convide|papel|permissao|permissoes)\b/) && !has(text, /\b(cliente|contato)\b/)) return pick('teams', 'equipe ou membro explícito')
  if (has(text, /\b(auditoria|audit log|logs de auditoria|eventos de auditoria|sincronize a estrutura|sincronizar a estrutura|workspace|dados operacionais)\b/)) return pick('settings', 'administração do workspace explícita')
  if (has(text, /\b(receita|receitas|faturamento)\b/)) return pick('revenue', 'receita ou reconhecimento financeiro explícito')
  if (has(text, /\b(playbook|playbooks|roteiro comercial|script de vendas|script comercial)\b/)) return pick('playbooks', 'roteiro ou playbook explícito')
  if (has(text, /\b(garimpo|garimpar|garimpe|prospeccao|prospect|prospects|icp|ranqueie|ranking de prospects)\b/) || (has(text, /\b(encontre|encontrar|procure|procurar|descubra|descobrir)\b/) && has(text, /\b(empresas|clinicas|barbearias|lojas|negocios|prospects)\b/))) return pick('prospecting', 'descoberta de novos prospects explícita')
  if (has(text, /\b(mova|mover|movimente|etapa|pipeline|funil|marque como ganha|marque como perdida|negociacao)\b/) && has(text, /\b(oportunidade|oportunidades|lead|leads|negocio|negocios|etapa|atlas|acme)\b/)) return pick('pipeline', 'movimentação de oportunidade no funil')
  if (has(text, /\b(buyer room|sala de negociacao|proposta|propostas|catalogo|produto|produtos|servico|servicos)\b/) && !has(text, /\b(email|e-mail|whatsapp)\b/)) return pick('proposals', 'proposta, Buyer Room ou catálogo explícito')
  if (has(text, /\b(relacao|relacionamento|reporta|influencia|trabalha diretamente com|parceiro|socio)\b/)) return pick('leads', 'relação entre contatos explícita')
  if (has(text, /\b(lead|leads|contato|contatos|pessoa|pessoas|empresa|empresas|cliente|clientes)\b/) && has(text, /\b(cadastre|cadastrar|crie|criar|adicione|adicionar|atualize|atualizar|altere|alterar|exclua|excluir|mescle|mesclar|tag|reclassifique)\b/)) return pick('leads', 'cadastro ou manutenção comercial explícita')
  if (has(text, /\b(mostre|mostrar|liste|listar|quais|quantos|consulte|consultar)\b/)) return pick('dashboard', 'consulta global do CRM')
  return null
}

export const routeCapability = (prompt, candidates = [], pendingId = '') => {
  const text = normalizeRouterText(prompt)
  const byId = new Map(candidates.map((item) => [String(item?.id || ''), item]))
  const exact = (id, rationale) => byId.has(id) ? { ids: [id], confidence: 0.999, rationale } : null

  if (pendingId && byId.has(pendingId)) return exact(pendingId, 'capability pendente preservada')

  if (has(text, /\b(notificacao|notificacoes|aviso|avisos|campainha)\b/)) {
    if (has(text, /\b(restaure|restaurar|traga de volta|volte|reexiba)\b/)) return exact('notifications.restore_all', 'restaurar notificações')
    return exact('notifications.dismiss_all', 'limpar notificações')
  }
  if (has(text, /\b(desfaca|desfazer|undo|volte a ultima mudanca)\b/)) return exact('agent.undo_last', 'desfazer última ação')

  if (has(text, /\b(email|e-mail)\b/) && has(text, /\b(envie|enviar|mande|mandar|escreva|escrever|responda|responder)\b/)) return exact('communications.send_email', 'enviar e-mail')
  if (has(text, /\bwhatsapp\b/) && has(text, /\b(envie|enviar|mande|mandar|escreva|escrever|responda|responder)\b/)) return exact('communications.send_whatsapp', 'enviar WhatsApp')

  if (has(text, /\b(relacao|relacionamento|reporta|influencia|trabalha diretamente com|parceiro|socio)\b/)) {
    if (has(text, /\b(exclua|excluir|remova|remover|apague|apagar)\b/)) return exact('contacts.relationship_delete', 'excluir relação entre contatos')
    if (has(text, /\b(atualize|atualizar|altere|alterar|mude|mudar)\b/)) return exact('contacts.relationship_update', 'atualizar relação entre contatos')
    return exact('contacts.relationship_create', 'criar relação entre contatos')
  }

  // Intenção principal ganha de substantivos incidentais: "crie um lead ... da empresa Atlas" é lead, não empresa.
  if (has(text, /\blead|leads\b/) && has(text, /\b(crie|criar|cadastre|cadastrar)\b/)) return exact('leads.create', 'criar lead')
  if (has(text, /\bmescl(e|ar)|duplicado|duplicados\b/)) return exact('leads.merge', 'mesclar leads duplicados')
  if (has(text, /\btag\b/) && has(text, /\b(adicione|adicionar|inclua|incluir)\b/)) return exact('leads.bulk_tag', 'adicionar tag em lote')
  if (has(text, /\breclassifique|reclassificar\b/)) return exact('leads.reclassify', 'reclassificar leads')
  if (has(text, /\b(em lote|varios|varias|todos|todas)\b/) && has(text, /\b(atualize|atualizar)\b/)) return exact('leads.bulk_update', 'atualizar leads em lote')
  if (has(text, /\b(em lote|varios|varias|todos|todas)\b/) && has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('leads.bulk_delete', 'excluir leads em lote')
  if (has(text, /\bcontato|contatos|pessoa|pessoas\b/) && has(text, /\b(cadastre|cadastrar|crie|criar|adicione|adicionar)\b/)) return exact('contacts.create', 'criar contato')
  if (has(text, /\bcontato|contatos|pessoa|pessoas\b/) && has(text, /\b(atualize|atualizar|altere|alterar)\b/)) return exact('contacts.update', 'atualizar contato')
  if (has(text, /\bcontato|contatos|pessoa|pessoas\b/) && has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('contacts.delete', 'excluir contato')
  if (has(text, /\bempresa|empresas\b/) && has(text, /\b(cadastre|cadastrar|crie|criar)\b/) && !has(text, /\blead|contato|pessoa\b/)) return exact('companies.create', 'criar empresa')
  if (has(text, /\bempresa|empresas\b/) && has(text, /\b(atualize|atualizar|altere|alterar)\b/)) return exact('companies.update', 'atualizar empresa')

  if (has(text, /\b(mova|mover|movimente)\b/) && has(text, /\b(etapa|pipeline|funil|negociacao)\b/)) {
    if (has(text, /\b(em lote|varios|varias|todos|todas)\b/)) return exact('leads.bulk_move', 'mover oportunidades em lote')
    return exact('pipeline.move', 'mover oportunidade')
  }
  if (has(text, /\b(ganha|ganho|ganhou|vencida|feche como ganha)\b/)) return exact('pipeline.mark_won', 'marcar oportunidade ganha')
  if (has(text, /\b(perdida|perdeu|perdido|feche como perdida)\b/)) return exact('pipeline.mark_lost', 'marcar oportunidade perdida')
  if (has(text, /\betapa\b/) && has(text, /\b(crie|criar|adicione|adicionar)\b/)) return exact('pipeline.create_stage', 'criar etapa')
  if (has(text, /\betapa\b/) && has(text, /\b(renomeie|renomear|atualize|atualizar|altere|alterar)\b/)) return exact('pipeline.update_stage', 'atualizar etapa')
  if (has(text, /\betapa\b/) && has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('pipeline.delete_stage', 'excluir etapa')

  if (has(text, /\btarefa|tarefas|lembrete|lembretes\b/)) {
    if (has(text, /\b(conclua|concluir|complete|completar)\b/)) return exact('tasks.complete', 'concluir tarefa')
    if (has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('tasks.delete', 'excluir tarefa')
    return exact('tasks.create', 'criar tarefa')
  }

  if (has(text, /\bcadencia|cadencias\b/)) {
    if (has(text, /\b(pause|pausar|retome|retomar|encerre|encerrar|pare|parar)\b/)) return exact('cadences.update_state', 'alterar estado de cadência')
    return exact('cadences.create', 'criar cadência')
  }
  if (has(text, /\bnota|notas\b/) && has(text, /\b(adicione|adicionar|registre|registrar|crie|criar)\b/)) return exact('activities.create_note', 'criar nota')
  if (has(text, /\bfollow[- ]?up|atividade|atividades\b/)) {
    if (has(text, /\b(resultado|desfecho|demonstrou interesse|interessado|respondeu|nao respondeu)\b/)) return exact('activities.register_outcome', 'registrar resultado de atividade')
    if (has(text, /\b(reagende|reagendar|atualize|atualizar|altere|alterar|mude|mudar)\b/)) return exact('activities.update', 'atualizar atividade')
    if (has(text, /\b(conclua|concluir|complete|completar)\b/)) return exact('activities.complete', 'concluir atividade')
    if (has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('activities.delete', 'excluir atividade')
    return exact('activities.create_followup', 'criar follow-up')
  }

  if (has(text, /\breuniao|compromisso|evento|agenda|calendario\b/)) {
    if (has(text, /\b(reagende|reagendar|atualize|atualizar|altere|alterar)\b/)) return exact('calendar.update', 'atualizar compromisso')
    if (has(text, /\b(cancele|cancelar|exclua|excluir|apague|apagar)\b/)) return exact('calendar.delete', 'cancelar compromisso')
    return exact('calendar.create', 'criar compromisso')
  }

  if (has(text, /\bligacao|ligacoes|telefonema|telefonemas|discador|gravacao\b/)) {
    if (has(text, /\bgravacao\b/) && has(text, /\b(abra|abrir|mostre|mostrar)\b/)) return exact('calls.recording_url', 'abrir gravação')
    if (has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('calls.delete', 'excluir ligação')
    if (has(text, /\b(proxima acao|proxima tentativa|agende a proxima|retorno)\b/) && has(text, /\b(registre|registrar|resultado|desfecho|pediu)\b/)) return exact('calls.register_outcome', 'registrar ligação com próxima ação')
    if (has(text, /\b(registre|registrar|resultado|desfecho|atendeu|nao atendeu|ocupado|caixa postal)\b/)) return exact('calls.log_outcome', 'registrar resultado de ligação')
    return exact('calls.open', 'abrir ligação')
  }

  if (has(text, /\bbuyer room|sala de negociacao\b/)) {
    if (has(text, /\bnovo link|gere novo link|rotacione|rotacionar\b/)) return exact('buyer_rooms.rotate_token', 'novo link Buyer Room')
    if (has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('buyer_rooms.delete', 'excluir Buyer Room')
    if (has(text, /\b(atualize|atualizar|altere|alterar)\b/)) return exact('buyer_rooms.update', 'atualizar Buyer Room')
    return exact('buyer_rooms.create', 'criar Buyer Room')
  }
  if (has(text, /\bcatalogo|produto|produtos|servico|servicos\b/)) {
    if (has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('catalog.delete_product', 'excluir item do catálogo')
    if (has(text, /\b(atualize|atualizar|altere|alterar)\b/)) return exact('catalog.update_product', 'atualizar item do catálogo')
    if (has(text, /\b(crie|criar|adicione|adicionar|cadastre|cadastrar)\b/)) return exact('catalog.create_product', 'criar item do catálogo')
  }
  if (has(text, /\bproposta|propostas\b/)) {
    if (has(text, /\brevisao|nova versao\b/)) return exact('proposals.create_revision', 'criar revisão')
    if (has(text, /\boficial\b/)) return exact('proposals.make_official', 'proposta oficial')
    if (has(text, /\bfeche|fechar\b/) && has(text, /\boportunidade|negocio\b/)) return exact('proposals.close_opportunity', 'fechar oportunidade')
    if (has(text, /\bstatus\b/) && has(text, /\b(altere|alterar|mude|mudar|atualize|atualizar)\b/)) return exact('proposals.update_status', 'alterar status')
    if (has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('proposals.delete', 'excluir proposta')
    if (has(text, /\b(altere|alterar|atualize|atualizar|validade|probabilidade|termos)\b/)) return exact('proposals.update', 'atualizar proposta')
    return exact('proposals.create', 'criar proposta')
  }

  if (has(text, /\bmeta|metas|quota|objetivo|objetivos|alvo|alvos\b/)) {
    if (has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('goals.delete', 'excluir meta')
    if (has(text, /\b(atualize|atualizar|altere|alterar|mude|mudar)\b/)) return exact('goals.update', 'atualizar meta')
    return exact('goals.create', 'criar meta')
  }
  if (has(text, /\bplaybook|roteiro comercial|script de vendas|script comercial\b/)) {
    if (has(text, /\b(exclua|excluir|apague|apagar)\b/)) return exact('playbooks.delete', 'excluir playbook')
    if (has(text, /\b(atualize|atualizar|altere|alterar|renomeie|renomear)\b/)) return exact('playbooks.update', 'atualizar playbook')
    return exact('playbooks.create', 'criar playbook')
  }

  if (has(text, /\bautomacao|automacoes|automatizacao\b/)) {
    if (has(text, /\bsimule|simular|teste sem executar\b/)) return exact('automations.simulate', 'simular automação')
    if (has(text, /\bdesative|desativar|ative|ativar|ligue|desligue\b/)) return exact('automations.toggle', 'ligar/desligar automação')
    if (has(text, /\brenomeie|renomear|atualize|atualizar|altere|alterar\b/)) return exact('automations.update', 'atualizar automação')
    if (has(text, /\bcrie|criar\b/)) return exact('automations.create', 'criar automação')
    if (has(text, /\bdesfaca|desfazer\b/) && has(text, /\bexecucao|run\b/)) return exact('automations.undo_run', 'desfazer execução')
    if (has(text, /\bverifique|verificar|checks|checagens\b/)) return exact('automations.run_checks', 'verificar automações')
    if (has(text, /\bexecute|executar|rode|rodar\b/)) return exact('automations.run', 'executar automação')
    if (has(text, /\bexclua|excluir|apague|apagar\b/)) return exact('automations.delete', 'excluir automação')
  }

  if (has(text, /\bconvide|convidar|convite\b/) && has(text, /@|\bequipe\b/)) return exact('teams.invite', 'convidar membro')
  if (has(text, /\bmembro|workspace\b/) && has(text, /\b(adicione|adicionar|crie|criar)\b/)) return exact('teams.create_member', 'criar membro')
  if (has(text, /\bpapel|role|funcao\b/) && has(text, /\b(altere|alterar|atualize|atualizar|mude|mudar)\b/)) return exact('teams.update_role', 'alterar papel')
  if (has(text, /\bmembro\b/) && has(text, /\b(remova|remover|exclua|excluir)\b/)) return exact('teams.remove_member', 'remover membro')

  if (has(text, /\breceita|faturamento\b/)) {
    if (has(text, /\b(lance|lancar|crie|criar|registre|registrar)\b/)) return exact('revenue.create', 'criar receita')
    return exact('revenue.update_status', 'atualizar receita')
  }

  if (has(text, /\bgarimpo|garimpar|garimpe|prospeccao|prospects|icp|ranqueie|ranking\b/)) {
    if (has(text, /\bicp|perfil de cliente ideal\b/) && has(text, /\b(crie|criar|monte|montar)\b/)) return exact('prospecting.build_icp', 'construir ICP')
    if (has(text, /\branqueie|ranquear|priorize|priorizar|ranking\b/)) return exact('prospecting.rank', 'ranquear prospects')
    if (has(text, /\baprove|aprovar\b/)) return exact('prospecting.approve_top', 'aprovar prospects')
    if (has(text, /\bdescarte|descartar\b/)) return exact('prospecting.discard_low', 'descartar prospects')
    if (has(text, /\bmande para o crm|enviar para o crm|coloque no crm|colocar no crm\b/)) return exact('prospecting.send_to_crm', 'enviar ao CRM')
    if (has(text, /\banalise|analisar|recalcule|recalcular\b/)) return exact('prospecting.analyze', 'analisar prospects')
    return exact('prospecting.search', 'buscar prospects')
  }

  if (has(text, /\bauditoria|logs de auditoria|eventos de auditoria\b/)) return exact('workspace.audit_logs', 'consultar auditoria')
  if (has(text, /\bsincronize a estrutura|sincronizar a estrutura|estrutura comercial\b/)) return exact('workspace.sync_structure', 'sincronizar estrutura')
  if (has(text, /\bmembros do workspace|liste os membros\b/)) return exact('workspace.members', 'listar membros')
  if (has(text, /\bconvites do workspace|liste os convites\b/)) return exact('workspace.invites', 'listar convites')
  if (has(text, /\bcrie um workspace|criar workspace\b/)) return exact('workspace.create', 'criar workspace')
  if (has(text, /\btroque o workspace|mude o workspace|selecionar workspace\b/)) return exact('workspace.select', 'trocar workspace')
  if (has(text, /\b(limpe|limpar)\b/) && has(text, /\bdados operacionais\b/)) return exact('workspace.clear_operational_data', 'limpar dados operacionais')

  if (has(text, /\b(mostre|mostrar|liste|listar|quais|quantos|consulte|consultar)\b/)) return exact('crm.query', 'consultar CRM')
  return null
}

const hasArg = (step, names) => {
  const args = Array.isArray(step?.args) ? step.args : []
  return args.some((item) => names.includes(String(item?.name || '')) && String(item?.value || '').trim())
}

const appendArg = (step, name, value) => {
  if (!step || !String(value || '').trim()) return
  if (!Array.isArray(step.args)) step.args = []
  step.args.push({ name, value: String(value).trim() })
}

const explicitCalendarEntity = (prompt) => {
  const raw = String(prompt || '').trim()
  const match = raw.match(/\bcom\s+(.+?)(?=\s+(?:amanh[ãa]|hoje|ontem|na\s+pr[oó]xima|no\s+pr[oó]ximo|às|as\s+\d|em\s+\d)|[,.!?]|$)/i)
  if (!match) return ''
  return match[1].replace(/^(?:o|a|um|uma)\s+/i, '').trim().slice(0, 200)
}

export const preserveExplicitPlannerArguments = (prompt, payload) => {
  if (!payload || typeof payload !== 'object') return payload
  const steps = Array.isArray(payload?.plan?.steps) ? payload.plan.steps : []
  for (const step of steps) {
    if (String(step?.capabilityId || '') !== 'calendar.create') continue
    if (hasArg(step, ['record_query', 'contact_query', 'lead_query'])) continue
    const entity = explicitCalendarEntity(prompt)
    if (entity) appendArg(step, 'contact_query', entity)
  }
  return payload
}
