import type { WorkspaceSnapshot } from '../domain/types'
import type { WorkManagementSnapshot } from './work-management'
import type { AssistantAnswer, AssistantContext, AssistantExecutionPlan } from './realtalent-assistant'
import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'

// legacy audit marker: const AGENT_URL = 'http://127.0.0.1:8791'
const AGENT_URL = env.agentGatewayUrl

export interface RemoteAgentActionBase { rationale: string; risk: 'write' }
export type RemoteAgentAction =
  | (RemoteAgentActionBase & { tool: 'crm.create_followup'; lead_id: string; due_at: string; title: string })
  | (RemoteAgentActionBase & { tool: 'crm.move_opportunity'; lead_id: string; stage_id: string })
  | (RemoteAgentActionBase & { tool: 'crm.create_task'; lead_id: string; title: string; description: string; due_at: string; priority: 'low' | 'normal' | 'high' | 'urgent' })
  | (RemoteAgentActionBase & { tool: 'crm.update_lead_profile'; lead_id: string; priority: 'low' | 'medium' | 'high' | 'urgent'; temperature: 'cold' | 'warm' | 'hot'; notes: string })
  | (RemoteAgentActionBase & { tool: 'crm.create_goal'; metric: 'calls' | 'contacts' | 'followups' | 'meetings' | 'proposals' | 'wins' | 'revenue' | 'new_leads'; target_value: number; period_start: string; period_end: string })
  | (RemoteAgentActionBase & { tool: 'crm.create_proposal'; lead_id: string; product_id: string; title: string; probability: number; valid_until: string; contract_term_months: number })
  | (RemoteAgentActionBase & { tool: 'system.run_builder'; product: 'crm' | 'blue_ocean'; objective: string })
  | { tool: 'system.run_qa'; product: 'crm' | 'blue_ocean'; objective: string; rationale: string; risk: 'read' }
  | (RemoteAgentActionBase & { tool: 'system.run_workflow'; product: 'crm' | 'blue_ocean'; objective: string })
  | (RemoteAgentActionBase & { tool: 'system.run_mission'; objective: string })
  | (RemoteAgentActionBase & { tool: 'system.run_program'; objective: string })

interface RemoteAgentResponse {
  ok: boolean
  provider?: string
  model?: string
  message?: string
  summary?: string
  action?: RemoteAgentAction | null
  mode?: 'ASK' | 'ANALYZE' | 'ACT' | 'BUILD' | 'QA' | 'WORKFLOW' | 'MISSION' | 'PROGRAM' | 'GOVERNANCE'
  target_product?: 'crm' | 'blue_ocean' | 'shared'
  session?: { turns: number; events: number }
  suggested_prompts?: string[]
  error?: string
}

export interface CrmAgentReadScope {
  resources?: { contacts?: boolean; pipeline?: boolean; tasks?: boolean }
  leadIds?: string[]
  opportunityIds?: string[]
  contactIds?: string[]
  activityIds?: string[]
  eventIds?: string[]
  fieldAccess?: { contactPhone?: boolean; contactEmail?: boolean; dealValue?: boolean }
}

export interface CrmAgentSyncOptions {
  workManagement?: WorkManagementSnapshot
  readScope?: CrmAgentReadScope
}

