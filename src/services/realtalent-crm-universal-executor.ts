import { createId } from '../lib/id'
import { DEFAULT_CADENCE_TEMPLATES } from './followup-workspace'
import { executeCrmCapabilityStep as executeBaseCrmCapabilityStep, undoCrmAgentOperation, type CrmCapabilityExecutionRuntime, type CrmCapabilityStepResult } from './realtalent-crm-capability-executor'
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import { UNIVERSAL_EXTRA_CAPABILITIES } from './realtalent-crm-universal-capabilities'
import { executeUniversalContacts } from './realtalent-crm-universal-executor-contacts'
import { assertRecordU, parseJson, resolveActivityU, resolveAutomationU, resolveBuyerRoomU, resolveContactU, resolveLeadU, resolveLeadsU, resolveProductU, resolveProposalU, targetQuery, uarg, ubest, ubool, uiso, unormalize, unum } from './realtalent-crm-universal-executor-helpers'
import { formatSalesAgentDealAnalysis, formatSalesAgentNextBestAction } from './realtalent-sales-intelligence-agent'

export { undoCrmAgentOperation }
export type { CrmCapabilityExecutionRuntime, CrmCapabilityStepResult }

const SALES_INTELLIGENCE_IDS = ['sales.analyze_deal', 'sales.next_best_action'] as const
const EXTRA_IDS = new Set([...UNIVERSAL_EXTRA_CAPABILITIES.filter((item) => item.execution === 'native').map((item) => item.id), ...SALES_INTELLIGENCE_IDS])

const activityOutcome = (value: string) => {
  const key = unormalize(value)
  const aliases: Record<string, string> = {
    respondeu: 'answered', answered: 'answered', 'nao respondeu': 'no_response', no_response: 'no_response',
    retorno: 'callback_requested', callback_requested: 'callback_requested', interessado: 'interested', interested: 'interested',
    proposta: 'proposal_requested', proposal_requested: 'proposal_requested', reuniao: 'meeting_scheduled', meeting_scheduled: 'meeting_scheduled',
    'nao decisor': 'not_decision_maker', not_decision_maker: 'not_decision_maker', 'contato invalido': 'invalid_contact', invalid_contact: 'invalid_contact',
    'sem interesse': 'not_interested', not_interested: 'not_interested', ganhou: 'won', won: 'won', perdeu: 'lost', lost: 'lost',
  }
  return aliases[key] || key.replace(/\s+/g, '_')
}

const callOutcome = (value: string) => {
  const key = unormalize(value)
  const aliases: Record<string, string> = {
    atendeu: 'answered', answered: 'answered', 'nao atendeu': 'no_answer', 'sem resposta': 'no_answer', no_answer: 'no_answer',
    ocupado: 'busy', busy: 'busy', 'caixa postal': 'voicemail', voicemail: 'voicemail', retorno: 'callback_requested', callback_requested: 'callback_requested',
    interessado: 'interested', interested: 'interested', reuniao: 'meeting_scheduled', meeting_scheduled: 'meeting_scheduled', proposta: 'proposal_requested', proposal_requested: 'proposal_requested',
    'sem interesse': 'not_interested', not_interested: 'not_interested', venda: 'sale_completed', sale_completed: 'sale_completed', outro: 'other', other: 'other',
  }
  return aliases[key] || key.replace(/\s+/g, '_')
}

