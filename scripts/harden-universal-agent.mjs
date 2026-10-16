import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const patch = (relative, transform) => {
  const file = path.resolve(root, relative)
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8')
    console.log(`✓ Universal hardening: ${relative}`)
  }
  return after
}

const gateway = patch('runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs', (source) => {
  let next = source
    .replace('contato|ana|bruno|pessoa|pessoas', 'com|entre|contato|contatos|pessoa|pessoas')
    .replaceAll("return pick('contacts',", "return pick('leads',")

  const hasAnchor = "  const has = (pattern) => pattern.test(text)\n\n"
  if (next.includes(hasAnchor) && !next.includes("notificação, undo ou navegação global explícita")) {
    next = next.replace(hasAnchor, `${hasAnchor}  if (has(/\\b(notificacao|notificacoes|aviso|avisos|campainha|desfaca|desfazer|undo)\\b/)) return pick('dashboard', 'notificação, undo ou navegação global explícita')\n`)
  }

  if (!next.includes('const semanticCapabilityAnchor =')) {
    const capabilityHelper = [
      "const semanticCapabilityAnchor = (prompt, candidates, pendingId = '') => {",
      "  const text = normalizeRouterText(prompt)",
      "  const byId = new Map(candidates.map((item) => [String(item?.id || ''), item]))",
      "  const exact = (id, rationale) => byId.has(id) ? { ids: [id], confidence: 0.995, rationale } : null",
      "  const has = (pattern) => pattern.test(text)",
      "  if (pendingId && byId.has(pendingId)) return exact(pendingId, 'capability pendente preservada')",
      "",
      "  if (has(/\\b(notificacao|notificacoes|aviso|avisos|campainha)\\b/)) {",
      "    if (has(/\\b(restaure|restaurar|traga de volta|volte|reexiba)\\b/)) return exact('notifications.restore_all', 'restaurar notificações')",
      "    if (has(/\\b(limpe|limpar|zerar|zere|oculte|ocultar|sumir|tire|tirar)\\b/)) return exact('notifications.dismiss_all', 'limpar notificações')",
      "  }",
      "  if (has(/\\b(desfaca|desfazer|undo|volte a ultima mudanca)\\b/)) return exact('agent.undo_last', 'desfazer última ação')",
      "",
      "  if (has(/\\b(email|e-mail)\\b/) && has(/\\b(envie|enviar|mande|mandar|escreva|escrever|responda|responder)\\b/)) return exact('communications.send_email', 'envio explícito de e-mail')",
      "  if (has(/\\bwhatsapp\\b/) && has(/\\b(envie|enviar|mande|mandar|escreva|escrever|responda|responder)\\b/)) return exact('communications.send_whatsapp', 'envio explícito de WhatsApp')",
      "",
      "  if (has(/\\b(relacao|relacionamento|reporta|influencia|trabalha diretamente com|parceiro|socio)\\b/)) {",
      "    if (has(/\\b(exclua|excluir|remova|remover|apague|apagar)\\b/)) return exact('contacts.relationship_delete', 'excluir relação entre contatos')",
      "    if (has(/\\b(atualize|atualizar|altere|alterar|mude|mudar)\\b/)) return exact('contacts.relationship_update', 'atualizar relação entre contatos')",
      "    return exact('contacts.relationship_create', 'criar relação entre contatos')",
      "  }",
      "  if (has(/\\bmescl(e|ar)|duplicado|duplicados\\b/)) return exact('leads.merge', 'mesclar leads duplicados')",
      "  if (has(/\\btag\\b/) && has(/\\b(adicione|adicionar|inclua|incluir)\\b/)) return exact('leads.bulk_tag', 'adicionar tag em lote')",
      "  if (has(/\\breclassifique|reclassificar\\b/)) return exact('leads.reclassify', 'reclassificar leads')",
      "  if (has(/\\b(em lote|varios|varias|todos|todas)\\b/) && has(/\\b(atualize|atualizar)\\b/)) return exact('leads.bulk_update', 'atualizar leads em lote')",
      "  if (has(/\\b(em lote|varios|varias|todos|todas)\\b/) && has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('leads.bulk_delete', 'excluir leads em lote')",
      "  if (has(/\\bcontato|contatos|pessoa|pessoas\\b/) && has(/\\b(cadastre|cadastrar|crie|criar|adicione|adicionar)\\b/)) return exact('contacts.create', 'criar contato')",
      "  if (has(/\\bcontato|contatos|pessoa|pessoas\\b/) && has(/\\b(atualize|atualizar|altere|alterar)\\b/)) return exact('contacts.update', 'atualizar contato')",
      "  if (has(/\\bcontato|contatos|pessoa|pessoas\\b/) && has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('contacts.delete', 'excluir contato')",
      "  if (has(/\\bempresa|empresas\\b/) && has(/\\b(cadastre|cadastrar|crie|criar)\\b/)) return exact('companies.create', 'criar empresa')",
      "  if (has(/\\bempresa|empresas\\b/) && has(/\\b(atualize|atualizar|altere|alterar)\\b/)) return exact('companies.update', 'atualizar empresa')",
      "  if (has(/\\blead|leads\\b/) && has(/\\b(crie|criar|cadastre|cadastrar)\\b/)) return exact('leads.create', 'criar lead')",
      "",
      "  if (has(/\\b(mova|mover|movimente)\\b/) && has(/\\b(etapa|pipeline|funil|negociacao)\\b/)) {",
      "    if (has(/\\b(em lote|varios|varias|todos|todas|leads|oportunidades)\\b/)) return exact('leads.bulk_move', 'mover oportunidades em lote')",
      "    return exact('pipeline.move', 'mover oportunidade')",
      "  }",
      "  if (has(/\\b(ganha|ganho|ganhou|vencida|feche como ganha)\\b/)) return exact('pipeline.mark_won', 'marcar oportunidade ganha')",
      "  if (has(/\\b(perdida|perdeu|perdido|feche como perdida)\\b/)) return exact('pipeline.mark_lost', 'marcar oportunidade perdida')",
      "  if (has(/\\betapa\\b/) && has(/\\b(crie|criar|adicione|adicionar)\\b/)) return exact('pipeline.create_stage', 'criar etapa do pipeline')",
      "  if (has(/\\betapa\\b/) && has(/\\b(renomeie|renomear|atualize|atualizar|altere|alterar)\\b/)) return exact('pipeline.update_stage', 'atualizar etapa do pipeline')",
      "  if (has(/\\betapa\\b/) && has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('pipeline.delete_stage', 'excluir etapa do pipeline')",
      "",
      "  if (has(/\\btarefa|tarefas|lembrete|lembretes\\b/)) {",
      "    if (has(/\\b(conclua|concluir|complete|completar)\\b/)) return exact('tasks.complete', 'concluir tarefa')",
      "    if (has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('tasks.delete', 'excluir tarefa')",
      "    if (has(/\\b(crie|criar|adicione|adicionar|lembre|lembrar)\\b/)) return exact('tasks.create', 'criar tarefa')",
      "  }",
      "  if (has(/\\bcadencia|cadencias\\b/)) {",
      "    if (has(/\\b(pause|pausar|retome|retomar|encerre|encerrar|pare|parar)\\b/)) return exact('cadences.update_state', 'alterar estado de cadência')",
      "    return exact('cadences.create', 'criar cadência')",
      "  }",
      "  if (has(/\\bnota|notas\\b/) && has(/\\b(adicione|adicionar|registre|registrar|crie|criar)\\b/)) return exact('activities.create_note', 'criar nota')",
      "  if (has(/\\bfollow[- ]?up|atividade|atividades\\b/)) {",
      "    if (has(/\\b(resultado|desfecho|demonstrou interesse|interessado|respondeu|nao respondeu)\\b/)) return exact('activities.register_outcome', 'registrar resultado de atividade')",
      "    if (has(/\\b(reagende|reagendar|atualize|atualizar|altere|alterar|mude|mudar)\\b/)) return exact('activities.update', 'atualizar atividade')",
      "    if (has(/\\b(conclua|concluir|complete|completar)\\b/)) return exact('activities.complete', 'concluir atividade')",
      "    if (has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('activities.delete', 'excluir atividade')",
      "    if (has(/\\b(crie|criar|adicione|adicionar|agende|agendar)\\b/)) return exact('activities.create_followup', 'criar follow-up')",
      "  }",
      "",
      "  if (has(/\\breuniao|compromisso|evento|agenda|calendario\\b/)) {",
      "    if (has(/\\b(reagende|reagendar|atualize|atualizar|altere|alterar)\\b/)) return exact('calendar.update', 'atualizar compromisso')",
      "    if (has(/\\b(cancele|cancelar|exclua|excluir|apague|apagar)\\b/)) return exact('calendar.delete', 'cancelar compromisso')",
      "    if (has(/\\b(marque|marcar|agende|agendar|crie|criar)\\b/)) return exact('calendar.create', 'criar compromisso')",
      "  }",
      "",
      "  if (has(/\\bligacao|ligacoes|telefonema|telefonemas|discador|gravacao\\b/)) {",
      "    if (has(/\\bgravacao\\b/) && has(/\\b(abra|abrir|mostre|mostrar)\\b/)) return exact('calls.recording_url', 'abrir gravação de ligação')",
      "    if (has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('calls.delete', 'excluir registro de ligação')",
      "    if (has(/\\b(proxima acao|proxima tentativa|agende a proxima|schedule next|retorno)\\b/) && has(/\\b(registre|registrar|resultado|desfecho|pediu)\\b/)) return exact('calls.register_outcome', 'registrar ligação com próxima ação')",
      "    if (has(/\\b(registre|registrar|resultado|desfecho|atendeu|nao atendeu|ocupado|caixa postal)\\b/)) return exact('calls.log_outcome', 'registrar resultado de ligação')",
      "    if (has(/\\b(ligue|ligar|abra|abrir)\\b/)) return exact('calls.open', 'abrir ligação')",
      "  }",
      "",
      "  if (has(/\\bbuyer room|sala de negociacao\\b/)) {",
      "    if (has(/\\bnovo link|gere novo link|rotacione|rotacionar\\b/)) return exact('buyer_rooms.rotate_token', 'gerar novo link de Buyer Room')",
      "    if (has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('buyer_rooms.delete', 'excluir Buyer Room')",
      "    if (has(/\\b(atualize|atualizar|altere|alterar)\\b/)) return exact('buyer_rooms.update', 'atualizar Buyer Room')",
      "    return exact('buyer_rooms.create', 'criar Buyer Room')",
      "  }",
      "  if (has(/\\bcatalogo|produto|produtos|servico|servicos\\b/)) {",
      "    if (has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('catalog.delete_product', 'excluir item de catálogo')",
      "    if (has(/\\b(atualize|atualizar|altere|alterar)\\b/)) return exact('catalog.update_product', 'atualizar item de catálogo')",
      "    if (has(/\\b(crie|criar|adicione|adicionar|cadastre|cadastrar)\\b/)) return exact('catalog.create_product', 'criar item de catálogo')",
      "  }",
      "  if (has(/\\bproposta|propostas\\b/)) {",
      "    if (has(/\\brevisao|revisão|nova versao|nova versão\\b/)) return exact('proposals.create_revision', 'criar revisão de proposta')",
      "    if (has(/\\boficial\\b/)) return exact('proposals.make_official', 'definir proposta oficial')",
      "    if (has(/\\bfeche|fechar\\b/) && has(/\\boportunidade|negocio\\b/)) return exact('proposals.close_opportunity', 'fechar oportunidade pela proposta')",
      "    if (has(/\\bstatus\\b/) && has(/\\b(altere|alterar|mude|mudar|atualize|atualizar)\\b/)) return exact('proposals.update_status', 'alterar status da proposta')",
      "    if (has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('proposals.delete', 'excluir proposta')",
      "    if (has(/\\b(altere|alterar|atualize|atualizar|validade|probabilidade|termos)\\b/)) return exact('proposals.update', 'atualizar proposta')",
      "    if (has(/\\b(crie|criar|monte|montar|gere|gerar)\\b/)) return exact('proposals.create', 'criar proposta')",
      "  }",
      "",
      "  if (has(/\\bmeta|metas|quota|objetivo|objetivos|alvo|alvos\\b/)) {",
      "    if (has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('goals.delete', 'excluir meta')",
      "    if (has(/\\b(atualize|atualizar|altere|alterar|mude|mudar)\\b/)) return exact('goals.update', 'atualizar meta')",
      "    return exact('goals.create', 'criar meta')",
      "  }",
      "  if (has(/\\bplaybook|roteiro comercial|script de vendas|script comercial\\b/)) {",
      "    if (has(/\\b(exclua|excluir|apague|apagar)\\b/)) return exact('playbooks.delete', 'excluir playbook')",
      "    if (has(/\\b(atualize|atualizar|altere|alterar|renomeie|renomear)\\b/)) return exact('playbooks.update', 'atualizar playbook')",
      "    return exact('playbooks.create', 'criar playbook')",
      "  }",
      "",
      "  if (has(/\\bautomacao|automacoes|automatizacao\\b/)) {",
      "    if (has(/\\bsimule|simular|teste sem executar\\b/)) return exact('automations.simulate', 'simular automação')",
      "    if (has(/\\bdesative|desativar|ative|ativar|ligue|desligue\\b/)) return exact('automations.toggle', 'ligar ou desligar automação')",
      "    if (has(/\\brenomeie|renomear|atualize|atualizar|altere|alterar\\b/)) return exact('automations.update', 'atualizar automação')",
      "    if (has(/\\bcrie|criar\\b/)) return exact('automations.create', 'criar automação')",
      "    if (has(/\\bdesfaca|desfazer\\b/) && has(/\\bexecucao|run\\b/)) return exact('automations.undo_run', 'desfazer execução de automação')",
      "    if (has(/\\bverifique|verificar|checks|checagens\\b/)) return exact('automations.run_checks', 'executar verificações de automação')",
      "    if (has(/\\bexecute|executar|rode|rodar\\b/)) return exact('automations.run', 'executar automação')",
      "    if (has(/\\bexclua|excluir|apague|apagar\\b/)) return exact('automations.delete', 'excluir automação')",
      "  }",
      "",
      "  if (has(/\\bconvide|convidar|convite\\b/) && has(/@|\\bequipe\\b/)) return exact('teams.invite', 'convidar membro da equipe')",
      "  if (has(/\\bmembro|workspace\\b/) && has(/\\b(adicione|adicionar|crie|criar)\\b/)) return exact('teams.create_member', 'adicionar membro ao workspace')",
      "  if (has(/\\bpapel|role|funcao\\b/) && has(/\\b(altere|alterar|atualize|atualizar|mude|mudar)\\b/)) return exact('teams.update_role', 'alterar papel de membro')",
      "  if (has(/\\bmembro\\b/) && has(/\\b(remova|remover|exclua|excluir)\\b/)) return exact('teams.remove_member', 'remover membro')",
      "",
      "  if (has(/\\breceita|faturamento\\b/)) {",
      "    if (has(/\\bstatus|reconhecida|reconhecido|cancele|cancelar\\b/) && has(/\\b(atualize|atualizar|marque|marcar|reconhec|cancel)\\w*/)) return exact('revenue.update_status', 'atualizar status de receita')",
      "    if (has(/\\b(lance|lancar|crie|criar|registre|registrar)\\b/)) return exact('revenue.create', 'criar lançamento de receita')",
      "  }",
      "",
      "  if (has(/\\bgarimpo|garimpar|garimpe|prospeccao|prospects|icp|ranqueie|ranking\\b/)) {",
      "    if (has(/\\bicp|perfil de cliente ideal\\b/) && has(/\\b(crie|criar|monte|montar)\\b/)) return exact('prospecting.build_icp', 'construir ICP')",
      "    if (has(/\\branqueie|ranquear|priorize|priorizar|ranking\\b/)) return exact('prospecting.rank', 'ranquear prospects')",
      "    if (has(/\\baprove|aprovar\\b/)) return exact('prospecting.approve_top', 'aprovar melhores prospects')",
      "    if (has(/\\bdescarte|descartar\\b/)) return exact('prospecting.discard_low', 'descartar prospects fracos')",
      "    if (has(/\\bmande para o crm|enviar para o crm|coloque no crm|colocar no crm\\b/)) return exact('prospecting.send_to_crm', 'enviar prospects ao CRM')",
      "    if (has(/\\banalise|analisar|recalcule|recalcular\\b/)) return exact('prospecting.analyze', 'analisar prospects')",
      "    if (has(/\\b(encontre|encontrar|procure|procurar|busque|buscar|garimpe|garimpar)\\b/)) return exact('prospecting.search', 'buscar prospects')",
      "  }",
      "",
      "  if (has(/\\bauditoria|logs de auditoria|eventos de auditoria\\b/)) return exact('workspace.audit_logs', 'consultar auditoria do workspace')",
      "  if (has(/\\bsincronize a estrutura|sincronizar a estrutura|estrutura comercial\\b/)) return exact('workspace.sync_structure', 'sincronizar estrutura comercial')",
      "  if (has(/\\bmembros do workspace|liste os membros\\b/)) return exact('workspace.members', 'listar membros do workspace')",
      "  if (has(/\\bconvites do workspace|liste os convites\\b/)) return exact('workspace.invites', 'listar convites do workspace')",
      "  if (has(/\\bcrie um workspace|criar workspace\\b/)) return exact('workspace.create', 'criar workspace')",
      "  if (has(/\\btroque o workspace|mude o workspace|selecionar workspace\\b/)) return exact('workspace.select', 'trocar workspace')",
      "  if (has(/\\b(limpe|limpar)\\b/) && has(/\\bdados operacionais\\b/)) return exact('workspace.clear_operational_data', 'limpar dados operacionais')",
      "",
      "  if (has(/\\b(mostre|mostrar|liste|listar|quais|quantos|consulte|consultar)\\b/)) return exact('crm.query', 'consulta estruturada do CRM')",
      "  return null",
      "}",
      "",
    ].join('\n')

    const insertionPoint = 'const callInnerPlanner = async (body, reqHeaders = {}) => {'
    if (!next.includes(insertionPoint)) throw new Error('Não encontrei o ponto seguro para instalar o roteador de capability.')
    next = next.replace(insertionPoint, `${capabilityHelper}\n${insertionPoint}`)
  }

  const narrowedBlock = "    const narrowed = selectedModules.size\n      ? capabilities.filter((item) => selectedModules.has(item.module))\n      : capabilities\n\n    console.log(`[ollama-router] primary=${routing.primaryModule || 'none'} modules=${[...selectedModules].join(',') || 'all'} capabilities=${capabilities.length}->${narrowed.length} confidence=${routing.confidence} intent=${routing.rationale}`)\n\n    const { response, payload } = await callInnerPlanner({ ...body, capabilities: narrowed }, req.headers)"
  if (next.includes(narrowedBlock)) {
    const replacement = "    const narrowed = selectedModules.size\n      ? capabilities.filter((item) => selectedModules.has(item.module))\n      : capabilities\n\n    const capabilityRouting = semanticCapabilityAnchor(String(body.prompt), narrowed, pendingId)\n    const finalCapabilities = capabilityRouting?.ids?.length\n      ? narrowed.filter((item) => capabilityRouting.ids.includes(item.id))\n      : narrowed\n\n    console.log(`[ollama-router] primary=${routing.primaryModule || 'none'} modules=${[...selectedModules].join(',') || 'all'} capabilities=${capabilities.length}->${narrowed.length}->${finalCapabilities.length} confidence=${routing.confidence} intent=${routing.rationale} capability=${capabilityRouting?.ids?.join(',') || 'model-choice'}`)\n\n    const { response, payload } = await callInnerPlanner({ ...body, capabilities: finalCapabilities }, req.headers)"
    next = next.replace(narrowedBlock, replacement)
  }

  next = next.replace('routedCapabilityCount: narrowed.length,', 'routedCapabilityCount: finalCapabilities.length,')
  return next
})