const compactContext = (snapshot: WorkspaceSnapshot, context: AssistantContext, options: CrmAgentSyncOptions = {}) => {
  const scope = options.readScope ?? {}
  const leadIds = new Set(scope.leadIds ?? snapshot.leads.map((item) => item.id))
  const opportunityIds = new Set(scope.opportunityIds ?? snapshot.opportunities.map((item) => item.id))
  const contactIds = new Set(scope.contactIds ?? snapshot.contacts.map((item) => item.id))
  const activityIds = new Set(scope.activityIds ?? snapshot.activities.map((item) => item.id))
  const eventIds = new Set(scope.eventIds ?? snapshot.events.map((item) => item.id))
  const canPhone = scope.fieldAccess?.contactPhone !== false
  const canEmail = scope.fieldAccess?.contactEmail !== false
  const canDealValue = scope.fieldAccess?.dealValue !== false
  const leads = snapshot.leads.filter((item) => leadIds.has(item.id))
  const contacts = snapshot.contacts.filter((item) => contactIds.has(item.id))
  const opportunities = snapshot.opportunities.filter((item) => opportunityIds.has(item.id))
  const activities = snapshot.activities.filter((item) => activityIds.has(item.id))
  const events = snapshot.events.filter((item) => eventIds.has(item.id))
  const tasks = (options.workManagement?.tasks ?? [])
  const companyIds = new Set([
    ...leads.map((item) => item.companyId).filter(Boolean),
    ...contacts.map((item) => item.companyId).filter(Boolean),
    ...opportunities.map((item) => item.companyId).filter(Boolean),
  ])
  return {
    workspace: { id: snapshot.workspace.id, name: snapshot.workspace.name },
    route: context.currentRoute ?? null,
    focusLeadId: context.focusLeadId ?? null,
    focusProposalId: context.focusProposalId ?? null,
    now: (context.now ?? new Date()).toISOString(),
    permissions: { resources: scope.resources ?? { contacts: true, pipeline: true, tasks: true }, fieldAccess: scope.fieldAccess ?? { contactPhone: true, contactEmail: true, dealValue: true } },
    stages: snapshot.stages.map((stage) => ({ id: stage.id, name: stage.name, order: stage.order, probability: stage.probability, isWon: stage.isWon, isLost: stage.isLost })),
    companies: snapshot.companies.filter((item) => companyIds.has(item.id)).slice(0, 500).map((item) => ({ id: item.id, name: item.name, status: item.status, city: item.city, state: item.state })),
    leads: leads.slice(0, 500).map((lead) => ({
      id: lead.id, name: lead.name, company: lead.company, stageId: lead.stageId, status: lead.status, value: canDealValue ? lead.value : null,
      priority: lead.priority, temperature: lead.temperature, ownerId: lead.ownerId, ownerName: lead.ownerName, doNotContact: lead.doNotContact,
      phone: canPhone ? lead.phone : '', email: canEmail ? lead.email : '', companyId: lead.companyId, primaryContactId: lead.primaryContactId, opportunityId: lead.opportunityId, notes: lead.notes, createdAt: lead.createdAt, updatedAt: lead.updatedAt,
    })),
    contacts: contacts.slice(0, 500).map((contact) => ({
      id: contact.id, name: contact.name, companyId: contact.companyId, leadIds: contact.leadIds, jobTitle: contact.jobTitle, decisionRole: contact.decisionRole,
      phone: canPhone ? contact.phone : '', email: canEmail ? contact.email : '', lastContactAt: contact.lastContactAt ?? null, nextActionAt: contact.nextActionAt ?? null,
      relationshipOwnerId: contact.relationshipOwnerId ?? null, relationshipOwnerName: contact.relationshipOwnerName ?? '', doNotContact: contact.doNotContact, createdAt: contact.createdAt, updatedAt: contact.updatedAt,
    })),
    activities: activities.slice(0, 700).map((item) => ({
      id: item.id, leadId: item.leadId, contactId: item.contactId ?? null, type: item.type, title: item.title, description: item.description, dueAt: item.dueAt, completedAt: item.completedAt,
      resolutionStatus: item.resolutionStatus ?? null, assignedTo: item.assignedTo, sourceType: item.sourceType, createdAt: item.createdAt, updatedAt: item.updatedAt,
    })),
    openActivities: activities.filter((item) => !item.completedAt && item.resolutionStatus !== 'cancelled').slice(0, 500).map((item) => ({
      id: item.id, leadId: item.leadId, contactId: item.contactId ?? null, type: item.type, title: item.title, description: item.description, dueAt: item.dueAt, assignedTo: item.assignedTo, createdAt: item.createdAt, updatedAt: item.updatedAt,
    })),
    opportunities: opportunities.slice(0, 500).map((item) => ({ id: item.id, leadId: item.leadId, companyId: item.companyId, primaryContactId: item.primaryContactId, title: item.title, stageId: item.stageId, value: canDealValue ? item.value : null, ownerId: item.ownerId, expectedCloseAt: item.expectedCloseAt, probability: item.probability, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })),
    tasks: tasks.slice(0, 700).map((item) => ({ id: item.id, title: item.title, description: item.description, status: item.status, priority: item.priority, startsAt: item.startsAt, dueAt: item.dueAt, completedAt: item.completedAt, assigneeId: item.assigneeId, assigneeName: item.assigneeName, teamId: item.teamId, tags: item.tags, createdAt: item.createdAt, updatedAt: item.updatedAt })),
    taskRelations: (options.workManagement?.relations ?? []).filter((item) => tasks.some((task) => task.id === item.taskId)).slice(0, 800),
    events: events.slice(0, 400).map((item) => ({ id: item.id, leadId: item.leadId, contactId: item.contactId ?? null, title: item.title, description: item.description, startsAt: item.startsAt, endsAt: item.endsAt, allDay: item.allDay, location: item.location, status: item.status, assignedTo: item.assignedTo })),
    products: snapshot.products.filter((item) => item.active).slice(0, 200).map((item) => ({ id: item.id, name: item.name, sku: item.sku, category: item.category, unitPrice: item.unitPrice, billingType: item.billingType, billingInterval: item.billingInterval, lifecycleStatus: item.lifecycleStatus ?? null, targetCustomer: item.targetCustomer ?? '' })),
    proposals: snapshot.proposals.filter((item) => item.isCurrentVersion).slice(0, 300).map((item) => ({ id: item.id, leadId: item.leadId, title: item.title, status: item.status, probability: item.probability, totalContractValue: canDealValue ? item.totalContractValue : null, validUntil: item.validUntil })),
    goals: snapshot.goals.slice(0, 100).map((item) => ({ id: item.id, scope: item.scope ?? 'workspace', metric: item.metric, targetValue: item.targetValue, periodStart: item.periodStart, periodEnd: item.periodEnd })),
  }
}



