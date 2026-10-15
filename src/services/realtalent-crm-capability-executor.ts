import type { AppActionsContextValue } from '../app/app-context'
import type { RouteContext } from '../app/route-state'
import type { AppRoute, TeamAccessAction, TeamAccessResource, TeamSensitiveField, WorkspaceSnapshot } from '../domain/types'
import type { EffectiveMemberAccess } from './team-access-control'
import { buildNotificationAlerts } from './notification-engine'
import type { NotificationPreferences } from './notification-preferences'
import { dismissNotifications, loadNotificationUiState, replaceDismissedNotifications, restoreDismissedNotifications } from './notification-state'
import { appendAgendaMetadata } from './agenda-workspace'
import { loadCommunicationChannelState, sendOfficialEmail } from './communication-workspace'
import { normalizeWhatsAppPhone, sendOfficialWhatsApp } from './whatsapp-workspace'
import { deleteTask, loadWorkManagement, saveTask, updateTaskStatus } from './work-management'
import { calculateProposalTotals, createProposalLineFromProduct } from './proposal-pricing'
import { createId } from '../lib/id'
import { crmCapabilityById } from './realtalent-crm-capabilities'
import { capabilityArg, type CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import type { CrmAgentUndoOperation } from './realtalent-crm-agent-transactions'
import { appendHistory as appendProspectingHistory, createProspect, readProspectingState, refreshProspectAnalysis, writeProspectingState, type ProspectRecord } from './prospecting-workspace'
import { prospectDataQuality } from './prospecting-data-layer'
import { buildProspectingIcp, prospectingIcpSummary, rankProspects, scoreProspectWithIcp } from './prospecting-intelligence'
import { existingProspectingIdentityKeys, createProspectingAgentJob, getProspectingAgentHealth } from './prospecting-linux-agent'
import { prospectingDraftIdentityKeys, runProspectingSearchAutomation } from './prospecting-search-automation'

export interface CrmCapabilityExecutionRuntime {
  workspaceId: string
  currentUserId: string | null
  snapshot: WorkspaceSnapshot
  repositoryMode: 'local' | 'supabase'
  teamAccess: EffectiveMemberAccess | null
  actions: AppActionsContextValue
  navigate(route: AppRoute, context?: RouteContext): void
  canTeamAccess(action: TeamAccessAction, resource: TeamAccessResource): boolean
  canTeamAccessRecord(resource: TeamAccessResource, ownerId?: string | null, teamId?: string | null): boolean
  notificationPreferences?: NotificationPreferences | null
  staleLeadDays?: number
}

export interface CrmCapabilityStepEvidence {
  source: 'repository' | 'gateway' | 'local_state' | 'prospecting_state'
  entityType?: string
  entityId?: string
  state?: string
  detail?: string
}

export interface CrmCapabilityStepResult {
  ok: boolean
  summary: string
  undo?: CrmAgentUndoOperation
  evidence?: CrmCapabilityStepEvidence
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@.+\-\s]/g, ' ').replace(/\s+/g, ' ').trim()
const arg = (step: CrmCapabilityPlanStep, name: string) => capabilityArg(step, name)
const num = (value: string, fallback = 0) => { const parsed = Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : fallback }
const bool = (value: string, fallback = false) => ['1','true','sim','yes','y','on','ativo','enabled'].includes(normalize(value)) ? true : ['0','false','nao','não','no','off','inativo','disabled'].includes(normalize(value)) ? false : fallback
const iso = (value: string) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : '' }
const normalizeCallOutcome = (value: string) => {
  const key = normalize(value)
  const aliases: Record<string, string> = {
    atendeu: 'answered', atendida: 'answered', answered: 'answered',
    'nao atendeu': 'no_answer', 'sem resposta': 'no_answer', no_answer: 'no_answer',
    ocupado: 'busy', busy: 'busy', caixa_postal: 'voicemail', voicemail: 'voicemail',
    retorno: 'callback_requested', callback: 'callback_requested', callback_requested: 'callback_requested',
    interessado: 'interested', interested: 'interested', reuniao: 'meeting_scheduled', meeting_scheduled: 'meeting_scheduled',
    proposta: 'proposal_requested', proposal_requested: 'proposal_requested', proposta_enviada: 'proposal_sent', proposal_sent: 'proposal_sent',
    pessoa_errada: 'wrong_person', wrong_person: 'wrong_person', numero_invalido: 'invalid_number', invalid_number: 'invalid_number',
    sem_interesse: 'not_interested', not_interested: 'not_interested', venda: 'sale_completed', sale_completed: 'sale_completed', outro: 'other', other: 'other',
  }
  const canonical = aliases[key] || key.replace(/\s+/g, '_')
  const allowed = new Set(['answered','no_answer','busy','voicemail','callback_requested','interested','meeting_scheduled','proposal_requested','proposal_sent','wrong_person','invalid_number','not_interested','sale_completed','other'])
  return allowed.has(canonical) ? canonical : ''
}
const normalizeGoalMetric = (value: string) => {
  const key = normalize(value)
  if (/^(calls?|ligacao|ligacoes)$/.test(key)) return 'calls'
  if (/^(contacts?|contatos?)$/.test(key)) return 'contacts'
  if (/^(follow ?ups?|retornos?)$/.test(key)) return 'followups'
  if (/^(meetings?|reuniao|reunioes)$/.test(key)) return 'meetings'
  if (/^(proposals?|propostas?)$/.test(key)) return 'proposals'
  if (/^(wins?|vendas?|ganhos?)$/.test(key)) return 'wins'
  if (/^(revenue|receita|faturamento)$/.test(key)) return 'revenue'
  if (/^(new leads?|novos? leads?|novos? contatos?)$/.test(key)) return 'new_leads'
  return key.replace(/\s+/g, '_')
}
const prospectIdentitySet = (prospects: ProspectRecord[]) => new Set(prospects.flatMap((item) => prospectingDraftIdentityKeys(item)))

const routeSet = new Set<AppRoute>(['dashboard','leads','commercial-map','pipeline','tasks','teams','followups','calls','communications','proposals','agenda','playbooks','goals','automations','metrics','prospecting','settings'])

const best = <T>(items: T[], query: string, fields: (item: T) => Array<string | null | undefined>): T | null => {
  if (!items.length) return null
  const q = normalize(query)
  if (!q) return items.length === 1 ? items[0] : null
  let winner: { item: T; score: number } | null = null
  for (const item of items) {
    const values = fields(item).filter(Boolean).map((value) => normalize(String(value)))
    let score = 0
    for (const value of values) {
      if (value === q) score = Math.max(score, 100)
      else if (value.startsWith(q) || q.startsWith(value)) score = Math.max(score, 85)
      else if (value.includes(q) || q.includes(value)) score = Math.max(score, 70)
      else {
        const tokens = q.split(' ').filter(Boolean)
        const matched = tokens.filter((token) => value.includes(token)).length
        score = Math.max(score, tokens.length ? Math.round((matched / tokens.length) * 60) : 0)
      }
    }
    if (!winner || score > winner.score) winner = { item, score }
  }
  return winner && winner.score >= 35 ? winner.item : null
}

const targetQuery = (step: CrmCapabilityPlanStep) => arg(step, 'record_id') || arg(step, 'record_query')
const resolveLead = (snapshot: WorkspaceSnapshot, step: CrmCapabilityPlanStep) => best(snapshot.leads, arg(step, 'lead_id') || arg(step, 'lead_query') || targetQuery(step), (item) => [item.id, item.name, item.company, item.phone, item.email])
const resolveContact = (snapshot: WorkspaceSnapshot, step: CrmCapabilityPlanStep) => best(snapshot.contacts, arg(step, 'contact_id') || arg(step, 'contact_query') || targetQuery(step), (item) => [item.id, item.name, item.phone, item.email, item.jobTitle])
const resolveCompany = (snapshot: WorkspaceSnapshot, step: CrmCapabilityPlanStep) => best(snapshot.companies, targetQuery(step), (item) => [item.id, item.name, item.legalName, item.cnpj, item.domain])
const resolveProposal = (snapshot: WorkspaceSnapshot, step: CrmCapabilityPlanStep) => best(snapshot.proposals, arg(step, 'proposal_id') || targetQuery(step), (item) => [item.id, item.proposalNumber, item.title])
const resolveStage = (snapshot: WorkspaceSnapshot, step: CrmCapabilityPlanStep, won?: boolean, lost?: boolean) => {
  if (won) return snapshot.stages.find((stage) => stage.isWon) ?? null
  if (lost) return snapshot.stages.find((stage) => stage.isLost) ?? null
  return best(snapshot.stages, arg(step, 'stage_id') || arg(step, 'stage_query'), (item) => [item.id, item.name])
}

const fieldAccessAllowed = (runtime: CrmCapabilityExecutionRuntime, field: TeamSensitiveField, action: 'view' | 'edit' = 'view') => {
  if (runtime.teamAccess?.role === 'owner' || runtime.teamAccess?.role === 'admin') return true
  const level = runtime.teamAccess?.profile.fieldAccess?.[field] ?? 'hidden'
  return action === 'edit' ? level === 'edit' : level !== 'hidden'
}

const assertSensitiveCapabilityField = (runtime: CrmCapabilityExecutionRuntime, field: TeamSensitiveField, action: 'view' | 'edit' = 'view') => {
  if (!fieldAccessAllowed(runtime, field, action)) throw new Error(`Seu perfil não permite ${action === 'edit' ? 'alterar' : 'visualizar'} este campo sensível.`)
}

const assertRecordAccess = (runtime: CrmCapabilityExecutionRuntime, resource: TeamAccessResource, ownerId?: string | null, teamId?: string | null) => {
  if (!runtime.canTeamAccessRecord(resource, ownerId, teamId)) throw new Error('Este registro está fora do escopo permitido para o seu perfil/equipe.')
}

const contactOwnerId = (snapshot: WorkspaceSnapshot, contactId: string) => {
  const contact = snapshot.contacts.find((item) => item.id === contactId)
  if (!contact) return null
  if (contact.relationshipOwnerId) return contact.relationshipOwnerId
  return snapshot.leads.find((lead) => contact.leadIds.includes(lead.id))?.ownerId ?? null
}

