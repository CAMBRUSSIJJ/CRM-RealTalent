import type { AppRoute, Lead, Playbook, ProposalRecord, WorkspaceMember, WorkspaceSnapshot } from '../domain/types'
import { formatCurrency } from '../domain/formatters'
import { buildDealIntelligence, buildDealPortfolio, type DealIntelligence } from './deal-intelligence'
import { calculateRevenueIntelligence } from './revenue-intelligence'
import { searchHelpArticles } from './help-center'
import { parseFastAction, type FastActionTaskCandidate } from './realtalent-fast-actions'
import { inferCommercialLanguageIntent, type SemanticSalesInterpretation } from './realtalent-sales-language'
import { buildLeadScoreBoard, DEFAULT_LEAD_SCORING_CONFIG } from './lead-scoring'
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import type { AgentWorkDocument } from './realtalent-agent-v53-work'
import type { CrmPendingCapability } from './realtalent-crm-slot-filling'

export type AssistantIntent =
  | 'priorities'
  | 'best_contacts'
  | 'risk_deals'
  | 'call_now'
  | 'proposal_followup'
  | 'missing_decision_maker'
  | 'stale_deals'
  | 'forecast'
  | 'lead_summary'
  | 'prepare_call'
  | 'next_action'
  | 'activity_summary'
  | 'suggest_message'
  | 'meeting_summary'
  | 'create_followups'
  | 'create_task'
  | 'complete_task'
  | 'crm_capability'
  | 'help'
  | 'unknown'

export type AssistantItemKind = 'deal' | 'lead' | 'proposal'
export interface AssistantResultItem {
  id: string
  kind: AssistantItemKind
  leadId: string
  title: string
  subtitle: string
  score?: number
  value?: number
  reason: string
  route: 'leads' | 'pipeline' | 'proposals' | 'calls' | 'agenda' | 'communications'
  action?: string
  proposalId?: string
}

export type AssistantExecutionPlan =
  | {
      id: string
      kind: 'create_followups'
      title: string
      description: string
      leadIds: string[]
      dueAt: string
      preview: string[]
    }
  | {
      id: string
      kind: 'move_opportunity'
      title: string
      description: string
      leadId: string
      stageId: string
      preview: string[]
    }
  | {
      id: string
      kind: 'create_task'
      title: string
      description: string
      leadId: string | null
      contactId: string | null
      contactName: string | null
      assigneeId: string | null
      assigneeName: string
      dueAt: string
      priority: 'low' | 'normal' | 'high' | 'urgent'
      syncToAgenda: boolean
      taskType: 'call' | 'generic'
      preview: string[]
    }
  | {
      id: string
      kind: 'complete_task'
      title: string
      description: string
      taskId: string
      preview: string[]
    }
  | {
      id: string
      kind: 'update_lead_profile'
      title: string
      description: string
      leadId: string
      priority: 'low' | 'medium' | 'high' | 'urgent'
      temperature: 'cold' | 'warm' | 'hot'
      notes: string
      preview: string[]
    }
  | {
      id: string
      kind: 'create_goal'
      title: string
      description: string
      metric: 'calls' | 'contacts' | 'followups' | 'meetings' | 'proposals' | 'wins' | 'revenue' | 'new_leads'
      targetValue: number
      periodStart: string
      periodEnd: string
      preview: string[]
    }
  | {
      id: string
      kind: 'create_proposal'
      title: string
      description: string
      leadId: string
      productId: string
      probability: number
      validUntil: string
      contractTermMonths: number
      preview: string[]
    }
  | {
      id: string
      kind: 'crm_capabilities'
      title: string
      description: string
      goal: string
      steps: CrmCapabilityPlanStep[]
      preview: string[]
    }
  | {
      id: string
      kind: 'run_builder'
      title: string
      description: string
      product: 'crm' | 'blue_ocean'
      objective: string
      preview: string[]
    }
  | {
      id: string
      kind: 'run_qa'
      title: string
      description: string
      product: 'crm' | 'blue_ocean'
      objective: string
      preview: string[]
    }
  | {
      id: string
      kind: 'run_workflow'
      title: string
      description: string
      product: 'crm' | 'blue_ocean'
      objective: string
      preview: string[]
    }
  | {
      id: string
      kind: 'run_mission'
      title: string
      description: string
      objective: string
      preview: string[]
    }
  | {
      id: string
      kind: 'run_program'
      title: string
      description: string
      objective: string
      preview: string[]
    }

export interface AssistantDraft {
  kind: 'message'
  channel: 'whatsapp' | 'email'
  leadId: string
  title: string
  body: string
  rationale: string
}

export interface AssistantFocus {
  leadId: string
  title: string
  subtitle: string
  stageName: string
  healthScore: number
  value: number
  route?: AppRoute
  proposalId?: string
}

export interface AssistantExecutionSuggestion {
  capabilityId: string
  label: string
  seed: string
}

export type AssistantToolOutput =
  | { kind:'calculation'; title:string; result:string; formula:string; details:string[] }
  | { kind:'script'; title:string; body:string; channel:'call'|'meeting'|'whatsapp'|'email'; leadId:string|null; grounded:boolean;
      strategy?: {audience:string;channel?:'call'|'meeting'|'whatsapp'|'email';approach:string;rationale:string;alternatives:string[];assumptions:string[];
        evidence:'external'|'contextual';sources:{title:string;url:string}[]}
    }

export interface AssistantAnswer {
  id: string
  intent: AssistantIntent
  title: string
  text: string
  items: AssistantResultItem[]
  facts: string[]
  suggestedPrompts: string[]
  plan?: AssistantExecutionPlan
  toolOutput?: AssistantToolOutput
  draft?: AssistantDraft
  focus?: AssistantFocus
  pendingCapability?: CrmPendingCapability | null
  executionSuggestion?: AssistantExecutionSuggestion | null
  generatedAt: string
}

export interface AssistantContext {
  previousLeadIds?: string[]
  focusLeadId?: string
  focusProposalId?: string
  currentRoute?: AppRoute
  now?: Date
  workTasks?: FastActionTaskCandidate[]
  workspaceMembers?: WorkspaceMember[]
  currentUserId?: string | null
  conversationContext?: string
  semanticInterpretation?: SemanticSalesInterpretation | null
  activeWork?: AgentWorkDocument | null
  canReadPlaybooks?: boolean
  pendingCapability?: CrmPendingCapability | null
  loadWorkTasks?: () => Promise<FastActionTaskCandidate[]>
  loadWorkspaceMembers?: () => Promise<WorkspaceMember[]>
}

const normalize = (value: string) => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()