export async function syncCrmAppContext(snapshot: WorkspaceSnapshot, context: AssistantContext = {}, options: CrmAgentSyncOptions = {}): Promise<void> {
  const raw = compactContext(snapshot, context, options)
  const selectedLead = context.focusLeadId ? raw.leads.find((item) => item.id === context.focusLeadId) : null
  const selectedProposal = context.focusProposalId ? raw.proposals.find((item) => item.id === context.focusProposalId) : null
  const response = await runtimeFetch(`${AGENT_URL}/app-context/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product:'crm', source:'crm-ui', context:{
      product:'crm', workspace:raw.workspace, route:raw.route,
      selected:selectedLead ? { type:'lead', id:selectedLead.id, label:selectedLead.name } : selectedProposal ? { type:'proposal', id:selectedProposal.id, label:selectedProposal.title } : null,
      ids:{ focusLeadId:context.focusLeadId ?? null, focusProposalId:context.focusProposalId ?? null },
      screenState:{ route:raw.route, repositoryMode:null }, actionsAllowed:[], data:{ asOf:raw.now, permissions:raw.permissions, stages:raw.stages, companies:raw.companies, leads:raw.leads, contacts:raw.contacts, activities:raw.activities, openActivities:raw.openActivities, opportunities:raw.opportunities, tasks:raw.tasks, taskRelations:raw.taskRelations, events:raw.events, products:raw.products, proposals:raw.proposals, goals:raw.goals },
    } }),
  })
  if (!response.ok) throw new Error(`App Context Bridge respondeu HTTP ${response.status}.`)
}


export interface AgentWorkspaceIdentity {
  source: 'crm'
  workspace: { id: string; name: string; role: string }
  user: { id: string; displayName?: string }
  access: {
    profileId: string
    systemKey?: string | null
    profileName: string
    teamIds: string[]
    teamRole?: string
    rules: Array<{ resource: string; scope: string; actions: string[] }>
  }
}

export async function syncAgentWorkspaceIdentity(identity: AgentWorkspaceIdentity): Promise<{ ok: boolean; actor?: { id: string; role: string; team: string }; capabilities?: Record<string, unknown> }> {
  const response = await runtimeFetch(`${AGENT_URL}/identity/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity),
  })
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; actor?: { id: string; role: string; team: string }; capabilities?: Record<string, unknown>; error?: string }
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Identity Runtime respondeu HTTP ${response.status}.`)
  return { ok: true, actor: payload.actor, capabilities: payload.capabilities }
}

export async function getAgentWorkspaceIdentity(): Promise<{ active: boolean; identity?: unknown; capabilities?: unknown; note?: string }> {
  const response = await runtimeFetch(`${AGENT_URL}/identity`)
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; identity?: { active?: boolean; identity?: unknown; capabilities?: unknown; note?: string }; error?: string }
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Identity Runtime respondeu HTTP ${response.status}.`)
  return { active: Boolean(payload.identity?.active), identity: payload.identity?.identity, capabilities: payload.identity?.capabilities, note: payload.identity?.note }
}

const isoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