async function executeFollowupAndCalls(step: CrmCapabilityPlanStep, runtime: CrmCapabilityExecutionRuntime): Promise<CrmCapabilityStepResult | null> {
  const { actions, snapshot } = runtime
  if (step.capabilityId === 'activities.update') {
    const activity = resolveActivityU(runtime, targetQuery(step)); if (!activity) throw new Error('Não encontrei a atividade/follow-up.')
    assertRecordU(runtime, 'tasks', activity.assignedTo)
    const patch: Record<string, unknown> = {}
    const fields: Record<string,string> = { title:'title', description:'description', due_at:'dueAt', assigned_to:'assignedTo', resolution_status:'resolutionStatus', resolution_reason:'resolutionReason' }
    for (const [input, output] of Object.entries(fields)) { const value = uarg(step, input); if (value) patch[output] = input === 'due_at' ? (uiso(value) || value) : value }
    await actions.updateActivity(activity.id, patch as any)
    return { ok: true, summary: `Atividade “${activity.title}” atualizada.` }
  }
  if (step.capabilityId === 'activities.register_outcome') {
    const activity = resolveActivityU(runtime, targetQuery(step)); if (!activity) throw new Error('Não encontrei a atividade/follow-up.')
    assertRecordU(runtime, 'tasks', activity.assignedTo)
    const stage = uarg(step, 'stage_query') ? ubest(snapshot.stages, uarg(step, 'stage_query'), (item) => [item.id, item.name]) : null
    await actions.registerActivityOutcome({ activityId: activity.id, outcome: activityOutcome(uarg(step, 'outcome')) as any, resultTitle: uarg(step, 'result_title') || `Resultado · ${activity.title}`, resultDescription: uarg(step, 'result_description'), createNext: ubool(uarg(step, 'create_next')), nextType: (uarg(step, 'next_type') || null) as any, nextTitle: uarg(step, 'next_title') || null, nextDescription: uarg(step, 'next_description') || null, nextAt: uarg(step, 'next_at') ? (uiso(uarg(step, 'next_at')) || uarg(step, 'next_at')) : null, stageId: stage?.id ?? null } as any)
    return { ok: true, summary: `Resultado registrado em “${activity.title}”.` }
  }
  if (step.capabilityId === 'cadences.create') {
    const leads = resolveLeadsU(runtime, uarg(step, 'record_queries')); if (!leads.length) throw new Error('Não encontrei os leads para iniciar a cadência.')
    const template = uarg(step, 'template_name') ? ubest(DEFAULT_CADENCE_TEMPLATES, uarg(step, 'template_name'), (item) => [item.id, item.name, item.category, item.description]) : DEFAULT_CADENCE_TEMPLATES[0]
    if (!template) throw new Error('Não encontrei um modelo de cadência válido.')
    const count = await actions.createCadence(leads.map((item) => item.id), uiso(uarg(step, 'first_due_at')) || new Date().toISOString(), template)
    return { ok: true, summary: `Cadência “${template.name}” criada para ${count} lead(s).` }
  }
  if (step.capabilityId === 'cadences.update_state') {
    const cadenceId = uarg(step, 'cadence_id').trim(); if (!cadenceId) throw new Error('Informe o ID da cadência.')
    const action = unormalize(uarg(step, 'action')) as 'pause' | 'resume' | 'stop'; if (!['pause','resume','stop'].includes(action)) throw new Error('Ação da cadência deve ser pause, resume ou stop.')
    const lead = uarg(step, 'lead_query') ? resolveLeadU(runtime, uarg(step, 'lead_query')) : null
    const count = await actions.updateCadenceState(cadenceId, action, lead?.id ?? null)
    return { ok: true, summary: `${count} item(ns) da cadência atualizado(s) para ${action}.` }
  }
  if (step.capabilityId === 'calls.register_outcome') {
    const lead = resolveLeadU(runtime, uarg(step, 'record_query') || uarg(step, 'lead_query')); const contact = resolveContactU(runtime, uarg(step, 'contact_query'))
    const linkedLead = lead ?? (contact ? snapshot.leads.find((item) => contact.leadIds.includes(item.id) || item.primaryContactId === contact.id) ?? null : null)
    if (!linkedLead) throw new Error('Não encontrei o lead/contato da ligação.')
    assertRecordU(runtime, 'contacts', linkedLead.ownerId)
    const endedAt = uiso(uarg(step, 'ended_at')) || new Date().toISOString(); const durationSeconds = Math.max(0, Math.round(unum(uarg(step, 'duration_seconds'), 0)))
    const startedAt = uiso(uarg(step, 'started_at')) || new Date(new Date(endedAt).getTime() - durationSeconds * 1000).toISOString()
    await actions.registerCallOutcome({ leadId: linkedLead.id, contactId: contact?.id ?? linkedLead.primaryContactId ?? null, outcome: callOutcome(uarg(step, 'outcome') || 'answered') as any, durationSeconds, notes: uarg(step, 'notes'), transcript: '', recordingPath: null, consentAt: null, startedAt, endedAt, scheduleNext: ubool(uarg(step, 'schedule_next')), nextAt: uarg(step, 'next_at') ? (uiso(uarg(step, 'next_at')) || uarg(step, 'next_at')) : null, meetingDurationMinutes: Math.max(5, Math.round(unum(uarg(step, 'meeting_duration_minutes'), 30))) } as any)
    return { ok: true, summary: `Ligação de ${linkedLead.company || linkedLead.name} registrada com o fluxo comercial completo.` }
  }
  if (step.capabilityId === 'calls.delete') {
    const call = ubest(snapshot.calls, targetQuery(step), (item) => [item.id, item.notes, item.outcome, item.startedAt]); if (!call) throw new Error('Não encontrei o registro de ligação.')
    const lead = snapshot.leads.find((item) => item.id === call.leadId); if (lead) assertRecordU(runtime, 'contacts', lead.ownerId)
    await actions.deleteCall(call.id); return { ok: true, summary: 'Registro de ligação excluído.' }
  }
  return null
}