if (!gateway.includes('const semanticDomainAnchor =')) throw new Error('O roteador híbrido não foi instalado pelo enable-universal-agent.mjs.')
if (!gateway.includes('const semanticCapabilityAnchor =')) throw new Error('O roteador de capability não foi instalado.')
if (!gateway.includes('requiredSlots: Array.isArray(capability?.requiredSlots)')) throw new Error('requiredSlots não estão chegando ao planner universal.')
if (gateway.includes('contato|ana|bruno|pessoa|pessoas')) throw new Error('O roteador contém nomes de teste hardcoded; a regra precisa permanecer genérica.')
if (gateway.includes("pick('contacts'")) throw new Error("O roteador ainda usa o domínio técnico inexistente 'contacts'; Contatos deve rotear pelo AppRoute 'leads'.")
if (!gateway.includes("notificação, undo ou navegação global explícita")) throw new Error('O domínio global não recebeu âncora para notificações/undo.')

const planner = patch('runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-capability-planner.mjs', (source) => {
  let next = source
  const brokenEnding = '26. Responda SOMENTE no schema solicitado.\n\nconst text ='
  if (next.includes('DESAMBIGUAÇÃO UNIVERSAL DE CAPABILITIES') && next.includes(brokenEnding)) {
    next = next.replace(brokenEnding, '26. Responda SOMENTE no schema solicitado.`\n\nconst text =')
  }
  return next
})