export const planFromAction = (action: RemoteAgentAction | null | undefined, snapshot: WorkspaceSnapshot): AssistantExecutionPlan | undefined => {
  if (!action) return undefined
  if (action.tool === 'crm.create_followup') {
    const lead = snapshot.leads.find((item) => item.id === action.lead_id)
    const due = new Date(action.due_at)
    if (!lead || !Number.isFinite(due.getTime())) return undefined
    return { id: `agent-followup:${lead.id}:${due.toISOString()}`, kind: 'create_followups', title: action.title || `Follow-up — ${lead.company || lead.name}`, description: action.rationale, leadIds: [lead.id], dueAt: due.toISOString(), preview: [`${lead.company || lead.name} — ${lead.name}`] }
  }
  if (action.tool === 'crm.move_opportunity') {
    const lead = snapshot.leads.find((item) => item.id === action.lead_id)
    const stage = snapshot.stages.find((item) => item.id === action.stage_id)
    if (!lead || !stage) return undefined
    return { id: `agent-move:${lead.id}:${stage.id}:${Date.now()}`, kind: 'move_opportunity', title: `Mover ${lead.company || lead.name}`, description: action.rationale, leadId: lead.id, stageId: stage.id, preview: [`${lead.company || lead.name}: ${snapshot.stages.find((item) => item.id === lead.stageId)?.name ?? 'etapa atual'} → ${stage.name}`] }
  }
  if (action.tool === 'crm.create_task') {
    const lead = snapshot.leads.find((item) => item.id === action.lead_id)
    const due = new Date(action.due_at)
    if (!lead || !Number.isFinite(due.getTime()) || !action.title.trim()) return undefined
    const contact = lead.primaryContactId ? snapshot.contacts.find((item) => item.id === lead.primaryContactId) ?? null : null
    return {
      id: `agent-task:${lead.id}:${Date.now()}`, kind: 'create_task', title: action.title.trim(), description: action.description || action.rationale,
      leadId: lead.id, contactId: contact?.id ?? null, contactName: contact?.name ?? null,
      assigneeId: lead.ownerId ?? null, assigneeName: lead.ownerName || '',
      dueAt: due.toISOString(), priority: action.priority, syncToAgenda: true, taskType: /ligar|telefon/i.test(action.title) ? 'call' : 'generic',
      preview: [`${lead.company || lead.name} · ${action.priority} · ${due.toLocaleString('pt-BR')}`, ...(lead.ownerName ? [`Responsável: ${lead.ownerName}`] : []), 'Também aparecerá na Agenda.'],
    }
  }
  if (action.tool === 'crm.update_lead_profile') {
    const lead = snapshot.leads.find((item) => item.id === action.lead_id)
    if (!lead) return undefined
    return { id: `agent-profile:${lead.id}:${Date.now()}`, kind: 'update_lead_profile', title: `Atualizar classificação de ${lead.company || lead.name}`, description: action.rationale, leadId: lead.id, priority: action.priority, temperature: action.temperature, notes: action.notes, preview: [`Prioridade: ${lead.priority} → ${action.priority}`, `Temperatura: ${lead.temperature} → ${action.temperature}`, ...(action.notes.trim() ? ['Notas: atualizar com contexto proposto'] : [])] }
  }
  if (action.tool === 'crm.create_goal') {
    if (!Number.isFinite(action.target_value) || action.target_value <= 0 || !isoDate(action.period_start) || !isoDate(action.period_end) || action.period_end < action.period_start) return undefined
    return { id: `agent-goal:${action.metric}:${action.period_start}:${Date.now()}`, kind: 'create_goal', title: `Criar meta de ${action.metric}`, description: action.rationale, metric: action.metric, targetValue: action.target_value, periodStart: action.period_start, periodEnd: action.period_end, preview: [`${action.metric}: ${action.target_value}`, `${action.period_start} → ${action.period_end}`] }
  }
  if (action.tool === 'crm.create_proposal') {
    const lead = snapshot.leads.find((item) => item.id === action.lead_id)
    const product = snapshot.products.find((item) => item.id === action.product_id && item.active)
    if (!lead || !product || !action.title.trim() || !Number.isFinite(action.probability) || action.probability < 0 || action.probability > 100 || !Number.isFinite(action.contract_term_months) || action.contract_term_months < 1) return undefined
    const validUntil = action.valid_until && isoDate(action.valid_until) ? action.valid_until : ''
    return { id: `agent-proposal:${lead.id}:${product.id}:${Date.now()}`, kind: 'create_proposal', title: action.title.trim(), description: action.rationale, leadId: lead.id, productId: product.id, probability: action.probability, validUntil, contractTermMonths: Math.max(1, Math.round(action.contract_term_months)), preview: [`${lead.company || lead.name}`, `${product.name} · preço de catálogo`, `Probabilidade ${Math.round(action.probability)}% · ${Math.max(1, Math.round(action.contract_term_months))} meses`] }
  }
  if (action.tool === 'system.run_builder') {
    const objective = action.objective.trim()
    if (!objective) return undefined
    return { id: `agent-builder:${action.product}:${Date.now()}`, kind: 'run_builder', title: `Builder · ${action.product === 'crm' ? 'RealTalent CRM' : 'Blue Ocean'}`, description: action.rationale, product: action.product, objective, preview: [objective, 'Backup + gates + rollback + Browser QA'] }
  }
  if (action.tool === 'system.run_qa') {
    const objective = action.objective.trim()
    if (!objective) return undefined
    return { id: `agent-qa:${action.product}:${Date.now()}`, kind: 'run_qa', title: `QA · ${action.product === 'crm' ? 'RealTalent CRM' : 'Blue Ocean'}`, description: action.rationale, product: action.product, objective, preview: [objective, 'Navegação local em modo observe'] }
  }
  if (action.tool === 'system.run_workflow') {
    const objective = action.objective.trim()
    if (!objective) return undefined
    return { id: `agent-workflow:${action.product}:${Date.now()}`, kind: 'run_workflow', title: `Workflow · ${action.product === 'crm' ? 'RealTalent CRM' : 'Blue Ocean'}`, description: action.rationale, product: action.product, objective, preview: [objective, 'ANALYZE + QA automáticos · ACT/Builder com checkpoint'] }
  }
  if (action.tool === 'system.run_mission') {
    const objective = action.objective.trim()
    if (!objective) return undefined
    return { id: `agent-mission:${Date.now()}`, kind: 'run_mission', title: 'Missão · CRM ↔ Blue Ocean', description: action.rationale, objective, preview: [objective, 'Handoffs por produto · contexto atual em cada bloco · checkpoints preservados'] }
  }
  if (action.tool === 'system.run_program') {
    const objective = action.objective.trim()
    if (!objective) return undefined
    return { id: `agent-program:${Date.now()}`, kind: 'run_program', title: 'Programa · objetivo estratégico', description: action.rationale, objective, preview: [objective, 'Múltiplas missões · prioridades + dependências · aceite humano por marco'] }
  }
  return undefined
}