const containsAny = (query: string, terms: string[]) => terms.some((term) => query.includes(term))
const activeProposal = (snapshot: WorkspaceSnapshot, leadId: string): ProposalRecord | null => snapshot.proposals
  .filter((proposal) => proposal.leadId === leadId && proposal.isCurrentVersion && !['rejected', 'cancelled'].includes(proposal.status))
  .sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || b.version - a.version)[0] ?? null

const decisionRoles = new Set(['decision_maker', 'economic_buyer'])
const contactsForLead = (snapshot: WorkspaceSnapshot, lead: Lead) => snapshot.contacts.filter((contact) => contact.leadIds.includes(lead.id) || Boolean(lead.companyId && contact.companyId === lead.companyId))

const inferIntent = (raw: string, route?: AppRoute, semantic?: SemanticSalesInterpretation | null): AssistantIntent => {
  if (semantic && !semantic.needs_clarification && semantic.confidence >= 0.78 && semantic.intent !== 'unknown') return semantic.intent as AssistantIntent
  const fastIntent = parseFastAction(raw).intent
  if (fastIntent) return fastIntent
  const query = normalize(raw)
  if (!query) return 'help'
  const semanticIntent = inferCommercialLanguageIntent(raw, route)
  if (semanticIntent) return semanticIntent
  if (containsAny(query, ['prepare a ligacao', 'prepare a ligação', 'preparar ligacao', 'preparar ligação', 'prepare ligacao', 'prepare ligação', 'briefing da ligacao', 'briefing da ligação'])) return 'prepare_call'
  if (containsAny(query, ['qual a proxima acao', 'qual a próxima ação', 'proxima acao', 'próxima ação', 'o que fazer com este', 'o que fazer com essa conta'])) return 'next_action'
  if (containsAny(query, ['resuma o historico', 'resuma histórico', 'historico recente', 'histórico recente', 'ultimas interacoes', 'últimas interações'])) return 'activity_summary'
  if (containsAny(query, ['sugira mensagem', 'sugira uma mensagem', 'crie uma mensagem', 'mensagem para este lead', 'mensagem para essa conta', 'mensagem de follow'])) return 'suggest_message'
  if (containsAny(query, ['resuma a reuniao', 'resuma reunião', 'resumo da reuniao', 'resumo da reunião', 'ultima reuniao', 'última reunião'])) return 'meeting_summary'
  if (containsAny(query, ['crie follow', 'criar follow', 'agende follow', 'agenda follow', 'follow-up para esses', 'follow up para esses'])) return 'create_followups'
  if (containsAny(query, ['quem devo ligar', 'quem ligar', 'ligar agora', 'melhores ligacoes', 'melhores ligações'])) return 'call_now'
  if (containsAny(query, ['proposta sem resposta', 'propostas sem resposta', 'proposta aguardando', 'propostas aguardando'])) return 'proposal_followup'
  if (containsAny(query, ['sem decisor', 'falta decisor', 'decisor nao', 'decisor não', 'sem economic buyer'])) return 'missing_decision_maker'
  if (containsAny(query, ['negocios parados', 'negócios parados', 'parados', 'esfriando', 'stale'])) return 'stale_deals'
  if (containsAny(query, ['forecast', 'previsao', 'previsão', 'quanto vamos fechar', 'quanto devo fechar', 'gap para meta', 'cobertura do pipeline', 'pipeline coverage', 'commit', 'best case'])) return 'forecast'
  if (containsAny(query, ['em risco', 'negocios em risco', 'negócios em risco', 'riscos do pipeline', 'riscos'])) return 'risk_deals'
  if (containsAny(query, ['o que devo fazer', 'prioridades', 'prioridade de hoje', 'meu dia', 'hoje'])) return 'priorities'
  if (containsAny(query, ['resuma', 'resumo', 'me fale sobre', 'fale sobre', 'como esta', 'como está'])) return 'lead_summary'
  if (containsAny(query, ['como faco', 'como faço', 'como usar', 'onde encontro', 'onde fica', 'tutorial', 'configurar', 'ajuda', 'o que voce faz', 'o que você faz', 'comandos'])) return 'help'
  return 'unknown'
}

const nextBusinessMorning = (now: Date) => {
  const due = new Date(now)
  due.setDate(due.getDate() + 1)
  while (due.getDay() === 0 || due.getDay() === 6) due.setDate(due.getDate() + 1)
  due.setHours(9, 0, 0, 0)
  return due
}

const dueFromCommand = (raw: string, now: Date) => {
  const query = normalize(raw)
  const due = nextBusinessMorning(now)
  if (query.includes('hoje')) {
    due.setTime(now.getTime() + 2 * 60 * 60_000)
    due.setMinutes(0, 0, 0)
  } else if (query.includes('amanha') || query.includes('amanhã')) {
    due.setTime(now.getTime())
    due.setDate(due.getDate() + 1)
    while (due.getDay() === 0 || due.getDay() === 6) due.setDate(due.getDate() + 1)
    due.setHours(9, 0, 0, 0)
  }
  const hourMatch = query.match(/(?:as|às|a)\s*(\d{1,2})(?::(\d{2}))?\s*h?\b/)
  if (hourMatch) due.setHours(Math.min(23, Number(hourMatch[1])), Math.min(59, Number(hourMatch[2] ?? 0)), 0, 0)
  return due
}

const toDealItem = (deal: DealIntelligence, reason?: string): AssistantResultItem => ({
  id: `deal:${deal.lead.id}`,
  kind: 'deal',
  leadId: deal.lead.id,
  title: deal.lead.company || deal.lead.name,
  subtitle: `${deal.lead.name} · ${deal.healthScore}/100 · ${formatCurrency(deal.commercialValue)}`,
  score: deal.healthScore,
  value: deal.commercialValue,
  reason: reason ?? deal.nextBestAction.explanation,
  route: deal.nextBestAction.route,
  action: deal.nextBestAction.kind,
  proposalId: deal.proposal?.id,
})

const leadFromContext = (snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  if (context.focusLeadId) {
    const direct = snapshot.leads.find((lead) => lead.id === context.focusLeadId)
    if (direct) return direct
  }
  if (context.focusProposalId) {
    const proposal = snapshot.proposals.find((item) => item.id === context.focusProposalId)
    if (proposal) return snapshot.leads.find((lead) => lead.id === proposal.leadId) ?? null
  }
  if (context.previousLeadIds?.length === 1) return snapshot.leads.find((lead) => lead.id === context.previousLeadIds?.[0]) ?? null
  return null
}