if (planner.includes('DESAMBIGUAÇÃO UNIVERSAL DE CAPABILITIES') && !planner.includes('26. Responda SOMENTE no schema solicitado.`\n\nconst text =')) {
  throw new Error('O bloco de instruções do planner ficou sem fechamento seguro da template string.')
}

const matrix = patch('src/services/realtalent-ollama-crm-matrix.integration.test.ts', (source) => {
  let next = source
  const urlAnchor = "const agentUrl = String(process.env.REALTALENT_AGENT_TEST_URL || 'http://127.0.0.1:8791').replace(/\\/$/, '')\n"
  if (next.includes(urlAnchor) && !next.includes('REALTALENT_MATRIX_FROM')) {
    next = next.replace(urlAnchor, `${urlAnchor}const matrixFrom = Math.max(0, Number(process.env.REALTALENT_MATRIX_FROM || 0))\nconst matrixToRaw = Number(process.env.REALTALENT_MATRIX_TO || Number.MAX_SAFE_INTEGER)\nconst matrixTo = Number.isFinite(matrixToRaw) ? Math.max(matrixFrom, matrixToRaw) : Number.MAX_SAFE_INTEGER\n`)
  }
  const askAnchor = '\nconst askPlanner = async (item: MatrixCase) => {'
  if (next.includes(askAnchor) && !next.includes('const RUN_CASES =')) {
    next = next.replace(askAnchor, `\nconst RUN_CASES = CASES.slice(matrixFrom, matrixTo)\n${askAnchor}`)
  }
  next = next.replace('  for (const item of CASES) {', '  for (const item of RUN_CASES) {')
  return next
})

if (!matrix.includes('const RUN_CASES = CASES.slice(matrixFrom, matrixTo)')) throw new Error('A matriz universal não recebeu suporte a execução em lotes.')

const syntaxCheck = (relative) => {
  const file = path.resolve(root, relative)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(`Falha de sintaxe em ${relative}:\n${detail}`)
  }
  console.log(`✓ Sintaxe validada: ${relative}`)
}

syntaxCheck('runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-capability-planner.mjs')
syntaxCheck('runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs')

console.log('✓ Universal Agent hardening aplicado.')