const sanitizeUserFacingAgentText = (value: string | undefined, fallback = '') => {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  const cleaned = text
    .replace(/\bintent:[^\s;]+(?:;stream:[^\s]+)?/gi, '')
    .replace(/`?(?:crm|system)\.[a-z0-9_.-]+`?/gi, '')
    .replace(/(?:use|usar|utilize|utilizar)\s+(?:o\s+)?(?:comando|tool|ferramenta)\s*[:\-]?/gi, '')
    .replace(/(?:parametros?|parâmetros?|argumentos?)\s+(?:da|do|necessarios?|necessários?)?\s*[:\-]?/gi, '')
    .replace(/\bunknown\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim()
  if (!cleaned || ['a ação correspondente', 'acao correspondente'].includes(cleaned.toLocaleLowerCase('pt-BR'))) return fallback
  return cleaned
}

export async function askRemoteRealTalentAgent(prompt: string, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<{ answer: AssistantAnswer; model: string } | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 50_000)
  try {
    const response = await runtimeFetch(`${AGENT_URL}/agent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        product: 'crm', surface: 'crm', prompt,
        context: { workspace: { id: snapshot.workspace.id, name: snapshot.workspace.name }, route: context.currentRoute ?? null, focusLeadId: context.focusLeadId ?? null, focusProposalId: context.focusProposalId ?? null, now: (context.now ?? new Date()).toISOString() },
        allowed_tools: ['crm.contacts.search', 'crm.contacts.get', 'crm.opportunities.search', 'crm.opportunities.get', 'crm.pipeline.summary', 'crm.pipeline.list', 'crm.tasks.search', 'crm.tasks.get', 'crm.followups.search', 'crm.myday.read', 'crm.calendar.read', 'crm.create_followup', 'crm.move_opportunity', 'crm.create_task', 'crm.update_lead_profile', 'crm.create_goal', 'crm.create_proposal'],
      }),
    })
    if (!response.ok) return null
    const payload = await response.json() as RemoteAgentResponse
    if (!payload.ok || !payload.message) return null
    const rawAgentMessage = String(payload.message ?? '')
    const technicalInstructionLeak = /(?:crm|system)\.[a-z0-9_.-]+|(?:use|usar|utilize)\s+(?:o\s+)?(?:comando|tool|ferramenta)|(?:forne[cç]a|informe)\s+(?:os\s+)?(?:crit[eé]rios|par[aâ]metros|argumentos)/i.test(rawAgentMessage)
    if (technicalInstructionLeak && !payload.action) return null
    const plan = planFromAction(payload.action, snapshot)
    const safeMessage = sanitizeUserFacingAgentText(payload.message, 'Entendi seu pedido, mas ainda não há confirmação de execução no CRM.')
    const safeTitle = sanitizeUserFacingAgentText(payload.summary, 'RealTalent')
    const safeSuggestions = [...new Set((payload.suggested_prompts ?? []).map((item) => sanitizeUserFacingAgentText(item)).filter((item) => item && item.toLocaleLowerCase('pt-BR') !== safeMessage.toLocaleLowerCase('pt-BR')))].slice(0, 4)
    const answer: AssistantAnswer = {
      id: `openai:${Date.now()}`,
      intent: plan?.kind === 'create_followups' ? 'create_followups' : plan?.kind === 'create_task' ? 'create_task' : 'unknown',
      title: safeTitle, text: safeMessage, items: [],
      facts: plan ? ['Ação preparada; nada foi alterado ainda.'] : [],
      suggestedPrompts: safeSuggestions, plan, generatedAt: new Date().toISOString(),
    }
    return { answer, model: payload.model || 'IA Local' }
  } catch { return null }
  finally { window.clearTimeout(timer) }
}

export type UnifiedOperationResult = { status: BrowserQaOutcome; summary: string; evidence?: string; artifactsDir?: string }

export async function runUnifiedBuilder(product: 'crm' | 'blue_ocean', objective: string): Promise<UnifiedOperationResult> {
  try {
    const started = await runtimeFetch(`${AGENT_URL}/builder/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product, objective }) })
    const first = await started.json() as { ok?: boolean; job_id?: string; error?: string }
    if (!started.ok || !first.ok || !first.job_id) return { status: 'UNAVAILABLE', summary: first.error || 'Não foi possível iniciar o Builder.' }
    for (let attempt = 0; attempt < 720; attempt += 1) {
      await sleep(1000)
      const response = await runtimeFetch(`${AGENT_URL}/builder/jobs/${encodeURIComponent(first.job_id)}`)
      const job = await response.json() as { ok?: boolean; status?: string; result?: { status?: string; summary?: string; artifactsDir?: string }; error?: string }
      if (!response.ok || !job.ok) return { status: 'UNAVAILABLE', summary: job.error || 'Builder indisponível.' }
      if (job.status === 'failed') return { status: 'FAIL', summary: job.error || 'Builder falhou.' }
      if (job.status === 'cancelled') return { status: 'UNKNOWN', summary: 'Builder cancelado.' }
      if (job.status === 'completed') {
        const raw = job.result?.status || 'UNKNOWN'
        const status: BrowserQaOutcome = raw === 'PASS' ? 'PASS' : raw === 'PASS_CODE_QA_NEEDS_USER' || raw === 'NEEDS_USER' ? 'NEEDS_USER' : raw === 'FAIL' || raw === 'BLOCKED' ? 'FAIL' : 'UNKNOWN'
        return { status, summary: job.result?.summary || `Builder concluído: ${raw}`, artifactsDir: job.result?.artifactsDir }
      }
    }
    return { status: 'UNKNOWN', summary: 'Builder excedeu o limite de acompanhamento da interface.' }
  } catch (error) { return { status: 'UNAVAILABLE', summary: error instanceof Error ? error.message : 'Não foi possível conectar ao Builder.' } }
}