async function executeSales(step: CrmCapabilityPlanStep, runtime: CrmCapabilityExecutionRuntime): Promise<CrmCapabilityStepResult | null> {
  const { actions, snapshot } = runtime
  if (step.capabilityId === 'sales.analyze_deal' || step.capabilityId === 'sales.next_best_action') {
    const lead = resolveLeadU(runtime, targetQuery(step)); if (!lead) throw new Error('Não encontrei o lead ou a oportunidade para analisar.')
    assertRecordU(runtime, 'pipeline', lead.ownerId)
    const summary = step.capabilityId === 'sales.analyze_deal'
      ? formatSalesAgentDealAnalysis(lead, snapshot)
      : formatSalesAgentNextBestAction(lead, snapshot)
    return { ok: true, summary }
  }
  if (step.capabilityId === 'proposals.update' || step.capabilityId === 'proposals.create_revision') {
    const proposal = resolveProposalU(runtime, targetQuery(step)); if (!proposal) throw new Error('Não encontrei a proposta.')
    assertRecordU(runtime, 'proposals', proposal.ownerId)
    if (step.capabilityId === 'proposals.create_revision') { const revision = await actions.createProposalRevision(proposal.id); return { ok: true, summary: `Revisão ${revision.version} criada para a proposta “${proposal.title}”.` } }
    const patch: Record<string, unknown> = {}
    const fields: Record<string,string> = { title:'title', probability:'probability', valid_until:'validUntil', expected_close_at:'expectedCloseAt', contract_start_at:'contractStartAt', contract_end_at:'contractEndAt', contract_term_months:'contractTermMonths', auto_renew:'autoRenew', notes:'notes', terms:'terms' }
    for (const [input, output] of Object.entries(fields)) { const value = uarg(step, input); if (!value) continue; patch[output] = input === 'probability' || input === 'contract_term_months' ? unum(value) : input === 'auto_renew' ? ubool(value) : ['valid_until','expected_close_at','contract_start_at','contract_end_at'].includes(input) ? (uiso(value) || value) : value }
    await actions.updateProposal(proposal.id, patch as any); return { ok: true, summary: `Proposta “${proposal.title}” atualizada.` }
  }
  if (step.capabilityId === 'catalog.reconcile_proposal_items') {
    const product = resolveProductU(runtime, uarg(step, 'product_query')); if (!product) throw new Error('Não encontrei o produto do catálogo.')
    const legacyName = uarg(step, 'legacy_name').trim(); if (!legacyName) throw new Error('Informe o nome legado do item.')
    const count = await actions.reconcileProposalItems(legacyName, product.id); return { ok: true, summary: `${count} item(ns) reconciliado(s) com ${product.name}.` }
  }
  if (step.capabilityId.startsWith('buyer_rooms.')) {
    if (step.capabilityId === 'buyer_rooms.create') {
      const proposal = resolveProposalU(runtime, uarg(step, 'proposal_query') || targetQuery(step)); if (!proposal) throw new Error('Não encontrei a proposta para criar a Buyer Room.')
      assertRecordU(runtime, 'proposals', proposal.ownerId)
      const room = await actions.createBuyerRoom({ leadId: proposal.leadId, opportunityId: proposal.opportunityId, proposalId: proposal.id, companyId: proposal.companyId, title: uarg(step, 'title') || `Negociação · ${proposal.title}`, welcomeMessage: uarg(step, 'welcome_message'), status: 'draft', shareToken: createId('buyer-room'), shareEnabled: ubool(uarg(step, 'share_enabled')), expiresAt: uarg(step, 'expires_at') ? (uiso(uarg(step, 'expires_at')) || uarg(step, 'expires_at')) : null, participants: [], steps: [], documents: [] } as any)
      return { ok: true, summary: `Buyer Room “${room.title}” criada.` }
    }
    const room = resolveBuyerRoomU(runtime, targetQuery(step)); if (!room) throw new Error('Não encontrei a Buyer Room.')
    if (step.capabilityId === 'buyer_rooms.delete') { await actions.deleteBuyerRoom(room.id); return { ok: true, summary: `Buyer Room “${room.title}” excluída.` } }
    if (step.capabilityId === 'buyer_rooms.rotate_token') { const updated = await actions.rotateBuyerRoomToken(room.id); return { ok: true, summary: `Novo link gerado para “${updated.title}”.` } }
    const patch: Record<string, unknown> = {}
    if (uarg(step, 'title')) patch.title = uarg(step, 'title'); if (uarg(step, 'welcome_message')) patch.welcomeMessage = uarg(step, 'welcome_message'); if (uarg(step, 'status')) patch.status = uarg(step, 'status'); if (uarg(step, 'share_enabled')) patch.shareEnabled = ubool(uarg(step, 'share_enabled')); if (uarg(step, 'expires_at')) patch.expiresAt = uiso(uarg(step, 'expires_at')) || uarg(step, 'expires_at')
    await actions.updateBuyerRoom(room.id, patch as any); return { ok: true, summary: `Buyer Room “${room.title}” atualizada.` }
  }
  return null
}