const findLeadForSummary = (raw: string, snapshot: WorkspaceSnapshot, context: AssistantContext = {}) => {
  const focused = leadFromContext(snapshot, context)
  const semanticQuery = normalize(context.semanticInterpretation?.entities.contact_query || '')
  if (semanticQuery) {
    const semanticContacts = snapshot.contacts.filter((contact) => normalize(`${contact.name} ${contact.email} ${contact.phone}`).includes(semanticQuery))
    if (semanticContacts.length === 1 && semanticContacts[0].leadIds?.length === 1) {
      const contactLead = snapshot.leads.find((lead) => lead.id === semanticContacts[0].leadIds[0])
      if (contactLead) return contactLead
    }
    const semanticMatch = snapshot.leads.filter((lead) => normalize(`${lead.name} ${lead.company} ${lead.email} ${lead.phone}`).includes(semanticQuery))
    if (semanticMatch.length === 1) return semanticMatch[0]
    const fuzzyLeads = fuzzyEntityMatches(semanticQuery, snapshot.leads, (lead) => [lead.name, lead.company])
    if (fuzzyLeads.length === 1) return fuzzyLeads[0]
    const fuzzyContacts = fuzzyEntityMatches(semanticQuery, snapshot.contacts, (contact) => [contact.name])
    if (fuzzyContacts.length === 1 && fuzzyContacts[0].leadIds?.length === 1) {
      const contactLead = snapshot.leads.find((lead) => lead.id === fuzzyContacts[0].leadIds[0])
      if (contactLead) return contactLead
    }
  }
  const query = normalize(raw)
  const genericContextQuery = containsAny(query, ['este lead', 'esse lead', 'essa conta', 'esta conta', 'este negocio', 'esse negocio', 'este negócio', 'esse negócio', 'historico', 'histórico', 'ligacao', 'ligação', 'proxima', 'próxima', 'mensagem', 'reuniao', 'reunião'])
  if (focused && genericContextQuery) return focused
  const candidates = snapshot.leads.map((lead) => ({ lead, haystack: normalize(`${lead.name} ${lead.company} ${lead.phone} ${lead.email}`) }))
  const explicit = candidates
    .filter(({ haystack }) => haystack.split(/\s+/).some((token) => token.length >= 3 && query.includes(token)))
    .sort((a, b) => b.haystack.length - a.haystack.length)[0]?.lead ?? null
  return explicit ?? focused
}


const normalizeEntity = (value: string) => normalize(value).replace(/[^a-z0-9@._ -]+/g, ' ').replace(/\s+/g, ' ').trim()

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const upper = previous[j]
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost)
      diagonal = upper
    }
  }
  return previous[right.length]
}

const entitySimilarity = (query: string, candidate: string) => {
  const left = normalizeEntity(query)
  const right = normalizeEntity(candidate)
  if (!left || !right) return 0
  if (left === right) return 1
  if (right.includes(left) || left.includes(right)) return 0.94
  const distance = levenshteinDistance(left, right)
  return Math.max(0, 1 - distance / Math.max(left.length, right.length))
}

const fuzzyEntityMatches = <T>(query: string, values: T[], aliases: (value: T) => string[]) => {
  const scored = values
    .map((value) => ({ value, score: Math.max(...aliases(value).filter(Boolean).map((alias) => entitySimilarity(query, alias)), 0) }))
    .filter((item) => item.score >= 0.76)
    .sort((a, b) => b.score - a.score)
  if (!scored.length) return [] as T[]
  const best = scored[0].score
  return scored.filter((item) => item.score >= Math.max(0.76, best - 0.05)).slice(0, 5).map((item) => item.value)
}

const resolveContactForTask = (queryRaw: string | null, snapshot: WorkspaceSnapshot) => {
  const query = queryRaw ? normalizeEntity(queryRaw) : ''
  if (!query) return { contact: null, ambiguous: [] as typeof snapshot.contacts }
  const exact = snapshot.contacts.filter((contact) => normalizeEntity(contact.name) === query)
  if (exact.length === 1) return { contact: exact[0], ambiguous: [] as typeof snapshot.contacts }
  if (exact.length > 1) return { contact: null, ambiguous: exact }
  const partial = snapshot.contacts.filter((contact) => {
    const haystack = normalizeEntity(`${contact.name} ${contact.email} ${contact.phone}`)
    return haystack.includes(query) || query.includes(normalizeEntity(contact.name))
  })
  if (partial.length) return partial.length === 1 ? { contact: partial[0], ambiguous: [] as typeof snapshot.contacts } : { contact: null, ambiguous: partial }
  const fuzzy = fuzzyEntityMatches(query, snapshot.contacts, (contact) => [contact.name])
  return fuzzy.length === 1 ? { contact: fuzzy[0], ambiguous: [] as typeof snapshot.contacts } : { contact: null, ambiguous: fuzzy }
}

const resolveLeadForTask = (queryRaw: string | null, snapshot: WorkspaceSnapshot) => {
  const query = queryRaw ? normalizeEntity(queryRaw) : ''
  if (!query) return { lead: null, ambiguous: [] as Lead[] }
  const exact = snapshot.leads.filter((lead) => normalizeEntity(lead.name) === query || normalizeEntity(lead.company) === query)
  if (exact.length === 1) return { lead: exact[0], ambiguous: [] as Lead[] }
  if (exact.length > 1) return { lead: null, ambiguous: exact }
  const partial = snapshot.leads.filter((lead) => normalizeEntity(`${lead.name} ${lead.company} ${lead.email} ${lead.phone}`).includes(query))
  if (partial.length) return partial.length === 1 ? { lead: partial[0], ambiguous: [] as Lead[] } : { lead: null, ambiguous: partial }
  const fuzzy = fuzzyEntityMatches(query, snapshot.leads, (lead) => [lead.name, lead.company])
  return fuzzy.length === 1 ? { lead: fuzzy[0], ambiguous: [] as Lead[] } : { lead: null, ambiguous: fuzzy }
}

const resolveAssigneeForTask = (queryRaw: string | null, assignToCurrentUser: boolean, context: AssistantContext) => {
  const members = context.workspaceMembers ?? []
  if (assignToCurrentUser || !queryRaw) {
    const current = members.find((member) => member.userId === context.currentUserId) ?? null
    return { member: current, ambiguous: [] as WorkspaceMember[], requested: assignToCurrentUser || Boolean(context.currentUserId) }
  }
  const query = normalizeEntity(queryRaw)
  const exact = members.filter((member) => normalizeEntity(member.displayName) === query || normalizeEntity(member.email) === query)
  if (exact.length === 1) return { member: exact[0], ambiguous: [] as WorkspaceMember[], requested: true }
  if (exact.length > 1) return { member: null, ambiguous: exact, requested: true }
  const partial = members.filter((member) => normalizeEntity(`${member.displayName} ${member.email}`).includes(query))
  if (partial.length) return partial.length === 1 ? { member: partial[0], ambiguous: [] as WorkspaceMember[], requested: true } : { member: null, ambiguous: partial, requested: true }
  const fuzzy = fuzzyEntityMatches(query, members, (member) => [member.displayName, member.email])
  return fuzzy.length === 1 ? { member: fuzzy[0], ambiguous: [] as WorkspaceMember[], requested: true } : { member: null, ambiguous: fuzzy, requested: true }
}

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return 'sem data'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'data inválida'
}