export async function runUnifiedBrowserQa(product: 'crm' | 'blue_ocean', objective: string): Promise<BrowserQaResult> {
  const baseUrl = product === 'crm' ? 'http://127.0.0.1:4188/' : 'http://127.0.0.1:4173/'
  return runBrowserQaJob(product, baseUrl, objective, 'observe')
}

export type WorkflowStatus = 'running' | 'waiting_job' | 'awaiting_approval' | 'awaiting_execution' | 'paused' | 'needs_user' | 'completed' | 'failed' | 'cancelled'
export interface AutonomousWorkflowStep {
  id: string
  kind: 'analyze' | 'act' | 'builder' | 'qa'
  title: string
  objective: string
  failure_policy: 'stop' | 'continue'
  status: string
  summary?: string
  outcome?: string | null
  action?: RemoteAgentAction | null
  jobId?: string | null
}
export interface AutonomousWorkflow {
  id: string
  product: 'crm' | 'blue_ocean'
  title: string
  objective: string
  summary: string
  status: WorkflowStatus
  currentStepIndex: number
  progress: { completed: number; total: number; percent: number }
  currentStep: AutonomousWorkflowStep | null
  steps: AutonomousWorkflowStep[]
  pendingAction: RemoteAgentAction | null
  error?: string
}

const CRM_ALLOWED_TOOLS = ['crm.create_followup', 'crm.move_opportunity', 'crm.create_task', 'crm.update_lead_profile', 'crm.create_goal', 'crm.create_proposal']

const readWorkflowPayload = async (response: Response): Promise<AutonomousWorkflow> => {
  const payload = await response.json() as { ok?: boolean; workflow?: AutonomousWorkflow; error?: string }
  if (!response.ok || !payload.ok || !payload.workflow) throw new Error(payload.error || `Workflow Runtime respondeu HTTP ${response.status}.`)
  return payload.workflow
}

const driveCrmWorkflow = async (workflow: AutonomousWorkflow, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousWorkflow> => {
  let current = workflow
  for (let attempt = 0; attempt < 720; attempt += 1) {
    if (!['running', 'waiting_job', 'paused'].includes(current.status)) return current
    if (current.status === 'paused') return current
    if (current.status === 'waiting_job') await sleep(1000)
    const response = await runtimeFetch(`${AGENT_URL}/workflows/${encodeURIComponent(current.id)}/advance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: compactContext(snapshot, context), allowed_tools: CRM_ALLOWED_TOOLS }),
    })
    current = await readWorkflowPayload(response)
  }
  return current
}

export async function startCrmWorkflow(objective: string, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousWorkflow> {
  const response = await runtimeFetch(`${AGENT_URL}/workflows/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: 'crm', objective, context: compactContext(snapshot, context), allowed_tools: CRM_ALLOWED_TOOLS }),
  })
  return driveCrmWorkflow(await readWorkflowPayload(response), snapshot, context)
}

export async function continueCrmWorkflow(workflow: AutonomousWorkflow, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousWorkflow> {
  return driveCrmWorkflow(workflow, snapshot, context)
}

export async function approveCrmWorkflowStep(workflowId: string): Promise<{ workflow: AutonomousWorkflow; executionRequired: boolean; action: RemoteAgentAction | null }> {
  const response = await runtimeFetch(`${AGENT_URL}/workflows/${encodeURIComponent(workflowId)}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const payload = await response.json() as { ok?: boolean; workflow?: AutonomousWorkflow; execution_required?: boolean; action?: RemoteAgentAction | null; error?: string }
  if (!response.ok || !payload.ok || !payload.workflow) throw new Error(payload.error || 'Não foi possível aprovar a etapa do workflow.')
  return { workflow: payload.workflow, executionRequired: Boolean(payload.execution_required), action: payload.action ?? null }
}

export async function completeCrmWorkflowStep(workflowId: string, stepId: string, success: boolean, summary: string): Promise<AutonomousWorkflow> {
  const response = await runtimeFetch(`${AGENT_URL}/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(stepId)}/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success, summary }),
  })
  return readWorkflowPayload(response)
}