async function executeAutomationAndWorkspace(step: CrmCapabilityPlanStep, runtime: CrmCapabilityExecutionRuntime): Promise<CrmCapabilityStepResult | null> {
  const { actions, snapshot } = runtime
  if (step.capabilityId === 'automations.create') {
    const name = uarg(step, 'name').trim(); if (!name) throw new Error('Informe o nome da automação.')
    const conditions = parseJson<any[]>(uarg(step, 'conditions_json'), []).map((item) => ({ ...item, id: item.id || createId('condition') }))
    const automationActions = parseJson<any[]>(uarg(step, 'actions_json'), []).map((item) => ({ ...item, id: item.id || createId('action') }))
    const rule = await actions.createAutomationRule({ name, enabled: uarg(step, 'enabled') ? ubool(uarg(step, 'enabled')) : false, triggerType: (uarg(step, 'trigger_type') || 'manual') as any, conditions, actions: automationActions } as any)
    return { ok: true, summary: `Automação “${rule.name}” criada${rule.enabled ? ' e ativada' : ' desativada para revisão'}.` }
  }
  if (step.capabilityId === 'automations.simulate') {
    const rule = resolveAutomationU(runtime, targetQuery(step)); const lead = resolveLeadU(runtime, uarg(step, 'lead_query')); if (!rule || !lead) throw new Error('Informe a automação e o lead para simulação.')
    await actions.simulateAutomationRule(rule.id, lead.id); return { ok: true, summary: `Simulação de “${rule.name}” concluída para ${lead.company || lead.name}.` }
  }
  if (step.capabilityId === 'automations.run_checks') { const count = await actions.runAutomationChecks(); return { ok: true, summary: `Verificações de automação concluídas: ${count} execução(ões) processada(s).` } }
  if (step.capabilityId === 'automations.undo_run') {
    const run = ubest(snapshot.automationRuns, uarg(step, 'run_query'), (item) => [item.id, item.eventKey, item.status]); if (!run) throw new Error('Não encontrei a execução de automação.')
    await actions.undoAutomationRun(run.id); return { ok: true, summary: `Execução ${run.id.slice(0, 8)} desfeita.` }
  }
  if (step.capabilityId === 'workspace.create') { const name = uarg(step, 'name').trim(); if (!name) throw new Error('Informe o nome do workspace.'); await actions.createWorkspace(name); return { ok: true, summary: `Workspace “${name}” criado.` } }
  if (step.capabilityId === 'workspace.select') { const id = uarg(step, 'workspace_id').trim(); if (!id) throw new Error('Informe o ID do workspace.'); await actions.setCurrentWorkspace(id); return { ok: true, summary: 'Workspace atual alterado.' } }
  if (step.capabilityId === 'workspace.members') { const members = await actions.listWorkspaceMembers(); return { ok: true, summary: members.length ? `${members.length} membro(s): ${members.slice(0, 25).map((item) => `${item.displayName || item.email} (${item.role})`).join(' · ')}` : 'Nenhum membro encontrado.' } }
  if (step.capabilityId === 'workspace.invites') { const invites = await actions.listWorkspaceInvites(); return { ok: true, summary: invites.length ? `${invites.length} convite(s): ${invites.slice(0, 25).map((item) => `${item.email} (${item.role})`).join(' · ')}` : 'Nenhum convite encontrado.' } }
  if (step.capabilityId === 'workspace.audit_logs') { const logs = await actions.listAuditLogs(Math.max(1, Math.min(100, Math.round(unum(uarg(step, 'limit'), 20))))); return { ok: true, summary: logs.length ? `${logs.length} evento(s) de auditoria. ${logs.slice(0, 20).map((item) => `${item.action} · ${item.entityType}`).join(' | ')}` : 'Nenhum evento de auditoria encontrado.' } }
  if (step.capabilityId === 'workspace.sync_structure') { const result = await actions.synchronizeCommercialStructure(); return { ok: true, summary: `Estrutura sincronizada: ${result.companiesCreated} empresa(s), ${result.contactsCreated} contato(s), ${result.opportunitiesCreated} oportunidade(s) e ${result.socialProfilesCreated} perfil(is) social(is) criados.` } }
  if (step.capabilityId === 'workspace.clear_operational_data') { const result = await actions.clearOperationalData(); return { ok: true, summary: `Dados operacionais limpos: ${result.total} registro(s).` } }
  return null
}

export async function executeCrmCapabilityStep(step: CrmCapabilityPlanStep, runtime: CrmCapabilityExecutionRuntime): Promise<CrmCapabilityStepResult> {
  if (!EXTRA_IDS.has(step.capabilityId)) return executeBaseCrmCapabilityStep(step, runtime)
  const contactResult = await executeUniversalContacts(step, runtime); if (contactResult) return contactResult
  const followupResult = await executeFollowupAndCalls(step, runtime); if (followupResult) return followupResult
  const salesResult = await executeSales(step, runtime); if (salesResult) return salesResult
  const adminResult = await executeAutomationAndWorkspace(step, runtime); if (adminResult) return adminResult
  throw new Error(`A capability universal ${step.capabilityId} ainda não possui implementação.`)
}