const recentHistoryForLead = (snapshot: WorkspaceSnapshot, leadId: string) => {
  const entries = [
    ...snapshot.activities.filter((item) => item.leadId === leadId).map((item) => ({ at: item.completedAt ?? item.dueAt ?? item.createdAt, kind: item.type, title: item.title, detail: item.description || item.resolutionReason || '' })),
    ...snapshot.calls.filter((item) => item.leadId === leadId).map((item) => ({ at: item.endedAt ?? item.startedAt, kind: 'ligação', title: `Ligação · ${item.outcome}`, detail: item.notes || item.transcript || '' })),
    ...snapshot.events.filter((item) => item.leadId === leadId).map((item) => ({ at: item.endsAt ?? item.startsAt, kind: 'reunião', title: item.title, detail: item.description || item.location || '' })),
  ]
  return entries
    .filter((item) => Number.isFinite(new Date(item.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

const relevantPlaybook = (snapshot: WorkspaceSnapshot, lead: Lead, mode: 'call' | 'meeting'): Playbook | null => snapshot.playbooks
  .filter((playbook) => playbook.active && (!playbook.guidance?.executionModes?.length || playbook.guidance.executionModes.includes(mode)))
  .map((playbook) => ({
    playbook,
    score: (playbook.guidance?.stageIds?.includes(lead.stageId) ? 4 : 0)
      + (playbook.guidance?.temperatures?.includes(lead.temperature) ? 2 : 0)
      + (playbook.guidance?.executionModes?.includes(mode) ? 3 : 0),
  }))
  .sort((a, b) => b.score - a.score)[0]?.playbook ?? null

const focusForDeal = (deal: DealIntelligence, context: AssistantContext): AssistantFocus => ({
  leadId: deal.lead.id,
  title: deal.lead.company || deal.lead.name,
  subtitle: deal.lead.name,
  stageName: deal.stage?.name ?? 'Etapa não definida',
  healthScore: deal.healthScore,
  value: deal.commercialValue,
  route: context.currentRoute,
  proposalId: deal.proposal?.id,
})

const contextualPrompts = (hasFocus: boolean) => hasFocus
  ? ['Resuma o histórico desta conta', 'Prepare a ligação', 'Qual a próxima ação?', 'Sugira uma mensagem']
  : assistantSupportedPrompts.slice(0, 4)

export const assistantSupportedPrompts = [
  'Quem devo ligar agora?',
  'Quais negócios estão em risco?',
  'Mostre propostas sem resposta',
  'Quais negócios estão sem decisor?',
  'O que devo fazer hoje?',
  'Qual é o forecast RealTalent?',
]

const parseActionWithSemantic = (raw: string, now: Date, context: AssistantContext) => {
  const semantic = context.semanticInterpretation
  const forced = semantic && semantic.confidence >= 0.78 && !semantic.needs_clarification && ['create_task', 'create_followups', 'complete_task'].includes(semantic.intent)
    ? semantic.intent as 'create_task' | 'create_followups' | 'complete_task'
    : null
  const parsed = parseFastAction(raw, now, context.workTasks ?? [], forced)
  if (!semantic || semantic.confidence < 0.78 || semantic.needs_clarification || !forced) return parsed
  const dueAt = semantic.entities.due_at_iso && Number.isFinite(new Date(semantic.entities.due_at_iso).getTime()) ? new Date(semantic.entities.due_at_iso).toISOString() : parsed.dueAt
  const title = semantic.entities.task_title || parsed.title
  return {
    ...parsed,
    title,
    dueAt,
    contactQuery: semantic.entities.contact_query || parsed.contactQuery,
    assigneeQuery: semantic.entities.assignee_query || parsed.assigneeQuery,
    explicitTime: semantic.entities.explicit_time || parsed.explicitTime,
    taskType: semantic.entities.task_type === 'call' || semantic.entities.task_type === 'generic' ? semantic.entities.task_type : parsed.taskType,
    missing: forced === 'create_task'
      ? [...(!title ? ['title' as const] : []), ...(!dueAt ? ['dueAt' as const] : [])]
      : forced === 'create_followups'
        ? (dueAt ? [] : ['dueAt' as const])
        : parsed.missing,
  }
}

export const runRealTalentAssistant = (raw: string, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): AssistantAnswer => {
  const now = context.now ?? new Date()
  const intent = inferIntent(raw, context.currentRoute, context.semanticInterpretation)
  const focusedLead = leadFromContext(snapshot, context)
  // Fast actions intentionally bypass full portfolio intelligence. Simple commands should
  // feel immediate and only pay the heavier analysis cost when the question needs it.
  const fastBase = {
    id: `assistant:${now.getTime()}`,
    intent,
    items: [] as AssistantResultItem[],
    facts: [] as string[],
    suggestedPrompts: contextualPrompts(Boolean(focusedLead)),
    generatedAt: now.toISOString(),
  }

  if (intent === 'create_task') {
    const parsed = parseActionWithSemantic(raw, now, context)
    if (parsed.missing.includes('title') && parsed.missing.includes('dueAt')) {
      return { ...fastBase, title: 'Nova tarefa', text: 'Consigo. Me diga o que você quer colocar na tarefa e para quando. Se estiver relacionado a um contato, abra esse contato ou diga o nome dele.', suggestedPrompts: ['Ligar para João amanhã às 10h', 'Revisar proposta sexta às 14h'] }
    }
    if (parsed.missing.includes('title')) return { ...fastBase, title: 'Nova tarefa', text: 'Qual é a tarefa que você quer criar?', suggestedPrompts: ['Ligar para o cliente', 'Revisar a proposta', 'Enviar documentos'] }
    if (parsed.missing.includes('dueAt')) return { ...fastBase, title: 'Nova tarefa', text: `Certo: “${parsed.title}”. Para quando devo agendar?`, suggestedPrompts: ['Hoje às 16h', 'Amanhã às 10h', 'Sexta às 14h'] }
    const contactResolution = resolveContactForTask(parsed.contactQuery, snapshot)
    const leadResolution = !contactResolution.contact && parsed.contactQuery ? resolveLeadForTask(parsed.contactQuery, snapshot) : { lead: null, ambiguous: [] as Lead[] }
    if (parsed.contactQuery && !contactResolution.contact && contactResolution.ambiguous.length > 1) {
      return { ...fastBase, title: 'Qual contato?', text: `Encontrei mais de um contato para “${parsed.contactQuery}”. Escolha qual deles você quis dizer.`, facts: contactResolution.ambiguous.slice(0, 5).map((contact) => contact.name), suggestedPrompts: contactResolution.ambiguous.slice(0, 4).map((contact) => `Criar para ${contact.name}`) }
    }
    if (parsed.contactQuery && !contactResolution.contact && leadResolution.ambiguous.length > 1) {
      return { ...fastBase, title: 'Qual registro?', text: `Encontrei mais de um registro comercial para “${parsed.contactQuery}”. Escolha qual deles você quis dizer.`, facts: leadResolution.ambiguous.slice(0, 5).map((lead) => lead.company || lead.name), suggestedPrompts: [] }
    }
    if (parsed.contactQuery && !contactResolution.contact && !leadResolution.lead) {
      return { ...fastBase, title: 'Contato não encontrado', text: `Não encontrei “${parsed.contactQuery}” nos contatos ou oportunidades autorizados do CRM. Diga outro nome ou abra o registro correto e peça novamente.`, suggestedPrompts: [] }
    }
    const contact = contactResolution.contact
    const lead = contact?.leadIds?.length ? snapshot.leads.find((item) => contact.leadIds.includes(item.id)) ?? null : leadResolution.lead ?? findLeadForSummary(raw, snapshot, context)
    const assigneeResolution = resolveAssigneeForTask(parsed.assigneeQuery, parsed.assignToCurrentUser, context)
    if (parsed.assigneeQuery && !assigneeResolution.member && assigneeResolution.ambiguous.length > 1) {
      return { ...fastBase, title: 'Qual responsável?', text: `Encontrei mais de um usuário para “${parsed.assigneeQuery}”. Escolha o responsável.`, facts: assigneeResolution.ambiguous.slice(0, 5).map((member) => member.displayName), suggestedPrompts: assigneeResolution.ambiguous.slice(0, 4).map((member) => `Responsável ${member.displayName}`) }
    }
    if (parsed.assigneeQuery && !assigneeResolution.member) {
      return { ...fastBase, title: 'Responsável não encontrado', text: `Não encontrei “${parsed.assigneeQuery}” entre os usuários autorizados deste CRM. Diga outro responsável.`, suggestedPrompts: [] }
    }
    const assignee = assigneeResolution.member
    const dueAt = parsed.dueAt!
    const plan: AssistantExecutionPlan = {
      id: `plan:task:${now.getTime()}`, kind: 'create_task', title: contact && parsed.taskType === 'call' ? `Ligar para ${contact.name}` : parsed.title!,
      description: contact ? `Tarefa vinculada ao contato ${contact.name}.` : lead ? `Tarefa vinculada a ${lead.company || lead.name}.` : 'Tarefa criada a partir do seu pedido.',
      leadId: lead?.id ?? null, contactId: contact?.id ?? null, contactName: contact?.name ?? null,
      assigneeId: assignee?.userId ?? context.currentUserId ?? null, assigneeName: assignee?.displayName ?? (parsed.assignToCurrentUser ? 'Você' : ''),
      dueAt, priority: parsed.priority, syncToAgenda: parsed.explicitTime, taskType: parsed.taskType,
      preview: [
        contact && parsed.taskType === 'call' ? `Ligar para ${contact.name}` : parsed.title!,
        new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dueAt)),
        contact ? `Contato: ${contact.name}` : lead ? `CRM: ${lead.company || lead.name}` : 'Sem vínculo obrigatório com contato',
        `Responsável: ${assignee?.displayName ?? (parsed.assignToCurrentUser ? 'Você' : 'usuário atual')}`,
        ...(parsed.explicitTime ? ['Também aparecerá na Agenda.'] : []),
      ],
    }
    return { ...fastBase, title: 'Tarefa pronta para confirmar', text: 'Entendi seu pedido. Revise os dados abaixo e confirme para eu criar a tarefa no CRM.', plan, suggestedPrompts: [] }
  }

  if (intent === 'complete_task') {
    const parsed = parseActionWithSemantic(raw, now, context)
    if (parsed.missing.includes('task')) {
      const openTasks = (context.workTasks ?? []).filter((task) => !['completed', 'cancelled'].includes(task.status)).slice(0, 4)
      return { ...fastBase, title: 'Concluir tarefa', text: openTasks.length ? 'Qual tarefa você quer concluir? Diga o nome dela.' : 'Não encontrei tarefa aberta no seu escopo para concluir.', facts: openTasks.map((task) => task.title), suggestedPrompts: openTasks.map((task) => `Concluir a tarefa ${task.title}`).slice(0, 4) }
    }
    const plan: AssistantExecutionPlan = { id: `plan:complete-task:${now.getTime()}`, kind: 'complete_task', title: `Concluir “${parsed.taskTitle}”`, description: 'A tarefa só será marcada como concluída depois da sua confirmação.', taskId: parsed.taskId!, preview: [parsed.taskTitle!] }
    return { ...fastBase, title: 'Conclusão pronta para confirmar', text: 'Encontrei a tarefa. Confirme para marcá-la como concluída.', plan, suggestedPrompts: [] }
  }

  if (intent === 'create_followups') {
    const parsed = parseActionWithSemantic(raw, now, context)
    if (parsed.missing.includes('dueAt')) return { ...fastBase, title: 'Novo follow-up', text: 'Para quando devo agendar o follow-up?', suggestedPrompts: ['Hoje às 16h', 'Amanhã às 10h', 'Sexta às 14h'] }
    let leadIds = [...new Set(context.previousLeadIds ?? [])]
    const focused = leadFromContext(snapshot, context)
    if (!leadIds.length && focused) leadIds = [focused.id]
    if (!leadIds.length) {
      const lead = findLeadForSummary(raw, snapshot, context)
      if (lead) leadIds = [lead.id]
    }
    const leads = leadIds.map((id) => snapshot.leads.find((lead) => lead.id === id)).filter((lead): lead is Lead => Boolean(lead && lead.status === 'active' && !lead.doNotContact))
    if (!leads.length) return { ...fastBase, title: 'Novo follow-up', text: 'Abra o contato ou negócio que você quer acompanhar, ou diga o nome dele. Eu preparo o follow-up e peço sua confirmação antes de criar.' }
    const dueAt = parsed.dueAt!
    const plan: AssistantExecutionPlan = { id: `plan:${now.getTime()}`, kind: 'create_followups', title: `Criar ${leads.length} follow-up(s)`, description: 'Nada foi alterado ainda. Confirme para criar.', leadIds: leads.map((lead) => lead.id), dueAt, preview: leads.map((lead) => `${lead.company || lead.name} — ${lead.name}`) }
    return { ...fastBase, title: 'Follow-up pronto para confirmar', text: `Agendamento preparado para ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dueAt))}.`, items: leads.map((lead) => ({ id: `lead:${lead.id}`, kind: 'lead', leadId: lead.id, title: lead.company || lead.name, subtitle: lead.name, reason: 'Receberá o follow-up somente após confirmação.', route: 'leads' })), plan, suggestedPrompts: [] }
  }

  const portfolio = buildDealPortfolio(snapshot, undefined, now)
  const focusedDeal = focusedLead ? buildDealIntelligence(focusedLead, snapshot, undefined, now) : null
  const base = {
    id: `assistant:${now.getTime()}`,
    intent,
    items: [] as AssistantResultItem[],
    facts: [] as string[],
    suggestedPrompts: contextualPrompts(Boolean(focusedDeal)),
    generatedAt: now.toISOString(),
    ...(focusedDeal ? { focus: focusForDeal(focusedDeal, context) } : {}),
  }

  if (intent === 'best_contacts') {
    const criteria = context.semanticInterpretation?.entities.criteria ?? []
    const temperatureRank = { hot: 3, warm: 2, cold: 1 } as const
    const priorityRank = { urgent: 4, high: 3, medium: 2, low: 1 } as const
    const scored = buildLeadScoreBoard(snapshot, DEFAULT_LEAD_SCORING_CONFIG, now, context.currentUserId ?? undefined)
    const ranked = [...scored].sort((left, right) => {
      if (criteria.includes('deal_value')) return (right.lead.value ?? 0) - (left.lead.value ?? 0) || right.score - left.score
      if (criteria.includes('temperature')) return (temperatureRank[right.lead.temperature] ?? 0) - (temperatureRank[left.lead.temperature] ?? 0) || right.score - left.score
      if (criteria.includes('priority')) return (priorityRank[right.lead.priority] ?? 0) - (priorityRank[left.lead.priority] ?? 0) || right.score - left.score
      return right.score - left.score
    }).slice(0, 5)
    const criterionLabel = criteria.includes('deal_value') ? 'valor comercial' : criteria.includes('temperature') ? 'temperatura comercial' : criteria.includes('priority') ? 'prioridade registrada' : 'Score Comercial do CRM'
    return {
      ...base,
      title: 'Melhores contatos agora',
      text: ranked.length
        ? `Separei ${ranked.length} contato(s) priorizados por ${criterionLabel}.`
        : 'Não encontrei contatos ativos elegíveis no seu escopo.',
      items: ranked.map((insight) => ({
        id: `lead:${insight.lead.id}`,
        kind: 'lead' as const,
        leadId: insight.lead.id,
        title: insight.lead.name,
        subtitle: insight.lead.company || insight.lead.ownerName || 'Contato do CRM',
        score: insight.score,
        value: insight.lead.value,
        reason: insight.reasons[0] || insight.nextBestAction.explanation,
        route: 'leads' as const,
        action: insight.nextBestAction.title,
      })),
      facts: ranked.map((insight, index) => `${index + 1}. ${insight.lead.name} — Score ${insight.score}/100 · ${insight.nextBestAction.title}`),
      suggestedPrompts: ['Por que o primeiro está na frente?', 'Quem devo ligar agora?', 'Mostre só os contatos quentes', 'Quais estão sem próxima ação?'],
    }
  }

  if (intent === 'prepare_call') {
    const lead = findLeadForSummary(raw, snapshot, context)
    if (!lead) return { ...base, title: 'Preparação de ligação', text: 'Abra um lead/negócio ou informe a empresa para eu montar o briefing da ligação.' }
    const deal = buildDealIntelligence(lead, snapshot, undefined, now)
    const contacts = contactsForLead(snapshot, lead)
    const decisionMakers = contacts.filter((contact) => decisionRoles.has(contact.decisionRole))
    const history = recentHistoryForLead(snapshot, lead.id)
    const playbook = relevantPlaybook(snapshot, lead, 'call')
    const recent = history[0]
    const facts = [
      `Objetivo: ${deal.nextBestAction.objective}`,
      `Health ${deal.healthScore}/100 · probabilidade ${deal.realTalentProbability}%`,
      decisionMakers.length ? `${decisionMakers.length} decisor(es) mapeado(s)` : 'Decisor ainda não mapeado',
      recent ? `Último contato: ${formatShortDate(recent.at)} · ${recent.title}` : 'Sem interação registrada',
      playbook ? `Roteiro sugerido: ${playbook.title}` : 'Sem roteiro específico sugerido',
    ]
    return { ...base, focus: focusForDeal(deal, context), title: `Briefing de ligação · ${lead.company || lead.name}`, text: `Entre na conversa buscando “${deal.nextBestAction.objective}”. ${deal.risks[0] ? `Atenção principal: ${deal.risks[0].detail}` : 'Não há risco crítico detectado no momento.'}`, items: [toDealItem(deal, deal.nextBestAction.explanation)], facts, suggestedPrompts: ['Resuma o histórico desta conta', 'Sugira uma mensagem', 'Qual a próxima ação?', 'Crie follow-up para este lead amanhã às 10h'] }
  }

  if (intent === 'next_action') {
    const lead = findLeadForSummary(raw, snapshot, context)
    if (!lead) return { ...base, title: 'Próxima ação', text: 'Abra um negócio ou informe o nome da empresa para eu analisar a próxima ação.' }
    const deal = buildDealIntelligence(lead, snapshot, undefined, now)
    return { ...base, focus: focusForDeal(deal, context), title: 'Próxima melhor ação', text: `${deal.nextBestAction.title}. ${deal.nextBestAction.explanation}`, items: [toDealItem(deal, deal.nextBestAction.explanation)], facts: [`Urgência: ${deal.nextBestAction.urgency === 'now' ? 'agora' : deal.nextBestAction.urgency === 'today' ? 'hoje' : 'planejada'}`, `Objetivo: ${deal.nextBestAction.objective}`, deal.risks[0] ? `Risco principal: ${deal.risks[0].title}` : 'Sem risco crítico'] }
  }

  if (intent === 'activity_summary') {
    const lead = findLeadForSummary(raw, snapshot, context)
    if (!lead) return { ...base, title: 'Histórico comercial', text: 'Abra um lead/conta ou informe o nome para eu resumir o histórico.' }
    const deal = buildDealIntelligence(lead, snapshot, undefined, now)
    const history = recentHistoryForLead(snapshot, lead.id)
    const calls = snapshot.calls.filter((item) => item.leadId === lead.id)
    const completedMeetings = snapshot.events.filter((item) => item.leadId === lead.id && item.status === 'completed')
    const openFollowups = snapshot.activities.filter((item) => item.leadId === lead.id && item.type === 'followup' && !item.completedAt && item.resolutionStatus !== 'cancelled')
    const recentText = history.slice(0, 3).map((entry) => `${formatShortDate(entry.at)} — ${entry.title}`).join(' · ')
    return { ...base, focus: focusForDeal(deal, context), title: `Histórico · ${lead.company || lead.name}`, text: history.length ? `Últimas interações: ${recentText}.` : 'Ainda não há interações registradas para este negócio.', items: [toDealItem(deal, deal.nextBestAction.explanation)], facts: [`${calls.length} ligação(ões)`, `${completedMeetings.length} reunião(ões) concluída(s)`, `${openFollowups.length} follow-up(s) aberto(s)`, deal.lastInteractionAt ? `Última interação: ${formatShortDate(deal.lastInteractionAt)}` : 'Sem última interação'] }
  }

  if (intent === 'meeting_summary') {
    const lead = findLeadForSummary(raw, snapshot, context)
    if (!lead) return { ...base, title: 'Resumo de reunião', text: 'Abra o negócio ou informe a empresa para eu localizar a última reunião.' }
    const deal = buildDealIntelligence(lead, snapshot, undefined, now)
    const meetings = snapshot.events.filter((item) => item.leadId === lead.id && item.status !== 'cancelled').sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
    const meeting = meetings.find((item) => item.status === 'completed') ?? meetings[0]
    if (!meeting) return { ...base, focus: focusForDeal(deal, context), title: 'Resumo de reunião', text: 'Não encontrei reunião registrada para este negócio.', items: [toDealItem(deal)] }
    const relatedNotes = snapshot.activities.filter((item) => item.leadId === lead.id && item.type === 'note').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 2)
    const details = [meeting.description, ...relatedNotes.map((item) => item.description)].map((item) => item?.trim()).filter(Boolean)
    return { ...base, focus: focusForDeal(deal, context), title: meeting.title || 'Última reunião', text: details.length ? details.join(' · ') : 'A reunião está registrada, mas não possui descrição/notas suficientes para um resumo confiável.', items: [toDealItem(deal, deal.nextBestAction.explanation)], facts: [`Data: ${formatShortDate(meeting.startsAt)}`, `Status: ${meeting.status}`, meeting.location ? `Local: ${meeting.location}` : 'Sem local registrado', `Próxima ação: ${deal.nextBestAction.title}`] }
  }

  if (intent === 'suggest_message') {
    const lead = findLeadForSummary(raw, snapshot, context)
    if (!lead) return { ...base, title: 'Mensagem sugerida', text: 'Abra um lead/conta ou informe a empresa para eu preparar a mensagem.' }
    const deal = buildDealIntelligence(lead, snapshot, undefined, now)
    const proposal = activeProposal(snapshot, lead.id)
    const firstName = lead.name.split(/\s+/)[0] || lead.name
    const channel: 'whatsapp' | 'email' = lead.phone ? 'whatsapp' : 'email'
    const next = deal.nextBestAction.title.toLowerCase()
    const body = proposal && ['sent', 'viewed'].includes(proposal.status)
      ? `Olá, ${firstName}! Queria retomar a proposta ${proposal.title}. Conseguiu avaliar os pontos principais? Posso esclarecer alguma dúvida e alinharmos o próximo passo?`
      : `Olá, ${firstName}! Estou retomando nosso contato sobre ${lead.company || 'a oportunidade'}. Queria alinhar ${deal.nextBestAction.objective.toLowerCase()} e entender se faz sentido avançarmos. Como está sua disponibilidade?`
    return { ...base, focus: focusForDeal(deal, context), title: 'Mensagem sugerida', text: 'Preparei uma mensagem contextual. Ela não será enviada automaticamente.', items: [toDealItem(deal, `Mensagem alinhada à próxima ação: ${next}.`)], facts: [`Canal sugerido: ${channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}`, `Baseada em: ${deal.nextBestAction.title}`], draft: { kind: 'message', channel, leadId: lead.id, title: proposal ? `Follow-up · ${proposal.title}` : `Follow-up · ${lead.company || lead.name}`, body, rationale: deal.nextBestAction.explanation }, suggestedPrompts: ['Prepare a ligação', 'Resuma o histórico desta conta', 'Qual a próxima ação?', 'Crie follow-up para este lead amanhã às 10h'] }
  }

  if (intent === 'call_now') {
    const deals = portfolio.priorities.filter((deal) => deal.lead.phone && !deal.lead.doNotContact).slice(0, 7)
    return { ...base, title: 'Quem ligar agora', text: deals.length ? `Encontrei ${deals.length} contato(s) com melhor combinação de urgência, risco e potencial.` : 'Não encontrei nenhum contato elegível para ligação agora.', items: deals.map((deal) => toDealItem(deal)), facts: [`${portfolio.deals.length} negócios ativos analisados`, `${portfolio.critical + portfolio.attention} negócios exigem atenção`] }
  }

  if (intent === 'risk_deals') {
    const deals = portfolio.priorities.filter((deal) => ['attention', 'critical'].includes(deal.healthLevel) || deal.risks.some((risk) => ['critical', 'high'].includes(risk.severity))).slice(0, 10)
    return { ...base, title: 'Negócios em risco', text: deals.length ? `${deals.length} negócio(s) concentram os principais riscos do pipeline.` : 'Nenhum negócio está classificado como atenção/crítico agora.', items: deals.map((deal) => toDealItem(deal, deal.risks[0]?.detail)), facts: [`${formatCurrency(portfolio.atRiskValue)} em valor sob atenção`, `${portfolio.critical} crítico(s)`, `${portfolio.cooling} esfriando`] }
  }

  if (intent === 'proposal_followup') {
    const deals = portfolio.priorities.filter((deal) => deal.proposal && ['sent', 'viewed'].includes(deal.proposal.status) && deal.risks.some((risk) => ['proposal-viewed-no-response', 'proposal-expiring', 'buyer-room-not-opened'].includes(risk.key))).slice(0, 10)
    const fallback = snapshot.proposals.filter((proposal) => proposal.isCurrentVersion && ['sent', 'viewed'].includes(proposal.status)).slice(0, 10).map((proposal) => {
      const lead = snapshot.leads.find((item) => item.id === proposal.leadId)
      return lead ? { id: `proposal:${proposal.id}`, kind: 'proposal' as const, leadId: lead.id, proposalId: proposal.id, title: proposal.title, subtitle: `${lead.company || lead.name} · ${proposal.status === 'viewed' ? 'Visualizada' : 'Enviada'}`, reason: 'Proposta ativa aguardando avanço comercial.', route: 'proposals' as const, action: 'follow-proposal' } : null
    }).filter((item): item is NonNullable<typeof item> => Boolean(item))
    const items = deals.length ? deals.map((deal) => toDealItem(deal, deal.risks.find((risk) => risk.source === 'proposal' || risk.key === 'buyer-room-not-opened')?.detail)) : fallback
    return { ...base, title: 'Propostas aguardando resposta', text: items.length ? `Há ${items.length} proposta(s) que merecem acompanhamento.` : 'Não encontrei propostas enviadas/visualizadas aguardando acompanhamento.', items, facts: [`${portfolio.proposalRisks} risco(s) de proposta detectados`] }
  }

  if (intent === 'missing_decision_maker') {
    const deals = portfolio.priorities.filter((deal) => deal.risks.some((risk) => risk.key === 'missing-decision-maker')).slice(0, 10)
    return { ...base, title: 'Contas sem decisor', text: deals.length ? `${deals.length} oportunidade(s) avançaram sem decisor econômico/final claramente mapeado.` : 'Nenhum gap crítico de decisor foi detectado nos negócios ativos.', items: deals.map((deal) => toDealItem(deal, 'Decisor econômico/final ainda não está mapeado no Account 360.')), facts: [`${portfolio.missingDecisionMaker} negócio(s) sem decisor`] }
  }

  if (intent === 'stale_deals') {
    const deals = portfolio.priorities.filter((deal) => deal.momentum === 'cooling' || deal.risks.some((risk) => ['stale', 'stale-critical'].includes(risk.key))).slice(0, 10)
    return { ...base, title: 'Negócios parados ou esfriando', text: deals.length ? `Identifiquei ${deals.length} negócio(s) perdendo momentum.` : 'Nenhum negócio está parado acima dos limites atuais.', items: deals.map((deal) => toDealItem(deal, deal.risks.find((risk) => ['stale', 'stale-critical'].includes(risk.key))?.detail ?? 'Momentum em queda.')), facts: [`${portfolio.cooling} negócio(s) esfriando`] }
  }

  if (intent === 'forecast') {
    const revenue = calculateRevenueIntelligence(snapshot, now)
    const targetFact = revenue.goalTarget
      ? `Meta ${formatCurrency(revenue.goalTarget)} · gap esperado ${formatCurrency(revenue.gapToGoal)}`
      : 'Meta comercial não configurada para o período'
    const coverageFact = revenue.pipelineCoverage === null ? 'Cobertura indisponível sem meta' : Number.isFinite(revenue.pipelineCoverage) ? `Cobertura ${revenue.pipelineCoverage.toFixed(1)}×` : 'Meta já coberta pelos fechados'
    return {
      ...base,
      title: 'Revenue Intelligence',
      text: `Para ${revenue.monthLabel}, o Commit RealTalent está em ${formatCurrency(revenue.commitForecast)}, o forecast esperado em ${formatCurrency(revenue.realTalentForecast)} e o Best Case em ${formatCurrency(revenue.bestCaseForecast)}.`,
      facts: [targetFact, coverageFact, `Confiança ${revenue.forecastConfidenceScore}/100`, `${formatCurrency(revenue.atRiskValue)} em valor sob atenção`],
      suggestedPrompts: ['Quais negócios estão puxando o forecast para baixo?', 'Quais negócios estão em risco?', 'Qual é o gap para a meta?', 'O que devo fazer hoje?'],
    }
  }

  if (intent === 'lead_summary') {
    const lead = findLeadForSummary(raw, snapshot, context)
    if (!lead) return { ...base, title: 'Resumo do negócio', text: 'Não consegui identificar qual lead ou empresa você quer resumir. Inclua o nome da pessoa ou empresa.', suggestedPrompts: ['Resuma Morada Barbearia', ...assistantSupportedPrompts.slice(0, 3)] }
    const deal = buildDealIntelligence(lead, snapshot, undefined, now)
    const contacts = contactsForLead(snapshot, lead)
    const proposal = activeProposal(snapshot, lead.id)
    return { ...base, focus: focusForDeal(deal, context), title: lead.company || lead.name, text: `${lead.name} está em ${deal.stage?.name ?? 'etapa não definida'}, com Deal Health ${deal.healthScore}/100 e probabilidade RealTalent de ${deal.realTalentProbability}%. A próxima melhor ação é “${deal.nextBestAction.title}”.`, items: [toDealItem(deal)], facts: [`Valor: ${formatCurrency(deal.commercialValue)}`, `${contacts.length} stakeholder(s) mapeado(s)`, proposal ? `Proposta: ${proposal.status}` : 'Sem proposta ativa', deal.risks[0] ? `Maior risco: ${deal.risks[0].title}` : 'Sem risco crítico detectado'] }
  }

  if (intent === 'priorities') {
    const deals = portfolio.priorities.slice(0, 7)
    return { ...base, title: 'Prioridades de hoje', text: deals.length ? `Estas são as ${deals.length} oportunidades que eu trabalharia primeiro agora.` : 'Não há negócios ativos para priorizar.', items: deals.map((deal) => toDealItem(deal)), facts: [`${portfolio.critical + portfolio.attention} negócio(s) exigem atenção`, `${portfolio.noNextStep} sem próximo passo`, `${portfolio.proposalRisks} risco(s) de proposta`] }
  }

  if (intent === 'help') {
    const articles = searchHelpArticles(raw, context.currentRoute, 3)
    const specific = articles[0]
    if (specific && normalize(raw) !== 'ajuda' && !containsAny(normalize(raw), ['o que voce faz', 'o que você faz', 'comandos'])) {
      return {
        ...base,
        title: specific.title,
        text: specific.summary,
        facts: specific.steps,
        suggestedPrompts: [
          ...(specific.related ?? []).map((id) => searchHelpArticles(id, context.currentRoute, 1)[0]?.title).filter((item): item is string => Boolean(item)).slice(0, 2),
          'O que devo fazer hoje?',
          'Como funciona o RealTalent AI?',
        ],
      }
    }
    return { ...base, title: 'RealTalent Assistant', text: 'Eu acompanho o contexto da tela, consulto os dados autorizados do workspace e posso planejar ações em módulos do CRM. Você pode pedir em linguagem natural; alterações passam pelas permissões do seu perfil e ações de escrita exigem revisão antes da execução.', suggestedPrompts: focusedDeal ? [...contextualPrompts(true), 'Como faço um follow-up no CRM?'] : [...assistantSupportedPrompts.slice(0, 4), 'Como faço uma proposta no CRM?'] }
  }

  return { ...base, title: 'Não consegui mapear a ação com segurança', text: focusedDeal ? 'Estou com este negócio em contexto, mas não consegui escolher uma capacidade do CRM com confiança suficiente. Reformule o objetivo ou diga qual informação/alteração você espera.' : 'Entendi que você está pedindo algo no CRM, mas não consegui associar o pedido com segurança a uma capacidade disponível. Você pode reformular em linguagem natural; não precisa usar comandos técnicos.', suggestedPrompts: focusedDeal ? contextualPrompts(true) : assistantSupportedPrompts }
}