export async function cancelCrmWorkflow(workflowId: string): Promise<AutonomousWorkflow> {
  const response = await runtimeFetch(`${AGENT_URL}/workflows/${encodeURIComponent(workflowId)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  return readWorkflowPayload(response)
}

export async function resumeCrmWorkflow(workflowId: string): Promise<AutonomousWorkflow> {
  const response = await runtimeFetch(`${AGENT_URL}/workflows/${encodeURIComponent(workflowId)}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  return readWorkflowPayload(response)
}

export async function getActiveCrmWorkflow(snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousWorkflow | null> {
  try {
    const response = await runtimeFetch(`${AGENT_URL}/workflows`)
    const payload = await response.json() as { ok?: boolean; workflows?: AutonomousWorkflow[] }
    if (!response.ok || !payload.ok) return null
    const workflow = (payload.workflows ?? []).find((item) => item.product === 'crm' && ['running', 'waiting_job', 'awaiting_approval', 'awaiting_execution', 'paused', 'needs_user'].includes(item.status)) ?? null
    if (!workflow) return null
    return ['running', 'waiting_job'].includes(workflow.status) ? driveCrmWorkflow(workflow, snapshot, context) : workflow
  } catch { return null }
}


export type MissionStatus = 'running' | 'needs_context' | 'waiting_workflow' | 'awaiting_checkpoint' | 'paused' | 'needs_user' | 'completed' | 'failed' | 'cancelled'
export interface AutonomousMissionLeg {
  id: string
  product: 'crm' | 'blue_ocean'
  title: string
  objective: string
  failure_policy: 'stop' | 'continue'
  status: string
  summary?: string
  workflowId?: string | null
  attempts?: number
}
export interface AutonomousMission {
  id: string
  title: string
  objective: string
  summary: string
  status: MissionStatus
  currentLegIndex: number
  progress: { completed: number; total: number; warnings: number; percent: number }
  currentLeg: AutonomousMissionLeg | null
  legs: AutonomousMissionLeg[]
  requestedProduct: 'crm' | 'blue_ocean' | null
  currentWorkflow: AutonomousWorkflow | null
  replans: number
  error?: string
}

const readMissionPayload = async (response: Response): Promise<AutonomousMission> => {
  const payload = await response.json() as { ok?: boolean; mission?: AutonomousMission; error?: string }
  if (!response.ok || !payload.ok || !payload.mission) throw new Error(payload.error || `Mission Runtime respondeu HTTP ${response.status}.`)
  return payload.mission
}

const driveCrmMission = async (mission: AutonomousMission, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousMission> => {
  let current = mission
  for (let attempt = 0; attempt < 720; attempt += 1) {
    if (['completed', 'failed', 'cancelled', 'needs_user'].includes(current.status)) return current
    if (current.requestedProduct && current.requestedProduct !== 'crm') return current
    if (current.status === 'awaiting_checkpoint' || current.status === 'paused') return current
    if (current.status === 'waiting_workflow') await sleep(1000)
    const response = await runtimeFetch(`${AGENT_URL}/missions/${encodeURIComponent(current.id)}/advance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: 'crm', context: compactContext(snapshot, context), allowed_tools: CRM_ALLOWED_TOOLS }),
    })
    current = await readMissionPayload(response)
  }
  return current
}

export async function startCrmMission(objective: string, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousMission> {
  const response = await runtimeFetch(`${AGENT_URL}/missions/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objective, current_product: 'crm', context: compactContext(snapshot, context), allowed_tools: CRM_ALLOWED_TOOLS }),
  })
  return driveCrmMission(await readMissionPayload(response), snapshot, context)
}

export async function continueCrmMission(mission: AutonomousMission, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousMission> {
  return driveCrmMission(mission, snapshot, context)
}

export async function getActiveCrmMission(snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousMission | null> {
  try {
    const response = await runtimeFetch(`${AGENT_URL}/missions`)
    const payload = await response.json() as { ok?: boolean; missions?: AutonomousMission[] }
    if (!response.ok || !payload.ok) return null
    const mission = (payload.missions ?? []).find((item) => ['running', 'needs_context', 'waiting_workflow', 'awaiting_checkpoint', 'paused', 'needs_user'].includes(item.status) && (!item.requestedProduct || item.requestedProduct === 'crm')) ?? null
    if (!mission) return null
    return ['running', 'needs_context', 'waiting_workflow'].includes(mission.status) ? driveCrmMission(mission, snapshot, context) : mission
  } catch { return null }
}

export type BrowserQaOutcome = 'PASS' | 'FAIL' | 'NEEDS_USER' | 'UNKNOWN' | 'UNAVAILABLE'
export interface BrowserQaResult {
  status: BrowserQaOutcome
  summary: string
  evidence?: string
  confidence?: number
  artifactsDir?: string
}

interface BrowserQaJobPayload {
  ok: boolean
  status: string
  outcome?: BrowserQaOutcome | null
  result?: BrowserQaResult | null
  error?: string | null
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

async function runBrowserQaJob(product: 'crm' | 'blue_ocean', baseUrl: string, objective: string, mode: 'observe' | 'sandbox' = 'observe'): Promise<BrowserQaResult> {
  try {
    const started = await runtimeFetch(`${AGENT_URL}/qa/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, base_url: baseUrl, objective, mode, max_steps: 10 }),
    })
    const startPayload = await started.json() as { ok?: boolean; job_id?: string; error?: string }
    if (!started.ok || !startPayload.ok || !startPayload.job_id) return { status: 'UNAVAILABLE', summary: startPayload.error || 'Não foi possível iniciar o Browser QA.' }
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await sleep(750)
      const response = await runtimeFetch(`${AGENT_URL}/qa/jobs/${encodeURIComponent(startPayload.job_id)}`)
      const payload = await response.json() as BrowserQaJobPayload
      if (!response.ok || !payload.ok) return { status: 'UNAVAILABLE', summary: payload.error || 'Browser QA indisponível.' }
      if (payload.status === 'failed') return { status: 'UNAVAILABLE', summary: payload.error || 'Browser QA falhou.' }
      if (payload.status === 'completed') return payload.result ?? { status: payload.outcome ?? 'UNKNOWN', summary: 'QA concluído sem relatório detalhado.' }
      if (payload.status === 'cancelled') return { status: 'UNKNOWN', summary: 'Browser QA cancelado.' }
    }
    return { status: 'UNKNOWN', summary: 'Browser QA excedeu o limite de acompanhamento da interface.' }
  } catch (error) {
    return { status: 'UNAVAILABLE', summary: error instanceof Error ? error.message : 'Não foi possível conectar ao Browser QA.' }
  }
}

export async function runCrmBrowserQa(objective: string, mode: 'observe' | 'sandbox' = 'observe'): Promise<BrowserQaResult> {
  return runBrowserQaJob('crm', window.location.origin + '/', objective, mode)
}

export type ProgramStatus = 'ready' | 'running' | 'needs_context' | 'waiting_mission' | 'awaiting_acceptance' | 'awaiting_checkpoint' | 'paused' | 'needs_user' | 'completed' | 'failed' | 'cancelled'
export interface AutonomousProgramStage {
  id: string
  order: number
  title: string
  objective: string
  priority: 'low' | 'normal' | 'high' | 'critical'
  failure_policy: 'stop' | 'continue'
  dependsOn: string[]
  acceptanceCriteria: string[]
  status: string
  summary?: string
  acceptanceNote?: string
  missionId?: string | null
  attempts?: number
}
export interface AutonomousProgram {
  id: string
  title: string
  objective: string
  summary: string
  status: ProgramStatus
  currentStageId: string | null
  progress: { completed: number; accepted: number; total: number; warnings: number; percent: number }
  currentStage: AutonomousProgramStage | null
  stages: AutonomousProgramStage[]
  requestedProduct: 'crm' | 'blue_ocean' | null
  currentMission: AutonomousMission | null
  replans: number
  error?: string
}

const readProgramPayload = async (response: Response): Promise<AutonomousProgram> => {
  const payload = await response.json() as { ok?: boolean; program?: AutonomousProgram; error?: string }
  if (!response.ok || !payload.ok || !payload.program) throw new Error(payload.error || `Program Runtime respondeu HTTP ${response.status}.`)
  return payload.program
}

const driveCrmProgram = async (program: AutonomousProgram, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousProgram> => {
  let current = program
  for (let attempt = 0; attempt < 720; attempt += 1) {
    if (!['ready','running','needs_context','waiting_mission'].includes(current.status)) return current
    if (current.requestedProduct && current.requestedProduct !== 'crm') return current
    if (current.status === 'waiting_mission') await sleep(1000)
    const response = await runtimeFetch(`${AGENT_URL}/programs/${encodeURIComponent(current.id)}/advance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: 'crm', context: compactContext(snapshot, context), allowed_tools: CRM_ALLOWED_TOOLS }),
    })
    current = await readProgramPayload(response)
  }
  return current
}

export async function startCrmProgram(objective: string, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousProgram> {
  const response = await runtimeFetch(`${AGENT_URL}/programs/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objective }) })
  return driveCrmProgram(await readProgramPayload(response), snapshot, context)
}

export async function continueCrmProgram(program: AutonomousProgram, snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousProgram> {
  return driveCrmProgram(program, snapshot, context)
}

export async function getActiveCrmProgram(snapshot: WorkspaceSnapshot, context: AssistantContext = {}): Promise<AutonomousProgram | null> {
  try {
    const response = await runtimeFetch(`${AGENT_URL}/programs`)
    const payload = await response.json() as { ok?: boolean; programs?: AutonomousProgram[] }
    if (!response.ok || !payload.ok) return null
    const program = (payload.programs ?? []).find((item) => ['ready','running','needs_context','waiting_mission','awaiting_acceptance','awaiting_checkpoint','paused','needs_user'].includes(item.status) && (!item.requestedProduct || item.requestedProduct === 'crm')) ?? null
    if (!program) return null
    return ['ready','running','needs_context','waiting_mission'].includes(program.status) ? driveCrmProgram(program, snapshot, context) : program
  } catch { return null }
}