const companyOwnerId = (snapshot: WorkspaceSnapshot, companyId: string) => snapshot.leads.find((lead) => lead.companyId === companyId)?.ownerId ?? null

const ensurePermission = (runtime: CrmCapabilityExecutionRuntime, step: CrmCapabilityPlanStep) => {
  const definition = crmCapabilityById(step.capabilityId)
  if (!definition) throw new Error(`Capacidade desconhecida: ${step.capabilityId}`)
  if (definition.resource && definition.permissionAction && !runtime.canTeamAccess(definition.permissionAction, definition.resource)) throw new Error(`Seu perfil não permite ${definition.permissionAction} em ${definition.resource}.`)
}

export async function executeCrmCapabilityStep(step: CrmCapabilityPlanStep, runtime: CrmCapabilityExecutionRuntime): Promise<CrmCapabilityStepResult> {
  ensurePermission(runtime, step)
  const { actions, snapshot, workspaceId } = runtime

  if (step.capabilityId === 'navigation.open') {
    const requested = arg(step, 'route') as AppRoute
    const targetRoute = routeSet.has(requested) ? requested : 'dashboard'
    const context: RouteContext = {}
    const query = targetQuery(step)
    if (query && ['leads','pipeline','calls','communications','agenda','tasks','followups'].includes(targetRoute)) {
      const lead = best(snapshot.leads, query, (item) => [item.id, item.name, item.company, item.phone, item.email])
      if (lead) {
        const resource: TeamAccessResource = targetRoute === 'pipeline' ? 'pipeline' : targetRoute === 'communications' ? 'communications' : 'contacts'
        assertRecordAccess(runtime, resource, lead.ownerId)
        context.leadId = lead.id
      }
    }
    if (query && targetRoute === 'proposals') {
      const proposal = best(snapshot.proposals, query, (item) => [item.id, item.proposalNumber, item.title])
      if (proposal) { assertRecordAccess(runtime, 'proposals', proposal.ownerId); context.proposalId = proposal.id }
    }
    if (arg(step, 'action')) context.action = arg(step, 'action')
    runtime.navigate(targetRoute, context)
    return { ok: true, summary: `Módulo ${targetRoute} aberto${query ? ' com o contexto solicitado' : ''}.` }
  }
  if (step.capabilityId === 'calls.log_outcome') {
    const lead = resolveLead(snapshot, step); const contact = resolveContact(snapshot, step)
    const linkedLead = lead ?? (contact ? snapshot.leads.find((item) => contact.leadIds.includes(item.id) || item.primaryContactId === contact.id) ?? null : null)
    if (!linkedLead) throw new Error('Não encontrei o lead/contato para registrar a ligação.')
    assertRecordAccess(runtime, 'contacts', linkedLead.ownerId)
    const endedAt = iso(arg(step, 'ended_at')) || new Date().toISOString()
    const durationSeconds = Math.max(0, Math.round(num(arg(step, 'duration_seconds'), 0)))
    const startedAt = iso(arg(step, 'started_at')) || new Date(new Date(endedAt).getTime() - durationSeconds * 1000).toISOString()
    const outcome = normalizeCallOutcome(arg(step, 'outcome') || 'answered'); if (!outcome) throw new Error('Resultado de ligação inválido. Use um resultado comercial conhecido, como atendeu, sem resposta, retorno, interessado ou reunião.')
    const created = await actions.createCall({ leadId: linkedLead.id, contactId: contact?.id ?? linkedLead.primaryContactId ?? null, outcome: outcome as any, durationSeconds, notes: arg(step, 'notes'), transcript: '', recordingPath: null, consentAt: null, startedAt, endedAt } as any)
    return { ok: true, summary: `Ligação com ${linkedLead.company || linkedLead.name} registrada com resultado ${outcome}.`, undo: { kind: 'call.delete', entityId: created.id } }
  }
  if (step.capabilityId === 'calls.open') {
    const lead = resolveLead(snapshot, step)
    if (lead) assertRecordAccess(runtime, 'contacts', lead.ownerId)
    runtime.navigate('calls', lead ? { leadId: lead.id, action: 'start-call' } : {})
    return { ok: true, summary: lead ? `Workspace de ligação aberto para ${lead.company || lead.name}.` : 'Workspace de ligações aberto.' }
  }
  if (step.capabilityId === 'communications.open') {
    const lead = resolveLead(snapshot, step)
    if (lead) assertRecordAccess(runtime, 'communications', lead.ownerId)
    runtime.navigate('communications', lead ? { leadId: lead.id } : {})
    return { ok: true, summary: lead ? `Comunicações abertas para ${lead.company || lead.name}.` : 'Central de Comunicação aberta.' }
  }
  if (step.capabilityId === 'communications.send_email' || step.capabilityId === 'communications.send_whatsapp') {
    const directLead = resolveLead(snapshot, step)
    const contact = resolveContact(snapshot, step)
    const lead = directLead ?? (contact ? snapshot.leads.find((item) => contact.leadIds.includes(item.id) || item.primaryContactId === contact.id) ?? null : null)
    if (!lead) throw new Error('Não encontrei um contato/lead vinculado para enviar a mensagem.')
    assertRecordAccess(runtime, 'communications', lead.ownerId)
    if (lead.doNotContact || contact?.doNotContact) throw new Error('Este contato está marcado como não contatar.')
    const body = arg(step, 'body').trim(); if (!body) throw new Error('A mensagem precisa de conteúdo antes do envio.')
    const channels = await loadCommunicationChannelState(workspaceId)
    if (step.capabilityId === 'communications.send_email') {
      assertSensitiveCapabilityField(runtime, 'contact_email', 'view')
      const account = channels.emailAccounts[0]; if (!account) throw new Error('Nenhuma conta Gmail/Outlook com envio está conectada.')
      const recipient = arg(step, 'recipient') || contact?.email || lead.email
      const subject = arg(step, 'subject').trim(); if (!recipient) throw new Error('O contato não possui e-mail para envio.'); if (!subject) throw new Error('Informe o assunto do e-mail.')
      const event = await sendOfficialEmail({ workspaceId, leadId: lead.id, contactId: contact?.id ?? lead.primaryContactId ?? null, accountId: account.id, recipient, subject, body, idempotencyKey: `agent-email:${step.id}:${Date.now()}` })
      return { ok: true, summary: event.status === 'sent' || event.status === 'delivered' ? `E-mail enviado para ${lead.name}.` : `E-mail para ${lead.name} registrado na fila de envio.`, evidence: { source: 'gateway', entityType: 'communication_event', entityId: event.id, state: event.status, detail: 'Communications Gateway devolveu um evento persistido para o envio de e-mail.' } }
    }
    assertSensitiveCapabilityField(runtime, 'contact_phone', 'view')
    const account = channels.whatsappAccounts[0]; if (!account) throw new Error('Nenhuma conta WhatsApp conectada está disponível para envio.')
    const recipient = normalizeWhatsAppPhone(arg(step, 'recipient') || contact?.phone || lead.phone)
    if (!recipient) throw new Error('O contato não possui telefone válido para WhatsApp.')
    const event = await sendOfficialWhatsApp({ workspaceId, leadId: lead.id, contactId: contact?.id ?? lead.primaryContactId ?? null, accountId: account.id, recipient, body, idempotencyKey: `agent-whatsapp:${step.id}:${Date.now()}` })
    return { ok: true, summary: event.status === 'sent' || event.status === 'delivered' ? `Mensagem de WhatsApp enviada para ${lead.name}.` : `Mensagem de WhatsApp para ${lead.name} registrada na fila.`, evidence: { source: 'gateway', entityType: 'communication_event', entityId: event.id, state: event.status, detail: 'Communications Gateway devolveu um evento persistido para o envio de WhatsApp.' } }
  }
  if (step.capabilityId.startsWith('prospecting.')) {
    if (step.capabilityId === 'prospecting.open') { runtime.navigate('prospecting'); return { ok: true, summary: 'Garimpo aberto.' } }
    const state = readProspectingState(workspaceId)
    const ranked = rankProspects(state.prospects, snapshot)
    const minScore = Math.max(0, Math.min(100, num(arg(step, 'min_score'), 0)))
    const limit = Math.max(1, Math.min(100, Math.round(num(arg(step, 'limit') || arg(step, 'quantity'), 10))))

    if (step.capabilityId === 'prospecting.build_icp') {
      const icp = buildProspectingIcp(snapshot)
      const topSegments = icp.segments.slice(0, 3).map((item) => item.value).join(', ') || 'ainda sem segmento dominante'
      const topCities = icp.cities.slice(0, 3).map((item) => item.value).join(', ') || 'ainda sem região dominante'
      return { ok: true, summary: `ICP calculado com ${prospectingIcpSummary(icp)}. Segmentos prioritários: ${topSegments}. Regiões recorrentes: ${topCities}.${icp.averageTicket ? ` Ticket médio da amostra: R$ ${Math.round(icp.averageTicket).toLocaleString('pt-BR')}.` : ''}` }
    }

    if (step.capabilityId === 'prospecting.rank') {
      const selected = ranked.filter((item) => item.intelligence.score >= minScore).slice(0, limit)
      if (!selected.length) return { ok: true, summary: 'Não encontrei empresas elegíveis no Garimpo para priorizar.' }
      return { ok: true, summary: `Prioridade do Garimpo: ${selected.map((item, index) => `${index + 1}. ${item.prospect.company} (${item.intelligence.score}/100${item.intelligence.reasons[0] ? ` — ${item.intelligence.reasons[0]}` : ''})`).join(' · ')}` }
    }

    if (step.capabilityId === 'prospecting.search') {
      let segment = arg(step, 'segment').trim()
      let city = arg(step, 'city').trim()
      const useIcp = bool(arg(step, 'use_icp'))
      if (useIcp || !segment) {
        const icp = buildProspectingIcp(snapshot)
        segment = segment || icp.segments[0]?.value || ''
        city = city || icp.cities[0]?.value || ''
      }
      if (!segment) throw new Error('Informe o tipo de empresa que deseja encontrar no Garimpo.')
      if (!city) throw new Error('Informe a cidade ou região da busca.')
      const quantity = Math.max(1, Math.min(100, Math.round(num(arg(step, 'quantity'), 20))))
      const health = await getProspectingAgentHealth().catch(() => null)
      if (health) {
        const job = await createProspectingAgentJob({
          workspaceId, segment, regions: city.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean), targetQuantity: quantity,
          targetMode: 'quantity', areaMode: (arg(step, 'area_mode') || 'city') as any, radiusKm: Math.max(1, Math.min(100, num(arg(step, 'radius_km'), 10))),
          searchMode: (arg(step, 'search_mode') || 'coverage') as any, categoryMode: (arg(step, 'category_mode') || 'exact') as any,
          existingKeys: existingProspectingIdentityKeys(snapshot.leads), enrichWeb: true, enrichCnpj: true, browserFallback: true,
        })
        runtime.navigate('prospecting')
        return { ok: true, summary: `Garimpo iniciado para ${segment} em ${city}. Meta: ${quantity} empresa(s). Execução ${(job.runtime?.runId || job.id).slice(0, 8)} em andamento; os resultados entrarão progressivamente em Revisar.`, evidence: { source: 'prospecting_state', entityType: 'prospecting_job', entityId: job.runtime?.runId || job.id, state: 'running', detail: 'O motor do Garimpo confirmou o job; a busca continua assíncrona e ainda não é tratada como concluída.' } }
      }
      const result = await runProspectingSearchAutomation({ workspaceId, segment, city, query: arg(step, 'query') || segment, targetQuantity: quantity })
      const existingKeys = prospectIdentitySet(state.prospects)
      const created: ProspectRecord[] = []
      for (const draft of result.drafts) {
        const keys = prospectingDraftIdentityKeys(draft)
        if (keys.some((key) => existingKeys.has(key))) continue
        const prospect = refreshProspectAnalysis(createProspect(workspaceId, draft, 'maps', snapshot.leads, runtime.currentUserId), snapshot.leads)
        prospectingDraftIdentityKeys(prospect).forEach((key) => existingKeys.add(key)); created.push(prospect)
      }
      let next = { ...state, prospects: [...created, ...state.prospects] }
      next = appendProspectingHistory(next, workspaceId, { action: 'search', title: 'Busca iniciada pela RealTalent Agent', description: `${segment} · ${city} · ${created.length} empresa(s) nova(s)`, count: created.length })
      writeProspectingState(workspaceId, next); runtime.navigate('prospecting')
      return { ok: true, summary: `Busca concluída pelo fallback do Garimpo: ${created.length} empresa(s) nova(s) encontradas de ${segment} em ${city}.`, evidence: { source: 'prospecting_state', entityType: 'prospect', state: 'persisted', detail: `Estado do Garimpo foi gravado e relido com ${next.prospects.length} prospect(s).` } }
    }

    if (step.capabilityId === 'prospecting.analyze') {
      const query = targetQuery(step)
      let count = 0
      const icp = buildProspectingIcp(snapshot)
      const prospects = state.prospects.map((prospect) => {
        if (query && ![prospect.company, prospect.name, prospect.city, prospect.phone, prospect.cnpj].some((value) => normalize(String(value)).includes(normalize(query)))) return prospect
        if (count >= limit) return prospect
        const analyzed = refreshProspectAnalysis(prospect, snapshot.leads)
        const intelligence = scoreProspectWithIcp(analyzed, snapshot, icp)
        count += 1
        return { ...analyzed, rawData: { ...analyzed.rawData, prospectScore: intelligence.score, prospectScoreBreakdown: intelligence.breakdown, prospectScoreReasons: intelligence.reasons, prospectOpportunitySignals: intelligence.opportunitySignals } }
      })
      let next = { ...state, prospects }
      next = appendProspectingHistory(next, workspaceId, { action: 'analyze', title: 'Prospecting Intelligence aplicado', description: `Fit, potencial, contato, momento e qualidade recalculados em ${count} empresa(s).`, count })
      writeProspectingState(workspaceId, next); runtime.navigate('prospecting')
      return { ok: true, summary: `${count} empresa(s) analisada(s) pelo Prospecting Intelligence.`, evidence: { source: 'prospecting_state', entityType: 'prospect', state: 'persisted', detail: 'Scores e análise foram gravados no estado do Garimpo.' } }
    }

    if (step.capabilityId === 'prospecting.approve_top') {
      const eligible = ranked.filter((item) => item.intelligence.score >= minScore && item.prospect.status !== 'sent' && item.prospect.status !== 'discarded' && item.prospect.duplicateLevel !== 'confirmed' && prospectDataQuality(item.prospect).readiness !== 'blocked').slice(0, limit)
      const ids = new Set(eligible.map((item) => item.prospect.id)); const now = new Date().toISOString()
      const prospects = state.prospects.map((item) => ids.has(item.id) ? { ...item, status: 'approved' as const, updatedAt: now, rawData: { ...item.rawData, prospectScore: scoreProspectWithIcp(item, snapshot).score } } : item)
      let next = { ...state, prospects }; next = appendProspectingHistory(next, workspaceId, { action: 'approve', title: 'Melhores empresas aprovadas pela Agent', description: `${eligible.length} empresa(s) aprovadas após score e regras de qualidade.`, count: eligible.length })
      writeProspectingState(workspaceId, next); runtime.navigate('prospecting')
      return { ok: true, summary: `${eligible.length} empresa(s) de maior prioridade foram aprovadas no Garimpo.`, evidence: { source: 'prospecting_state', entityType: 'prospect', state: 'persisted', detail: 'Aprovações foram gravadas no estado do Garimpo.' } }
    }

    if (step.capabilityId === 'prospecting.discard_low') {
      const maxScore = Math.max(0, Math.min(100, num(arg(step, 'max_score'), 40)))
      const ids = new Set(ranked.filter((item) => item.intelligence.score <= maxScore && item.prospect.status !== 'approved' && item.prospect.status !== 'sent').map((item) => item.prospect.id)); const now = new Date().toISOString()
      const prospects = state.prospects.map((item) => ids.has(item.id) ? { ...item, status: 'discarded' as const, updatedAt: now } : item)
      let next = { ...state, prospects }; next = appendProspectingHistory(next, workspaceId, { action: 'discard', title: 'Baixa prioridade descartada pela Agent', description: `${ids.size} empresa(s) com score até ${maxScore}.`, count: ids.size })
      writeProspectingState(workspaceId, next); runtime.navigate('prospecting')
      return { ok: true, summary: `${ids.size} empresa(s) com score até ${maxScore} foram descartadas.`, evidence: { source: 'prospecting_state', entityType: 'prospect', state: 'persisted', detail: 'Descartes foram gravados no estado do Garimpo.' } }
    }

    if (step.capabilityId === 'prospecting.send_to_crm') {
      if (!runtime.canTeamAccess('create', 'contacts') || !runtime.canTeamAccess('create', 'pipeline')) throw new Error('Seu perfil precisa de permissão para criar contatos e oportunidades antes de enviar o Garimpo ao CRM.')
      const ownerQuery = arg(step, 'owner_query')
      const members = await actions.listWorkspaceMembers().catch(() => [])
      const owner = ownerQuery ? best(members, ownerQuery, (item) => [item.userId, item.displayName, item.email]) : members.find((item) => item.userId === runtime.currentUserId) ?? null
      if (ownerQuery && !owner) throw new Error(`Não encontrei o responsável “${ownerQuery}” no workspace.`)
      const stage = resolveStage(snapshot, step) ?? snapshot.stages.find((item) => !item.isWon && !item.isLost) ?? snapshot.stages[0]
      if (!stage) throw new Error('O pipeline não possui uma etapa válida para receber oportunidades do Garimpo.')
      const selected = ranked.filter((item) => item.intelligence.score >= minScore && item.prospect.status === 'approved' && item.prospect.duplicateLevel !== 'confirmed' && prospectDataQuality(item.prospect).readiness !== 'blocked').slice(0, limit)
      if (!selected.length) throw new Error('Não há empresas aprovadas e elegíveis para enviar ao CRM. Aprove os melhores resultados primeiro.')
      const companyCache = [...snapshot.companies]
      const sentIds = new Set<string>()
      let createdLeads = 0
      for (const { prospect } of selected) {
        const cnpjDigits = prospect.cnpj.replace(/\D/g, '').slice(0, 14)
        const domain = prospect.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase()
        let company = companyCache.find((item) => (cnpjDigits.length === 14 && item.cnpj.replace(/\D/g, '').slice(0, 14) === cnpjDigits) || (domain && item.domain.toLowerCase() === domain) || (normalize(item.name) === normalize(prospect.company) && normalize(item.city) === normalize(prospect.city))) ?? null
        if (!company) {
          company = await actions.createCompany({ name: prospect.company || prospect.name, legalName: prospect.company || prospect.name, cnpj: prospect.cnpj, domain, website: prospect.website, segment: String(prospect.rawData?.category ?? prospect.rawData?.segment ?? ''), phone: prospect.phone, city: prospect.city, state: String(prospect.rawData?.state ?? prospect.rawData?.uf ?? ''), status: 'prospect', leadIds: [] })
          companyCache.push(company)
        }
        const rawContactName = String(prospect.rawData?.contactName ?? prospect.rawData?.contact_name ?? '').trim()
        let contactId: string | null = null
        if (rawContactName) {
          const contact = await actions.createContact({ companyId: company.id, name: rawContactName, jobTitle: String(prospect.rawData?.jobTitle ?? ''), phone: prospect.phone, email: prospect.email, decisionRole: 'unknown', influenceLevel: 0, relationshipStrength: 'unknown', relationshipScore: 0, stance: 'unknown', relationshipOwnerId: owner?.userId ?? runtime.currentUserId, relationshipOwnerName: owner?.displayName ?? '', lastContactAt: null, nextActionAt: arg(step, 'next_action_at') ? iso(arg(step, 'next_action_at')) : null, notes: 'Criado pelo Prospecting Intelligence.', isPrimary: true, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: [] })
          contactId = contact.id
        }
        const intelligence = scoreProspectWithIcp(prospect, snapshot)
        const lead = await actions.createLead({ name: rawContactName || company.name, company: company.name, phone: prospect.phone, email: prospect.email, city: prospect.city, cnpj: company.cnpj, website: company.website, companyId: company.id, primaryContactId: contactId, source: `Garimpo · Agent · Score ${intelligence.score}`, stageId: stage.id, status: 'active', temperature: (arg(step, 'temperature') || (intelligence.score >= 85 ? 'hot' : intelligence.score >= 70 ? 'warm' : 'cold')) as any, priority: (arg(step, 'priority') || (intelligence.score >= 85 ? 'high' : 'medium')) as any, ownerId: owner?.userId ?? runtime.currentUserId, ownerName: owner?.displayName ?? owner?.email ?? 'Sem responsável', value: 0, nextActionAt: arg(step, 'next_action_at') ? iso(arg(step, 'next_action_at')) : null, notes: [`Prospecting Intelligence ${intelligence.score}/100`, ...intelligence.reasons, ...intelligence.opportunitySignals].join('\n'), tags: ['garimpo','prospecting-intelligence',`prospect-score:${intelligence.score}`] } as any)
        createdLeads += 1
        if (arg(step, 'next_action_at')) await actions.createActivity({ leadId: lead.id, contactId, type: (arg(step, 'activity_type') || 'call') as any, title: `Primeiro contato — ${company.name}`, description: 'Atividade criada pela RealTalent Agent a partir do Garimpo.', dueAt: iso(arg(step, 'next_action_at')), completedAt: null, assignedTo: owner?.userId ?? runtime.currentUserId, purpose: 'prospecting_first_contact', originEventKey: `agent-prospecting:${prospect.id}` } as any)
        sentIds.add(prospect.id)
      }
      const now = new Date().toISOString(); const prospects = state.prospects.map((item) => sentIds.has(item.id) ? { ...item, status: 'sent' as const, sentAt: now, updatedAt: now } : item)
      let next = { ...state, prospects }; next = appendProspectingHistory(next, workspaceId, { action: 'send', title: 'Prospecting Intelligence enviado ao CRM', description: `${createdLeads} oportunidade(s) criada(s)${owner ? ` para ${owner.displayName || owner.email}` : ''}.`, count: createdLeads })
      writeProspectingState(workspaceId, next); runtime.navigate('leads')
      return { ok: true, summary: `${createdLeads} empresa(s) do Garimpo foram convertidas em oportunidades no CRM${owner ? ` para ${owner.displayName || owner.email}` : ''}.`, evidence: { source: 'prospecting_state', entityType: 'lead', state: 'persisted', detail: `${createdLeads} prospect(s) foram marcados como enviados; o readback do CRM valida os novos registros.` } }
    }
  }
  if (step.capabilityId === 'settings.open') { runtime.navigate('settings', arg(step, 'filter') ? { filter: arg(step, 'filter') } : {}); return { ok: true, summary: 'Configurações abertas.' } }

  if (step.capabilityId === 'notifications.dismiss_all') {
    const preferences = runtime.notificationPreferences
    if (!preferences) throw new Error('As preferências de notificações ainda não estão disponíveis.')
    const previous = loadNotificationUiState(workspaceId).dismissedIds
    const alerts = buildNotificationAlerts(snapshot, preferences, { staleLeadDays: runtime.staleLeadDays ?? 7 })
    dismissNotifications(workspaceId, alerts.map((item) => item.id))
    const current = loadNotificationUiState(workspaceId).dismissedIds
    return { ok: true, summary: alerts.length ? `${alerts.length} notificação(ões) foram limpas da central.` : 'Não havia notificações visíveis para limpar.', undo: { kind: 'notifications.replace_dismissed', metadata: { dismissedIds: previous } }, evidence: { source: 'local_state', entityType: 'notification_ui_state', state: 'persisted', detail: `Estado de notificações relido com ${current.length} item(ns) ocultado(s).` } }
  }
  if (step.capabilityId === 'notifications.restore_all') {
    const previous = loadNotificationUiState(workspaceId).dismissedIds
    const restored = restoreDismissedNotifications(workspaceId)
    const current = loadNotificationUiState(workspaceId).dismissedIds
    return { ok: true, summary: `${restored} notificação(ões) ocultada(s) foram restauradas.`, undo: { kind: 'notifications.replace_dismissed', metadata: { dismissedIds: previous } }, evidence: { source: 'local_state', entityType: 'notification_ui_state', state: 'persisted', detail: `Estado de notificações relido; restaram ${current.length} item(ns) ocultado(s).` } }
  }

  if (step.capabilityId === 'contacts.create') {
    const company = best(snapshot.companies, arg(step, 'company_query'), (item) => [item.id, item.name, item.legalName])
    const created = await actions.createContact({
      companyId: company?.id ?? null,
      name: arg(step, 'name') || 'Novo contato', jobTitle: arg(step, 'job_title'), phone: arg(step, 'phone'), email: arg(step, 'email'),
      decisionRole: (arg(step, 'decision_role') || 'unknown') as any, influenceLevel: 0, relationshipStrength: 'unknown', relationshipScore: 0, stance: 'unknown', relationshipOwnerId: runtime.currentUserId, relationshipOwnerName: '', lastContactAt: null, nextActionAt: null,
      notes: arg(step, 'notes'), isPrimary: false, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: [],
    })
    return { ok: true, summary: `Contato ${created.name} criado.`, undo: { kind: 'contact.delete', entityId: created.id } }
  }
  if (step.capabilityId === 'contacts.update') {
    const contact = resolveContact(snapshot, step); if (!contact) throw new Error('Não encontrei o contato para atualizar.')
    assertRecordAccess(runtime, 'contacts', contactOwnerId(snapshot, contact.id))
    const patch: Record<string, unknown> = {}
    if (arg(step, 'phone')) assertSensitiveCapabilityField(runtime, 'contact_phone', 'edit')
    if (arg(step, 'email')) assertSensitiveCapabilityField(runtime, 'contact_email', 'edit')
    for (const [key, field] of [['name','name'],['phone','phone'],['email','email'],['job_title','jobTitle'],['notes','notes'],['decision_role','decisionRole']] as const) if (arg(step, key)) patch[field] = arg(step, key)
    if (arg(step, 'do_not_contact')) patch.doNotContact = bool(arg(step, 'do_not_contact'))
    if (!Object.keys(patch).length) throw new Error('Não encontrei quais campos do contato devem ser alterados.')
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (contact as any)[key]]))
    await actions.updateContact(contact.id, patch as any)
    return { ok: true, summary: `Contato ${contact.name} atualizado.`, undo: { kind: 'contact.update', entityId: contact.id, before } }
  }
  if (step.capabilityId === 'contacts.delete') {
    const contact = resolveContact(snapshot, step); if (!contact) throw new Error('Não encontrei o contato para excluir.')
    assertRecordAccess(runtime, 'contacts', contactOwnerId(snapshot, contact.id))
    await actions.deleteContact(contact.id); return { ok: true, summary: `Contato ${contact.name} excluído.` }
  }

  if (step.capabilityId === 'companies.create') {
    const name = arg(step, 'name'); if (!name) throw new Error('Informe o nome da empresa.')
    const website = arg(step, 'website')
    const created = await actions.createCompany({ name, legalName: arg(step, 'legal_name') || name, cnpj: arg(step, 'cnpj'), domain: website.replace(/^https?:\/\//, '').split('/')[0], website, segment: arg(step, 'segment'), phone: arg(step, 'phone'), city: arg(step, 'city'), state: arg(step, 'state'), status: (arg(step, 'status') || 'prospect') as any, leadIds: [] })
    return { ok: true, summary: `Empresa ${created.name} criada.`, evidence: { source: 'repository', entityType: 'company', entityId: created.id, state: 'persisted', detail: 'Repository devolveu a empresa criada com ID persistido.' } }
  }
  if (step.capabilityId === 'companies.update') {
    const company = resolveCompany(snapshot, step); if (!company) throw new Error('Não encontrei a empresa para atualizar.')
    assertRecordAccess(runtime, 'contacts', companyOwnerId(snapshot, company.id))
    const patch: Record<string, unknown> = {}
    for (const [key, field] of [['name','name'],['legal_name','legalName'],['cnpj','cnpj'],['website','website'],['segment','segment'],['phone','phone'],['city','city'],['state','state'],['status','status']] as const) if (arg(step, key)) patch[field] = arg(step, key)
    if (arg(step, 'website')) patch.domain = arg(step, 'website').replace(/^https?:\/\//, '').split('/')[0]
    if (!Object.keys(patch).length) throw new Error('Não encontrei quais campos da empresa devem ser alterados.')
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (company as any)[key]]))
    await actions.updateCompany(company.id, patch as any)
    return { ok: true, summary: `Empresa ${company.name} atualizada.`, undo: { kind: 'company.update', entityId: company.id, before } }
  }

  if (step.capabilityId === 'leads.create') {
    const name = arg(step, 'name').trim(); if (!name) throw new Error('Informe o nome do lead/contato comercial.')
    const stage = resolveStage(snapshot, step) ?? snapshot.stages.find((item) => !item.isWon && !item.isLost) ?? snapshot.stages[0]
    if (!stage) throw new Error('O pipeline não possui etapa disponível para criar o registro.')
    if (arg(step, 'phone')) assertSensitiveCapabilityField(runtime, 'contact_phone', 'edit')
    if (arg(step, 'email')) assertSensitiveCapabilityField(runtime, 'contact_email', 'edit')
    if (arg(step, 'value')) assertSensitiveCapabilityField(runtime, 'deal_value', 'edit')
    const created = await actions.createLead({
      name, company: arg(step, 'company'), phone: arg(step, 'phone'), email: arg(step, 'email'), city: arg(step, 'city'), source: arg(step, 'source') || 'RealTalent Agent', stageId: stage.id,
      status: 'active', temperature: (arg(step, 'temperature') || 'warm') as any, priority: (arg(step, 'priority') || 'medium') as any,
      ownerId: arg(step, 'owner_id') || runtime.currentUserId, ownerName: arg(step, 'owner_name'), value: num(arg(step, 'value')), nextActionAt: arg(step, 'next_action_at') ? (iso(arg(step, 'next_action_at')) || arg(step, 'next_action_at')) : null,
      notes: arg(step, 'notes'), tags: ['realtalent-agent'],
    } as any)
    return { ok: true, summary: `Registro comercial ${created.company || created.name} criado em ${stage.name}.`, undo: { kind: 'lead.delete', entityId: created.id } }
  }
  if (step.capabilityId === 'leads.delete') {
    const lead = resolveLead(snapshot, step); if (!lead) throw new Error('Não encontrei o lead/oportunidade para excluir.')
    assertRecordAccess(runtime, 'contacts', lead.ownerId)
    await actions.deleteLead(lead.id)
    return { ok: true, summary: `${lead.company || lead.name} excluído do cadastro comercial.` }
  }

  if (step.capabilityId === 'leads.update') {
    const lead = resolveLead(snapshot, step); if (!lead) throw new Error('Não encontrei o registro comercial para atualizar.')
    assertRecordAccess(runtime, 'contacts', lead.ownerId)
    const patch: Record<string, unknown> = {}
    for (const [key, field] of [['priority','priority'],['temperature','temperature'],['owner_id','ownerId'],['owner_name','ownerName'],['notes','notes'],['status','status']] as const) if (arg(step, key)) patch[field] = arg(step, key)
    if (arg(step, 'value')) { assertSensitiveCapabilityField(runtime, 'deal_value', 'edit'); patch.value = num(arg(step, 'value')) }
    if (arg(step, 'next_action_at')) patch.nextActionAt = iso(arg(step, 'next_action_at')) || arg(step, 'next_action_at')
    if (!Object.keys(patch).length) throw new Error('Não encontrei quais campos devem ser alterados.')
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (lead as any)[key]]))
    await actions.updateLead(lead.id, patch as any)
    return { ok: true, summary: `${lead.company || lead.name} atualizado.`, undo: { kind: 'lead.update', entityId: lead.id, before } }
  }

  if (['pipeline.create_stage','pipeline.update_stage','pipeline.delete_stage'].includes(step.capabilityId)) {
    if (step.capabilityId === 'pipeline.create_stage') {
      const name = arg(step, 'name').trim(); if (!name) throw new Error('Informe o nome da nova etapa do pipeline.')
      const created = await actions.createStage({ name, color: arg(step, 'color') || '#64748b', probability: Math.max(0, Math.min(100, num(arg(step, 'probability'), 10))), isWon: bool(arg(step, 'is_won')), isLost: bool(arg(step, 'is_lost')) })
      return { ok: true, summary: `Etapa “${created.name}” criada no pipeline.`, undo: { kind: 'stage.delete', entityId: created.id } }
    }
    const stage = resolveStage(snapshot, step); if (!stage) throw new Error('Não encontrei a etapa do pipeline.')
    if (step.capabilityId === 'pipeline.delete_stage') { await actions.deleteStage(stage.id); return { ok: true, summary: `Etapa “${stage.name}” excluída do pipeline.` } }
    const patch: Record<string, unknown> = {}
    if (arg(step, 'name')) patch.name = arg(step, 'name')
    if (arg(step, 'color')) patch.color = arg(step, 'color')
    if (arg(step, 'probability')) patch.probability = Math.max(0, Math.min(100, num(arg(step, 'probability'))))
    if (arg(step, 'is_won')) patch.isWon = bool(arg(step, 'is_won'))
    if (arg(step, 'is_lost')) patch.isLost = bool(arg(step, 'is_lost'))
    if (!Object.keys(patch).length) throw new Error('Informe o que deve mudar na etapa do pipeline.')
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (stage as any)[key]]))
    await actions.updateStage(stage.id, patch as any)
    return { ok: true, summary: `Etapa “${stage.name}” atualizada.`, undo: { kind: 'stage.update', entityId: stage.id, before } }
  }

  if (['pipeline.move','pipeline.mark_won','pipeline.mark_lost'].includes(step.capabilityId)) {
    const lead = resolveLead(snapshot, step); if (!lead) throw new Error('Não encontrei a oportunidade para mover.')
    assertRecordAccess(runtime, 'pipeline', lead.ownerId)
    const stage = resolveStage(snapshot, step, step.capabilityId === 'pipeline.mark_won', step.capabilityId === 'pipeline.mark_lost'); if (!stage) throw new Error('Não encontrei a etapa de destino.')
    const before = { stageId: lead.stageId, status: lead.status, notes: lead.notes }
    await actions.moveLead(lead.id, stage.id, step.capabilityId === 'pipeline.mark_lost' ? arg(step, 'loss_reason') || null : null)
    return { ok: true, summary: `${lead.company || lead.name} movido para ${stage.name}.`, undo: { kind: 'lead.move', entityId: lead.id, before } }
  }

  if (step.capabilityId === 'tasks.create') {
    const lead = resolveLead(snapshot, step)
    const contact = resolveContact(snapshot, step)
    if (lead) assertRecordAccess(runtime, 'contacts', lead.ownerId)
    if (contact) assertRecordAccess(runtime, 'contacts', contactOwnerId(snapshot, contact.id))
    const dueAt = iso(arg(step, 'due_at')); if (!dueAt) throw new Error('A tarefa precisa de uma data/horário válido.')
    const title = arg(step, 'title') || (arg(step, 'task_type') === 'call' ? `Ligar para ${contact?.name || lead?.name || 'contato'}` : 'Tarefa')
    const saved = await saveTask(runtime.repositoryMode, workspaceId, {
      title, description: arg(step, 'description'), status: 'todo', priority: (arg(step, 'priority') || 'normal') as any,
      startsAt: bool(arg(step, 'sync_to_agenda')) ? dueAt : null, dueAt, assigneeId: runtime.currentUserId, assigneeName: '', teamId: null, recurrence: 'none', tags: ['realtalent-agent'],
      relation: contact ? { entityType: 'contact', entityId: contact.id, entityLabel: contact.name } : lead ? { entityType: 'lead', entityId: lead.id, entityLabel: lead.company || lead.name } : null,
    }, runtime.currentUserId, runtime.teamAccess)
    let calendarEventId: string | null = null
    if (bool(arg(step, 'sync_to_agenda'))) {
      const starts = new Date(dueAt); const ends = new Date(starts.getTime() + 30 * 60_000)
      const calendarEvent = await actions.createCalendarEvent({ leadId: lead?.id ?? null, contactId: contact?.id ?? null, title, description: appendAgendaMetadata(`Tarefa do CRM · ${saved.id}`, { version: 1, type: arg(step, 'task_type') === 'call' ? 'call' : 'task', calendar: 'commercial', reminderMinutes: 15, recurrence: 'none' }), startsAt: starts.toISOString(), endsAt: ends.toISOString(), allDay: false, location: '', status: 'confirmed', assignedTo: runtime.currentUserId })
      calendarEventId = calendarEvent.id
    }
    return { ok: true, summary: bool(arg(step, 'sync_to_agenda')) ? `Tarefa “${title}” criada e sincronizada com a Agenda.` : `Tarefa “${title}” criada.`, undo: { kind: 'task.delete', entityId: saved.id, metadata: calendarEventId ? { calendarEventId } : undefined } }
  }
  if (step.capabilityId === 'tasks.complete' || step.capabilityId === 'tasks.delete') {
    const work = await loadWorkManagement(runtime.repositoryMode, workspaceId)
    const task = best(work.tasks, targetQuery(step), (item) => [item.id, item.title]); if (!task) throw new Error('Não encontrei a tarefa.')
    assertRecordAccess(runtime, 'tasks', task.assigneeId, task.teamId)
    if (step.capabilityId === 'tasks.delete') { await deleteTask(runtime.repositoryMode, workspaceId, task.id, runtime.teamAccess); return { ok: true, summary: `Tarefa “${task.title}” excluída.` } }
    const before = { status: task.status }
    await updateTaskStatus(runtime.repositoryMode, workspaceId, task.id, 'completed', runtime.teamAccess)
    return { ok: true, summary: `Tarefa “${task.title}” concluída.`, undo: { kind: 'task.status', entityId: task.id, before } }
  }

  if (step.capabilityId === 'activities.create_note') {
    const lead = resolveLead(snapshot, step); const contact = resolveContact(snapshot, step); if (!lead && !contact) throw new Error('Informe em qual contato/lead registrar a nota.')
    if (lead) assertRecordAccess(runtime, 'contacts', lead.ownerId)
    if (contact) assertRecordAccess(runtime, 'contacts', contactOwnerId(snapshot, contact.id))
    const body = arg(step, 'body').trim(); if (!body) throw new Error('Informe o conteúdo da nota.')
    const created = await actions.createActivity({ leadId: lead?.id ?? null, contactId: contact?.id ?? null, type: 'note' as any, title: arg(step, 'title') || 'Nota da Agent', description: body, dueAt: null, completedAt: new Date().toISOString(), resolutionStatus: 'completed', resolutionReason: null, originEventKey: null, purpose: 'Nota registrada pela RealTalent Agent', assignedTo: runtime.currentUserId })
    return { ok: true, summary: `Nota registrada no histórico de ${lead?.company || contact?.name || 'contato'}.`, undo: { kind: 'activity.delete', entityId: created.id } }
  }

  if (step.capabilityId === 'activities.create_followup') {
    const lead = resolveLead(snapshot, step); const contact = resolveContact(snapshot, step); if (!lead && !contact) throw new Error('Informe para qual contato/lead criar o follow-up.')
    if (lead) assertRecordAccess(runtime, 'contacts', lead.ownerId)
    if (contact) assertRecordAccess(runtime, 'contacts', contactOwnerId(snapshot, contact.id))
    const created = await actions.createActivity({ leadId: lead?.id ?? null, contactId: contact?.id ?? null, type: 'followup', title: arg(step, 'title') || `Follow-up · ${lead?.company || contact?.name || 'Contato'}`, description: arg(step, 'description'), dueAt: iso(arg(step, 'due_at')) || null, completedAt: null, resolutionStatus: 'pending', resolutionReason: null, originEventKey: null, purpose: 'Follow-up criado pela RealTalent Agent', assignedTo: arg(step, 'assignee_id') || runtime.currentUserId })
    return { ok: true, summary: `Follow-up “${created.title}” criado.`, undo: { kind: 'activity.delete', entityId: created.id } }
  }
  if (step.capabilityId === 'activities.complete' || step.capabilityId === 'activities.delete') {
    const activity = best(snapshot.activities, targetQuery(step), (item) => [item.id, item.title, item.description]); if (!activity) throw new Error('Não encontrei a atividade.')
    assertRecordAccess(runtime, 'tasks', activity.assignedTo)
    if (step.capabilityId === 'activities.delete') { await actions.deleteActivity(activity.id); return { ok: true, summary: `Atividade “${activity.title}” excluída.` } }
    const before = { completedAt: activity.completedAt, resolutionStatus: activity.resolutionStatus ?? 'pending', resolutionReason: activity.resolutionReason ?? null }
    await actions.completeActivity(activity.id, true)
    return { ok: true, summary: `Atividade “${activity.title}” concluída.`, undo: { kind: 'activity.update', entityId: activity.id, before } }
  }

  if (step.capabilityId === 'calendar.create') {
    const lead = resolveLead(snapshot, step); const contact = resolveContact(snapshot, step)
    if (lead) assertRecordAccess(runtime, 'contacts', lead.ownerId)
    if (contact) assertRecordAccess(runtime, 'contacts', contactOwnerId(snapshot, contact.id))
    const startsAt = iso(arg(step, 'starts_at')); if (!startsAt) throw new Error('Informe uma data/horário válido para o compromisso.')
    const endsAt = iso(arg(step, 'ends_at')) || new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString()
    const event = await actions.createCalendarEvent({ leadId: lead?.id ?? null, contactId: contact?.id ?? null, title: arg(step, 'title') || 'Compromisso', description: arg(step, 'description'), startsAt, endsAt, allDay: false, location: arg(step, 'location'), status: 'confirmed', assignedTo: arg(step, 'assignee_id') || runtime.currentUserId })
    return { ok: true, summary: `Compromisso “${event.title}” criado.`, undo: { kind: 'calendar.delete', entityId: event.id } }
  }
  if (step.capabilityId === 'calendar.update' || step.capabilityId === 'calendar.delete') {
    const event = best(snapshot.events, targetQuery(step), (item) => [item.id, item.title, item.description]); if (!event) throw new Error('Não encontrei o compromisso.')
    assertRecordAccess(runtime, 'tasks', event.assignedTo)
    if (step.capabilityId === 'calendar.delete') { await actions.deleteCalendarEvent(event.id); return { ok: true, summary: `Compromisso “${event.title}” excluído.` } }
    const patch: Record<string, unknown> = {}
    for (const [key, field] of [['title','title'],['description','description'],['location','location'],['status','status']] as const) if (arg(step, key)) patch[field] = arg(step, key)
    if (arg(step, 'starts_at')) patch.startsAt = iso(arg(step, 'starts_at')) || arg(step, 'starts_at')
    if (arg(step, 'ends_at')) patch.endsAt = iso(arg(step, 'ends_at')) || arg(step, 'ends_at')
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (event as any)[key]]))
    await actions.updateCalendarEvent(event.id, patch as any)
    return { ok: true, summary: `Compromisso “${event.title}” atualizado.`, undo: { kind: 'calendar.update', entityId: event.id, before } }
  }

  if (step.capabilityId === 'proposals.create') {
    const lead = resolveLead(snapshot, step); if (!lead) throw new Error('Não encontrei o lead/oportunidade para a proposta.')
    assertRecordAccess(runtime, 'proposals', lead.ownerId)
    const product = best(snapshot.products.filter((item) => item.active), arg(step, 'product_query'), (item) => [item.id, item.name, item.sku]); if (!product) throw new Error('Não encontrei um produto/serviço ativo do catálogo para a proposta.')
    const contractTermMonths = Math.max(1, Math.round(num(arg(step, 'contract_term_months'), 12)))
    const line = createProposalLineFromProduct(product, createId('proposal-item'))
    const totals = calculateProposalTotals([line], contractTermMonths)
    const opportunity = snapshot.opportunities.find((item) => item.leadId === lead.id) ?? null
    const proposal = await actions.createProposal({
      leadId: lead.id, opportunityId: opportunity?.id ?? lead.opportunityId ?? null, companyId: lead.companyId ?? null, contactId: lead.primaryContactId ?? null,
      title: arg(step, 'title') || `Proposta · ${lead.company || lead.name}`, status: 'draft', forecastCategory: 'pipeline', probability: Math.max(0, Math.min(100, num(arg(step, 'probability'), 50))), currency: 'BRL',
      subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total, recurringMonthlyTotal: totals.recurringMonthlyTotal, oneTimeTotal: totals.oneTimeTotal, annualRecurringTotal: totals.annualRecurringTotal, totalContractValue: totals.totalContractValue,
      isOfficial: false, isCurrentVersion: true, expectedCloseAt: null, contractStartAt: null, contractEndAt: null, contractTermMonths, autoRenew: false, postSaleStartAt: null, postSaleCadenceName: 'Onboarding padrão', validUntil: arg(step, 'valid_until') ? (iso(arg(step, 'valid_until')) || arg(step, 'valid_until')) : null,
      ownerId: lead.ownerId ?? runtime.currentUserId, notes: 'Draft criado pela RealTalent Agent com item do catálogo após confirmação humana.', terms: '', items: [line],
    } as any)
    return { ok: true, summary: `Proposta draft “${proposal.title}” criada para ${lead.company || lead.name} usando ${product.name}.`, undo: { kind: 'proposal.delete', entityId: proposal.id } }
  }

  if (step.capabilityId.startsWith('proposals.')) {
    const proposal = resolveProposal(snapshot, step); if (!proposal) throw new Error('Não encontrei a proposta.')
    assertRecordAccess(runtime, 'proposals', proposal.ownerId)
    if (step.capabilityId === 'proposals.delete') { await actions.deleteProposal(proposal.id); return { ok: true, summary: `Proposta “${proposal.title}” excluída.` } }
    if (step.capabilityId === 'proposals.make_official') { await actions.setOfficialProposal(proposal.id); return { ok: true, summary: `Proposta “${proposal.title}” definida como oficial.` } }
    if (step.capabilityId === 'proposals.close_opportunity') { await actions.closeOpportunityFromProposal(proposal.id); return { ok: true, summary: `Oportunidade fechada a partir da proposta “${proposal.title}”.` } }
    const status = arg(step, 'status') as any; if (!status) throw new Error('Informe o novo status da proposta.')
    await actions.updateProposalStatus(proposal.id, status)
    return { ok: true, summary: `Status da proposta “${proposal.title}” alterado para ${status}.`, undo: { kind: 'proposal.status', entityId: proposal.id, before: { status: proposal.status } } }
  }

  if (step.capabilityId.startsWith('catalog.')) {
    if (step.capabilityId === 'catalog.create_product') {
      const name = arg(step, 'name'); if (!name) throw new Error('Informe o nome do produto/serviço.')
      const product = await actions.createProduct({ name, sku: `RT-${Date.now().toString(36).toUpperCase()}`, description: arg(step, 'description'), category: arg(step, 'category') || 'Geral', active: true, unitPrice: num(arg(step, 'price')), kind: 'service', commercialType: 'service', unitLabel: 'unidade', pricingMode: (arg(step, 'pricing_mode') || 'fixed') as any, lifecycleStatus: (arg(step, 'status') || 'active') as any, billingType: (arg(step, 'billing_type') || 'one_time') as any, billingInterval: null, taxRate: 0 })
      return { ok: true, summary: `Item “${product.name}” criado no catálogo.`, undo: { kind: 'product.delete', entityId: product.id } }
    }
    const product = best(snapshot.products, targetQuery(step), (item) => [item.id, item.name, item.sku]); if (!product) throw new Error('Não encontrei o item do catálogo.')
    if (step.capabilityId === 'catalog.delete_product') { await actions.deleteProduct(product.id); return { ok: true, summary: `Item “${product.name}” excluído do catálogo.` } }
    const patch: Record<string, unknown> = {}
    for (const [key, field] of [['name','name'],['description','description'],['category','category']] as const) if (arg(step, key)) patch[field] = arg(step, key)
    if (arg(step, 'price')) patch.unitPrice = num(arg(step, 'price'))
    if (arg(step, 'status')) patch.lifecycleStatus = arg(step, 'status')
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (product as any)[key]]))
    await actions.updateProduct(product.id, patch as any)
    return { ok: true, summary: `Item “${product.name}” atualizado.`, undo: { kind: 'product.update', entityId: product.id, before } }
  }

  if (step.capabilityId.startsWith('goals.')) {
    if (step.capabilityId === 'goals.create') {
      const metric = normalizeGoalMetric(arg(step, 'metric') || 'revenue') as any
      const allowedMetrics = new Set(['calls','contacts','followups','meetings','proposals','wins','revenue','new_leads'])
      if (!allowedMetrics.has(metric)) throw new Error('Métrica de meta inválida. Use ligações, contatos, follow-ups, reuniões, propostas, vendas, receita ou novos leads.')
      const targetValue = num(arg(step, 'target_value')); if (!(targetValue > 0)) throw new Error('Informe um valor de meta maior que zero.')
      const now = new Date(); const start = arg(step, 'period_start') || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); const end = arg(step, 'period_end') || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
      const scope = (arg(step, 'scope') || 'user') as 'workspace' | 'team' | 'user'
      const members = scope === 'user' ? await actions.listWorkspaceMembers().catch(() => []) : []
      const requestedUser = arg(step, 'user_id') || runtime.currentUserId || null
      const member = requestedUser ? members.find((item) => item.userId === requestedUser) : null
      const userId = scope === 'user' ? requestedUser : null
      const userName = scope === 'user' ? (arg(step, 'user_name') || member?.displayName || member?.email || 'Usuário atual') : scope === 'team' ? (arg(step, 'team_name') || 'Equipe') : snapshot.workspace.name
      const goal = await actions.createGoal({ scope, teamId: scope === 'team' ? (arg(step, 'team_id') || null) : null, teamName: scope === 'team' ? (arg(step, 'team_name') || 'Equipe') : '', userId, userName, metric, targetValue, periodStart: start, periodEnd: end })
      runtime.navigate('goals')
      const metricLabel: Record<string,string> = { calls: 'ligações', contacts: 'contatos', followups: 'follow-ups', meetings: 'reuniões', proposals: 'propostas', wins: 'vendas', revenue: 'receita', new_leads: 'novos leads' }
      return { ok: true, summary: `Meta criada: ${targetValue} ${metricLabel[metric] || metric} de ${start}${start !== end ? ` até ${end}` : ''}${scope === 'user' ? ` para ${userName}` : ''}.`, undo: { kind: 'goal.delete', entityId: goal.id } }
    }
    const goal = best(snapshot.goals, targetQuery(step), (item) => [item.id, item.userName, item.metric, item.teamName]); if (!goal) throw new Error('Não encontrei a meta.')
    assertRecordAccess(runtime, 'goals', goal.userId, goal.teamId)
    if (step.capabilityId === 'goals.delete') { await actions.deleteGoal(goal.id); return { ok: true, summary: 'Meta excluída.' } }
    const patch: Record<string, unknown> = {}
    if (arg(step, 'target_value')) patch.targetValue = num(arg(step, 'target_value'))
    if (arg(step, 'period_start')) patch.periodStart = arg(step, 'period_start')
    if (arg(step, 'period_end')) patch.periodEnd = arg(step, 'period_end')
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (goal as any)[key]]))
    await actions.updateGoal(goal.id, patch as any)
    return { ok: true, summary: 'Meta atualizada.', undo: { kind: 'goal.update', entityId: goal.id, before } }
  }

  if (step.capabilityId.startsWith('playbooks.')) {
    if (step.capabilityId === 'playbooks.create') {
      const title = arg(step, 'title'); if (!title) throw new Error('Informe o título do roteiro.')
      const playbook = await actions.createPlaybook({ kind: (arg(step, 'kind') || 'script') as any, title, category: 'Comercial', content: arg(step, 'description'), tags: ['agent'], guidance: arg(step, 'objective') ? { coachingFocus: arg(step, 'objective') } : undefined, active: true })
      return { ok: true, summary: `Roteiro “${playbook.title}” criado.`, undo: { kind: 'playbook.delete', entityId: playbook.id } }
    }
    const playbook = best(snapshot.playbooks, targetQuery(step), (item) => [item.id, item.title, item.category]); if (!playbook) throw new Error('Não encontrei o roteiro.')
    if (step.capabilityId === 'playbooks.delete') { await actions.deletePlaybook(playbook.id); return { ok: true, summary: `Roteiro “${playbook.title}” excluído.` } }
    const patch: Record<string, unknown> = {}
    if (arg(step, 'title')) patch.title = arg(step, 'title')
    if (arg(step, 'description')) patch.content = arg(step, 'description')
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, (playbook as any)[key]]))
    await actions.updatePlaybook(playbook.id, patch as any)
    return { ok: true, summary: `Roteiro “${playbook.title}” atualizado.`, undo: { kind: 'playbook.update', entityId: playbook.id, before } }
  }

  if (step.capabilityId.startsWith('automations.')) {
    const rule = best(snapshot.automationRules, targetQuery(step), (item) => [item.id, item.name]); if (!rule) throw new Error('Não encontrei a automação.')
    if (step.capabilityId === 'automations.delete') { await actions.deleteAutomationRule(rule.id); return { ok: true, summary: `Automação “${rule.name}” excluída.` } }
    if (step.capabilityId === 'automations.toggle') {
      const enabled = arg(step, 'enabled') ? bool(arg(step, 'enabled')) : !rule.enabled
      await actions.updateAutomationRule(rule.id, { enabled })
      return { ok: true, summary: `Automação “${rule.name}” ${enabled ? 'ativada' : 'desativada'}.`, undo: { kind: 'automation.toggle', entityId: rule.id, before: { enabled: rule.enabled } } }
    }
    const lead = best(snapshot.leads, arg(step, 'lead_query') || arg(step, 'lead_id'), (item) => [item.id, item.name, item.company]); if (!lead) throw new Error('Informe sobre qual contato/lead executar a automação.')
    assertRecordAccess(runtime, 'contacts', lead.ownerId)
    await actions.runAutomationRule(rule.id, lead.id)
    return { ok: true, summary: `Automação “${rule.name}” executada para ${lead.company || lead.name}.` }
  }

  if (step.capabilityId.startsWith('teams.')) {
    const members = await actions.listWorkspaceMembers()
    if (step.capabilityId === 'teams.invite') {
      const email = arg(step, 'email'); if (!email) throw new Error('Informe o e-mail para convite.')
      const role = (arg(step, 'role') || 'member') as any
      const invite = await actions.createWorkspaceInvite(email, role)
      return { ok: true, summary: `Convite enviado para ${email}.`, undo: { kind: 'invite.revoke', entityId: invite.id } }
    }
    const member = best(members, arg(step, 'member_id') || arg(step, 'member_query'), (item) => [item.userId, item.displayName, item.email]); if (!member) throw new Error('Não encontrei o membro da equipe.')
    if (step.capabilityId === 'teams.remove_member') { await actions.removeWorkspaceMember(member.userId); return { ok: true, summary: `${member.displayName || member.email} removido do workspace.` } }
    const role = (arg(step, 'role') || 'member') as any
    await actions.updateWorkspaceMemberRole(member.userId, role)
    return { ok: true, summary: `Função de ${member.displayName || member.email} alterada para ${role}.`, undo: { kind: 'member.role', entityId: member.userId, before: { role: member.role } } }
  }

  if (step.capabilityId.startsWith('revenue.')) {
    if (step.capabilityId === 'revenue.create') {
      const lead = resolveLead(snapshot, step); const proposal = resolveProposal(snapshot, step)
      if (lead) assertRecordAccess(runtime, 'goals', lead.ownerId)
      if (proposal) assertRecordAccess(runtime, 'goals', proposal.ownerId)
      assertSensitiveCapabilityField(runtime, 'revenue_amount', 'edit')
      const amount = num(arg(step, 'amount')); if (!(amount > 0)) throw new Error('Informe um valor de receita maior que zero.')
      const recognizedAt = iso(arg(step, 'recognized_at')) || new Date().toISOString(); const competenceDate = arg(step, 'competence_date') || recognizedAt.slice(0, 10)
      const created = await actions.createRevenueEntry({ proposalId: proposal?.id ?? null, leadId: lead?.id ?? proposal?.leadId ?? null, opportunityId: lead?.opportunityId ?? null, revenueType: (arg(step, 'revenue_type') || 'one_time') as any, status: (arg(step, 'status') || 'recognized') as any, amount, recurringMonthlyAmount: arg(step, 'revenue_type') === 'recurring' ? amount : 0, recognizedAt, competenceDate, servicePeriodStart: null, servicePeriodEnd: null, adjustmentReason: '', description: arg(step, 'description') || 'Lançamento criado pela RealTalent Agent', ownerId: arg(step, 'owner_id') || runtime.currentUserId, source: 'manual', scheduleKey: null, installmentIndex: null, installmentCount: null })
      return { ok: true, summary: `Lançamento de receita de ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} criado.`, evidence: { source: 'repository', entityType: 'revenue', entityId: created.id, state: 'persisted', detail: 'Repository devolveu o lançamento criado com ID persistido.' } }
    }
    const entry = best(snapshot.revenueEntries, targetQuery(step), (item) => [item.id, item.description, String(item.amount)]); if (!entry) throw new Error('Não encontrei o lançamento de receita.')
    assertRecordAccess(runtime, 'goals', entry.ownerId)
    const status = (arg(step, 'status') || 'recognized') as any
    await actions.updateRevenueEntryStatus(entry.id, status)
    return { ok: true, summary: `Status do lançamento atualizado para ${status}.`, undo: { kind: 'revenue.status', entityId: entry.id, before: { status: entry.status } } }
  }

  if (step.capabilityId === 'crm.query') {
    const object = normalize(arg(step, 'object'))
    const resources: Record<string, TeamAccessResource | null> = { lead: 'contacts', contact: 'contacts', company: 'contacts', opportunity: 'pipeline', proposal: 'proposals', activity: 'tasks', event: 'tasks', goal: 'goals', product: 'proposals', playbook: 'settings', automation: 'settings', revenue: 'goals' }
    const resource = resources[object]
    if (!resource) throw new Error('Objeto de consulta não suportado.')
    if (!runtime.canTeamAccess('view', resource)) throw new Error(`Seu perfil não permite consultar ${resource}.`)
    const latestActivityForLead = (leadId: string) => snapshot.activities.filter((item) => item.leadId === leadId).reduce<string | null>((latest, item) => {
      const candidate = item.completedAt || item.createdAt || item.dueAt
      return candidate && (!latest || new Date(candidate).getTime() > new Date(latest).getTime()) ? candidate : latest
    }, null)
    const daysSince = (value?: string | null) => value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)) : null
    const stageName = (stageId?: string | null) => snapshot.stages.find((item) => item.id === stageId)?.name ?? ''
    const collections: Record<string, any[]> = {
      lead: snapshot.leads.map((row) => { const lastActivityAt = latestActivityForLead(row.id); return { ...row, stageName: stageName(row.stageId), lastActivityAt, daysSinceActivity: daysSince(lastActivityAt) } }),
      contact: snapshot.contacts,
      company: snapshot.companies,
      opportunity: snapshot.opportunities.map((row) => { const lastActivityAt = latestActivityForLead(row.leadId); return { ...row, stageName: stageName(row.stageId), lastActivityAt, daysSinceActivity: daysSince(lastActivityAt) } }),
      proposal: snapshot.proposals.map((row) => ({ ...row, daysSinceUpdate: daysSince(row.updatedAt) })),
      activity: snapshot.activities,
      event: snapshot.events,
      goal: snapshot.goals,
      product: snapshot.products,
      playbook: snapshot.playbooks,
      automation: snapshot.automationRules,
      revenue: snapshot.revenueEntries,
    }
    let rows = [...(collections[object] ?? [])]
    const ownerForRow = (row: any): { ownerId: string | null; teamId: string | null } => {
      if (object === 'lead' || object === 'opportunity' || object === 'proposal' || object === 'revenue') return { ownerId: row.ownerId ?? null, teamId: row.teamId ?? null }
      if (object === 'contact') return { ownerId: contactOwnerId(snapshot, row.id), teamId: null }
      if (object === 'company') return { ownerId: companyOwnerId(snapshot, row.id), teamId: null }
      if (object === 'activity' || object === 'event') return { ownerId: row.assignedTo ?? null, teamId: row.teamId ?? null }
      if (object === 'goal') return { ownerId: row.userId ?? null, teamId: row.teamId ?? null }
      return { ownerId: runtime.currentUserId, teamId: null }
    }
    rows = rows.filter((row) => { const scope = ownerForRow(row); return runtime.canTeamAccessRecord(resource, scope.ownerId, scope.teamId) })
    const fieldAliases: Record<string, string> = {
      owner_id: 'ownerId', stage_id: 'stageId', stage_name: 'stageName', next_action_at: 'nextActionAt', last_activity_at: 'lastActivityAt', days_since_activity: 'daysSinceActivity',
      expected_close_at: 'expectedCloseAt', total_contract_value: 'totalContractValue', discount_total: 'discountTotal', valid_until: 'validUntil', days_since_update: 'daysSinceUpdate',
      created_at: 'createdAt', updated_at: 'updatedAt', due_at: 'dueAt', completed_at: 'completedAt', resolution_status: 'resolutionStatus', assigned_to: 'assignedTo',
      starts_at: 'startsAt', ends_at: 'endsAt', target_value: 'targetValue', period_start: 'periodStart', period_end: 'periodEnd', unit_price: 'unitPrice',
      recurring_monthly_amount: 'recurringMonthlyAmount', competence_date: 'competenceDate', recognized_at: 'recognizedAt',
    }
    const canonicalField = (field: string) => fieldAliases[field] || field
    const filters = step.args.filter((item) => item.name === 'filter').map((item) => { const [field, ...rest] = item.value.split('|'); return [canonicalField(field), ...rest] })
    const sensitiveFieldFor = (field: string): TeamSensitiveField | null => {
      if (object === 'contact' && field === 'phone') return 'contact_phone'
      if (object === 'contact' && field === 'email') return 'contact_email'
      if ((object === 'lead' || object === 'opportunity') && field === 'value') return 'deal_value'
      if (object === 'proposal' && ['total','totalContractValue'].includes(field)) return 'proposal_total'
      if (object === 'proposal' && field === 'discountTotal') return 'proposal_discount'
      if (object === 'revenue' && ['amount','recurringMonthlyAmount'].includes(field)) return 'revenue_amount'
      return null
    }
    for (const [field] of filters) { const sensitive = field ? sensitiveFieldFor(field) : null; if (sensitive) assertSensitiveCapabilityField(runtime, sensitive, 'view') }
    const scalar = (value: unknown) => value === null || value === undefined ? '' : typeof value === 'string' ? value : String(value)
    const compare = (left: unknown, operator: string, right: string) => {
      const textLeft = normalize(scalar(left)); const textRight = normalize(right)
      const nLeft = Number(left); const nRight = Number(right); const numeric = Number.isFinite(nLeft) && Number.isFinite(nRight)
      if (operator === 'equals') return textLeft === textRight
      if (operator === 'not_equals') return textLeft !== textRight
      if (operator === 'contains') return textLeft.includes(textRight)
      if (operator === 'empty') return !scalar(left).trim()
      if (operator === 'not_empty') return Boolean(scalar(left).trim())
      if (operator === 'gt') return numeric ? nLeft > nRight : textLeft > textRight
      if (operator === 'gte') return numeric ? nLeft >= nRight : textLeft >= textRight
      if (operator === 'lt') return numeric ? nLeft < nRight : textLeft < textRight
      if (operator === 'lte') return numeric ? nLeft <= nRight : textLeft <= textRight
      return false
    }
    for (const [field, operator, ...rest] of filters) if (field && operator) rows = rows.filter((row) => compare(row[field], operator, rest.join('|')))
    const [rawSortField, sortDirection] = arg(step, 'sort').split('|')
    const sortField = canonicalField(rawSortField)
    if (sortField) { const sensitive = sensitiveFieldFor(sortField); if (sensitive) assertSensitiveCapabilityField(runtime, sensitive, 'view') }
    if (sortField) rows.sort((a, b) => {
      const av = a[sortField]; const bv = b[sortField]; const an = Number(av); const bn = Number(bv)
      const result = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : scalar(av).localeCompare(scalar(bv), 'pt-BR')
      return sortDirection === 'desc' ? -result : result
    })
    const limit = Math.max(1, Math.min(25, Math.round(num(arg(step, 'limit'), 10))))
    const selected = rows.slice(0, limit)
    const label = (row: any) => row.name || row.title || row.company || row.description || row.proposalNumber || row.id
    const detail = (row: any) => {
      if (object === 'lead') return [row.company, row.stageName, row.temperature, row.priority, Number.isFinite(row.daysSinceActivity) ? `${row.daysSinceActivity}d sem atividade` : '', fieldAccessAllowed(runtime, 'deal_value') && row.value ? Number(row.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''].filter(Boolean).join(' · ')
      if (object === 'contact') return [row.jobTitle, fieldAccessAllowed(runtime, 'contact_email') ? row.email : '', fieldAccessAllowed(runtime, 'contact_phone') ? row.phone : ''].filter(Boolean).join(' · ')
      if (object === 'opportunity') return [row.stageName, row.status, Number.isFinite(row.daysSinceActivity) ? `${row.daysSinceActivity}d sem atividade` : '', fieldAccessAllowed(runtime, 'deal_value') && row.value ? Number(row.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''].filter(Boolean).join(' · ')
      if (object === 'proposal') return [row.status, row.validUntil ? `válida até ${new Date(row.validUntil).toLocaleDateString('pt-BR')}` : '', fieldAccessAllowed(runtime, 'proposal_total') && row.total ? Number(row.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''].filter(Boolean).join(' · ')
      if (object === 'revenue') return [row.status, fieldAccessAllowed(runtime, 'revenue_amount') && row.amount ? Number(row.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '', row.competenceDate].filter(Boolean).join(' · ')
      return [row.status, row.category, row.metric, row.dueAt, row.startsAt].filter(Boolean).join(' · ')
    }
    const lines = selected.map((row, index) => `${index + 1}. ${label(row)}${detail(row) ? ` — ${detail(row)}` : ''}`)
    return { ok: true, summary: selected.length ? `${rows.length} registro(s) encontrado(s).\n${lines.join('\n')}` : 'Nenhum registro corresponde à consulta.' }
  }
  throw new Error(`A capacidade ${step.capabilityId} está registrada, mas ainda não possui executor nativo.`)
}

export async function undoCrmAgentOperation(operation: CrmAgentUndoOperation, runtime: CrmCapabilityExecutionRuntime): Promise<void> {
  const { actions, workspaceId } = runtime
  const before = operation.before ?? {}
  if (operation.kind === 'notifications.replace_dismissed') { replaceDismissedNotifications(workspaceId, Array.isArray(operation.metadata?.dismissedIds) ? operation.metadata!.dismissedIds as string[] : []); return }
  if (!operation.entityId) throw new Error(`Operação ${operation.kind} sem entidade para desfazer.`)
  if (operation.kind === 'contact.delete') { await actions.deleteContact(operation.entityId); return }
  if (operation.kind === 'contact.update') { await actions.updateContact(operation.entityId, before as any); return }
  if (operation.kind === 'company.update') { await actions.updateCompany(operation.entityId, before as any); return }
  if (operation.kind === 'lead.delete') { await actions.deleteLead(operation.entityId); return }
  if (operation.kind === 'lead.update') { await actions.updateLead(operation.entityId, before as any); return }
  if (operation.kind === 'lead.move') { if (!before.stageId) throw new Error('Etapa anterior indisponível.'); await actions.moveLead(operation.entityId, String(before.stageId)); await actions.updateLead(operation.entityId, { ...(before.status ? { status: before.status as any } : {}), ...(Object.prototype.hasOwnProperty.call(before, 'notes') ? { notes: String(before.notes ?? '') } : {}) }); return }
  if (operation.kind === 'task.delete') {
    const calendarEventId = typeof operation.metadata?.calendarEventId === 'string' ? operation.metadata.calendarEventId : ''
    if (calendarEventId) await actions.deleteCalendarEvent(calendarEventId)
    await deleteTask(runtime.repositoryMode, workspaceId, operation.entityId, runtime.teamAccess); return
  }
  if (operation.kind === 'task.status') { await updateTaskStatus(runtime.repositoryMode, workspaceId, operation.entityId, String(before.status || 'todo') as any, runtime.teamAccess); return }
  if (operation.kind === 'activity.delete') { await actions.deleteActivity(operation.entityId); return }
  if (operation.kind === 'call.delete') { await actions.deleteCall(operation.entityId); return }
  if (operation.kind === 'stage.delete') { await actions.deleteStage(operation.entityId); return }
  if (operation.kind === 'stage.update') { await actions.updateStage(operation.entityId, before as any); return }
  if (operation.kind === 'activity.update') { await actions.updateActivity(operation.entityId, before as any); return }
  if (operation.kind === 'calendar.delete') { await actions.deleteCalendarEvent(operation.entityId); return }
  if (operation.kind === 'calendar.update') { await actions.updateCalendarEvent(operation.entityId, before as any); return }
  if (operation.kind === 'proposal.delete') { await actions.deleteProposal(operation.entityId); return }
  if (operation.kind === 'proposal.status') { await actions.updateProposalStatus(operation.entityId, before.status as any); return }
  if (operation.kind === 'product.delete') { await actions.deleteProduct(operation.entityId); return }
  if (operation.kind === 'product.update') { await actions.updateProduct(operation.entityId, before as any); return }
  if (operation.kind === 'goal.delete') { await actions.deleteGoal(operation.entityId); return }
  if (operation.kind === 'goal.update') { await actions.updateGoal(operation.entityId, before as any); return }
  if (operation.kind === 'playbook.delete') { await actions.deletePlaybook(operation.entityId); return }
  if (operation.kind === 'playbook.update') { await actions.updatePlaybook(operation.entityId, before as any); return }
  if (operation.kind === 'automation.toggle') { await actions.updateAutomationRule(operation.entityId, { enabled: Boolean(before.enabled) }); return }
  if (operation.kind === 'invite.revoke') { await actions.revokeWorkspaceInvite(operation.entityId); return }
  if (operation.kind === 'member.role') { await actions.updateWorkspaceMemberRole(operation.entityId, before.role as any); return }
  if (operation.kind === 'revenue.status') { await actions.updateRevenueEntryStatus(operation.entityId, before.status as any); return }
  throw new Error(`A operação ${operation.kind} não possui desfazer automático.`)
}
