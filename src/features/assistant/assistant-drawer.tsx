// legacy compatibility markers: http://127.0.0.1:8791/control · http://127.0.0.1:4173/
import { env } from '../../lib/env'
/* V1.10 Identity & Team Governance regression marker */
/* V0.9 Autonomous Programs compatibility marker */
import '../../styles/realtalent-assistant-v10067.css'
import '../../styles/realtalent-agent-v41-tools.css'
import { AlertTriangle, ArrowRight, Bot, BrainCircuit, CheckCircle2, Clipboard, Clock3, Database, ExternalLink, LoaderCircle, Maximize2, MessageSquareText, Minimize2, MonitorCheck, Play, ShieldCheck, Sparkles, Target, Wrench, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppActions, useAppNavigation, useAppUi, useAppWorkspace } from '../../app/app-context'
import { Button } from '../../components/ui/button'
import { assistantSupportedPrompts, type AssistantAnswer, type AssistantExecutionPlan, type AssistantResultItem } from '../../services/realtalent-assistant'
import { realTalentAiGateway, type RealTalentAiGatewayResult } from '../../services/realtalent-ai-gateway'
import { resolveAssistantRecommendationContinuation } from '../../services/realtalent-assistant-continuation'
import { formatCurrency } from '../../domain/formatters'
import type { AppRoute } from '../../domain/types'
import { copyTextToClipboard } from '../../lib/browser-actions'
import { createId } from '../../lib/id'
import { deleteTask, loadWorkManagement, saveTask, updateTaskStatus } from '../../services/work-management'
import { calculateProposalTotals, createProposalLineFromProduct } from '../../services/proposal-pricing'
import { detectFastActionIntent } from '../../services/realtalent-fast-actions'
import { appendAgendaMetadata } from '../../services/agenda-workspace'
import { executeCrmCapabilityStep, undoCrmAgentOperation } from '../../services/realtalent-crm-universal-executor'
import { continuationPrompt, type CrmPendingCapability } from '../../services/realtalent-crm-slot-filling'
import { lastUndoableCrmAgentTransaction, markCrmAgentTransactionUndone, recordCrmAgentTransaction, type CrmAgentUndoOperation } from '../../services/realtalent-crm-agent-transactions'
import { executionTruthSlicesForCapability, executionTruthSlicesForPlan, executionTruthSlicesForUndoOperations, receiptLabel, receiptStatusFromEvidence, recordCrmExecutionReceipt, verifyCrmCapabilityExecution, verifyCrmUndoExecution, type CrmExecutionStepEvidence } from '../../services/realtalent-crm-execution-truth'
import { usePreferences } from '../settings/preferences-context'
import { useExperience } from '../experience/experience-context'
import { startsNewRequestWhilePending } from '../../services/realtalent-agent-v4-intent'
import { appendAgentConversationTurn, formatAgentConversationContext, parseAgentConversationTurns, type AgentConversationTurn } from '../../services/realtalent-agent-v4-conversation'
import { approveCrmWorkflowStep, cancelCrmWorkflow, completeCrmWorkflowStep, continueCrmMission, continueCrmProgram, continueCrmWorkflow, getActiveCrmMission, getActiveCrmProgram, getActiveCrmWorkflow, planFromAction, resumeCrmWorkflow, runCrmBrowserQa, runUnifiedBrowserQa, runUnifiedBuilder, startCrmMission, startCrmProgram, startCrmWorkflow, syncAgentWorkspaceIdentity, syncCrmAppContext, type AutonomousMission, type AutonomousProgram, type AutonomousWorkflow, type BrowserQaResult } from '../../services/realtalent-agent-client'

interface AssistantDrawerProps { open: boolean; onClose(): void; initialPrompt?: string }

const EMBEDDED_SESSION_KEY = 'realtalent:crm:embedded-agent:v34'
const EMBEDDED_EXPANDED_KEY = 'realtalent:crm:embedded-agent:expanded:v313'

const routeLabels: Record<AppRoute, string> = {
  dashboard: 'Meu Dia', leads: 'Contatos', 'commercial-map': 'Mapa comercial', pipeline: 'Pipeline', tasks: 'Tarefas', teams: 'Equipes',
  followups: 'Follow-ups', calls: 'Ligações', communications: 'Comunicações', proposals: 'Propostas', agenda: 'Agenda', playbooks: 'Roteiro Comercial',
  goals: 'Metas', automations: 'Automações', metrics: 'Inteligência de Receita', prospecting: 'Garimpo', settings: 'Configurações',
}

const routePrompts: Partial<Record<AppRoute, string[]>> = {
  dashboard: ['Organize meu dia', 'Limpe minhas notificações', 'Quem devo ligar agora?', 'Quais negócios estão em risco?', 'Quais tarefas estão atrasadas?', 'Qual é o forecast RealTalent?'],
  leads: ['Quais contatos estão sem follow-up há mais de 7 dias?', 'Me traga os melhores contatos', 'Quem devo ligar agora?', 'Quais contatos estão sem responsável?', 'Quais contatos têm oportunidade aberta?', 'Quais contatos precisam de atenção?', 'Resuma minha carteira de contatos'],
  pipeline: ['Quais oportunidades estão em risco?', 'Quais negócios estão parados há mais de 7 dias?', 'Qual é o forecast RealTalent?', 'Quais negócios estão sem decisor?', 'Mostre propostas sem resposta', 'O que devo priorizar no pipeline?'],
  tasks: ['Quais tarefas estão vencidas?', 'Quais tarefas vencem hoje?', 'O que devo concluir primeiro?', 'Quais tarefas estão ligadas a negócios em risco?', 'Resuma minhas tarefas', 'Prepare meu dia'],
  followups: ['Quais follow-ups estão atrasados?', 'Quem precisa de follow-up hoje?', 'Quais negócios estão sem acompanhamento?', 'Quem devo contatar primeiro?', 'Mostre follow-ups ligados a oportunidades em risco', 'Prepare meu dia'],
  agenda: ['O que tenho hoje?', 'Quais reuniões precisam de preparação?', 'Quais compromissos estão ligados a oportunidades?', 'Prepare meu dia', 'Quem devo contatar depois das reuniões?', 'Resuma minha agenda'],
  proposals: ['Mostre propostas sem resposta', 'Quais propostas precisam de follow-up?', 'Quais propostas estão próximas do vencimento?', 'Quais propostas têm maior valor?', 'Quais negócios estão em risco?', 'Resuma minhas propostas'],
  calls: ['Quem devo ligar agora?', 'Prepare minha próxima ligação', 'Quais contatos estão sem retorno?', 'Quais ligações devo priorizar?', 'Mostre negócios em risco para ligar', 'Prepare meu dia'],
  communications: ['Quais clientes estão aguardando resposta?', 'Resuma as conversas prioritárias', 'Quem precisa de retorno hoje?', 'Quais conversas estão ligadas a negócios em risco?', 'Prepare um follow-up', 'O que devo responder primeiro?'],
}

const uniqueLeadIds = (answer: AssistantAnswer | null) => answer ? [...new Set(answer.items.map((item) => item.leadId).filter(Boolean))] : []

const assistantIntentLabel: Partial<Record<AssistantAnswer['intent'], string>> = {
  create_task: 'Ação segura', create_followups: 'Ação segura', complete_task: 'Ação segura',
  priorities: 'Prioridades', best_contacts: 'Contatos prioritários', risk_deals: 'Pipeline', call_now: 'Próximas ligações', proposal_followup: 'Propostas',
  missing_decision_maker: 'Pipeline', stale_deals: 'Pipeline', forecast: 'Forecast', lead_summary: 'Resumo',
  prepare_call: 'Preparação', next_action: 'Próxima ação', activity_summary: 'Histórico', suggest_message: 'Mensagem',
  meeting_summary: 'Reunião', crm_capability: 'Ação no CRM', help: 'Ajuda', unknown: 'RealTalent',
}

export function AssistantDrawer({ open, onClose, initialPrompt = '' }: AssistantDrawerProps) {
  const { snapshot, currentWorkspace, canWrite, repositoryMode, currentUserId, teamAccess, canTeamAccess, canTeamAccessRecord } = useAppWorkspace()
  const { route, routeContext, navigate } = useAppNavigation()
  const { notify, confirmAction } = useAppUi()
  const actions = useAppActions()
  const { createActivities, moveLead, updateLead, createGoal, createProposal, createCalendarEvent, listWorkspaceMembers } = actions
  const { preferences: crmPreferences } = usePreferences()
  const { preferences: experiencePreferences } = useExperience()
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null)
  const [previousLeadIds, setPreviousLeadIds] = useState<string[]>([])
  const [executing, setExecuting] = useState(false)
  const [executedPlanId, setExecutedPlanId] = useState<string | null>(null)
  const [aiTrace, setAiTrace] = useState<RealTalentAiGatewayResult | null>(null)
  const [qaRunning, setQaRunning] = useState(false)
  const [savingScript, setSavingScript] = useState(false)
  const [sending, setSending] = useState(false)
  const [lastUserPrompt, setLastUserPrompt] = useState('')
  const [conversationTurns, setConversationTurns] = useState<AgentConversationTurn[]>([])
  const [pendingAction, setPendingAction] = useState<{ kind: 'create_task' | 'create_followups' | 'complete_task'; seed: string } | null>(null)
  const [pendingCapability, setPendingCapability] = useState<CrmPendingCapability | null>(null)
  const [qaResult, setQaResult] = useState<BrowserQaResult | null>(null)
  const [program, setProgram] = useState<AutonomousProgram | null>(null)
  const [mission, setMission] = useState<AutonomousMission | null>(null)
  const [workflow, setWorkflow] = useState<AutonomousWorkflow | null>(null)
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [expanded, setExpanded] = useState(() => {
    try { return window.localStorage.getItem(EMBEDDED_EXPANDED_KEY) === '1' } catch { return false }
  })
  const [sessionRestored, setSessionRestored] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const workspaceLabel = currentWorkspace?.name ?? snapshot?.workspace.name ?? 'workspace'
  const technicalMode = useMemo(() => { try { return new URLSearchParams(window.location.search).get('agentDebug') === '1' } catch { return false } }, [])
  const sessionKey = `${EMBEDDED_SESSION_KEY}:${currentWorkspace?.id ?? snapshot?.workspace.id ?? 'unknown'}`

  useEffect(() => { if (open && initialPrompt) setQuery(initialPrompt) }, [initialPrompt, open])

  useEffect(() => {
    setSessionRestored(false)
    setAnswer(null)
    setPreviousLeadIds([])
    setLastUserPrompt('')
    setConversationTurns([])
    setPendingAction(null)
    setPendingCapability(null)
  }, [sessionKey])

  useEffect(() => {
    if (!open || sessionRestored) return
    try {
      const saved = window.sessionStorage.getItem(sessionKey)
      if (saved) {
        const parsed = JSON.parse(saved) as { answer?: AssistantAnswer | null; previousLeadIds?: string[]; lastUserPrompt?: string; pendingAction?: { kind: 'create_task' | 'create_followups' | 'complete_task'; seed: string } | null; pendingCapability?: CrmPendingCapability | null; conversationTurns?: unknown }
        if (parsed.answer) setAnswer(parsed.answer)
        if (Array.isArray(parsed.previousLeadIds)) setPreviousLeadIds(parsed.previousLeadIds)
        if (typeof parsed.lastUserPrompt === 'string') setLastUserPrompt(parsed.lastUserPrompt)
        setConversationTurns(parseAgentConversationTurns(parsed.conversationTurns))
        if (parsed.pendingAction?.kind && typeof parsed.pendingAction.seed === 'string') setPendingAction(parsed.pendingAction)
        if (parsed.pendingCapability?.capabilityId && typeof parsed.pendingCapability.seed === 'string') setPendingCapability(parsed.pendingCapability)
      }
    } catch { /* sessão inválida não bloqueia o CRM */ }
    setSessionRestored(true)
  }, [open, sessionKey, sessionRestored])

  useEffect(() => {
    if (!sessionRestored) return
    try { window.sessionStorage.setItem(sessionKey, JSON.stringify({ answer, previousLeadIds, lastUserPrompt, conversationTurns, pendingAction, pendingCapability })) } catch { /* storage indisponível */ }
  }, [answer, previousLeadIds, lastUserPrompt, conversationTurns, pendingAction, pendingCapability, sessionKey, sessionRestored])

  useEffect(() => {
    try { window.localStorage.setItem(EMBEDDED_EXPANDED_KEY, expanded ? '1' : '0') } catch { /* storage indisponível */ }
  }, [expanded])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.body.classList.contains('modal-open')) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])


  useEffect(() => {
    if (!open || !snapshot || !currentWorkspace) return
    let cancelled = false
    const syncReadContext = async () => {
      const canReadContacts = canTeamAccess('view', 'contacts')
      const canReadPipeline = canTeamAccess('view', 'pipeline')
      const canReadTasks = canTeamAccess('view', 'tasks')
      const allowedContactLeads = new Set(snapshot.leads.filter((lead) => canReadContacts && canTeamAccessRecord('contacts', lead.ownerId, null)).map((lead) => lead.id))
      const allowedPipelineLeads = new Set(snapshot.leads.filter((lead) => canReadPipeline && canTeamAccessRecord('pipeline', lead.ownerId, null)).map((lead) => lead.id))
      const allowedLeadIds = [...new Set([...allowedContactLeads, ...allowedPipelineLeads])]
      const allowedOpportunityIds = snapshot.opportunities.filter((item) => canReadPipeline && canTeamAccessRecord('pipeline', item.ownerId, null)).map((item) => item.id)
      const allowedContactIds = snapshot.contacts.filter((item) => canReadContacts && canTeamAccessRecord('contacts', item.relationshipOwnerId ?? null, null) && (!item.leadIds.length || item.leadIds.some((id) => allowedContactLeads.has(id)))).map((item) => item.id)
      const allowedActivityIds = snapshot.activities.filter((item) => canReadTasks && canTeamAccessRecord('tasks', item.assignedTo, null) && (!item.leadId || allowedLeadIds.includes(item.leadId))).map((item) => item.id)
      const allowedEventIds = snapshot.events.filter((item) => canReadTasks && canTeamAccessRecord('tasks', item.assignedTo, null) && (!item.leadId || allowedLeadIds.includes(item.leadId))).map((item) => item.id)
      const workManagement = await loadWorkManagement(repositoryMode, currentWorkspace.id).catch(() => ({ teams: [], memberships: [], tasks: [], relations: [], checklistItems: [], comments: [] }))
      if (cancelled) return
      const visibleTasks = workManagement.tasks.filter((task) => canReadTasks && canTeamAccessRecord('tasks', task.assigneeId, task.teamId))
      const taskIds = new Set(visibleTasks.map((task) => task.id))
      const context = { focusLeadId: routeContext.leadId, focusProposalId: routeContext.proposalId, currentRoute: route }
      await syncCrmAppContext(snapshot, context, {
        workManagement: { ...workManagement, tasks: visibleTasks, relations: workManagement.relations.filter((item) => taskIds.has(item.taskId)), checklistItems: workManagement.checklistItems.filter((item) => taskIds.has(item.taskId)), comments: workManagement.comments.filter((item) => taskIds.has(item.taskId)) },
        readScope: {
          resources: { contacts: canReadContacts, pipeline: canReadPipeline, tasks: canReadTasks },
          leadIds: allowedLeadIds,
          opportunityIds: allowedOpportunityIds,
          contactIds: allowedContactIds,
          activityIds: allowedActivityIds,
          eventIds: allowedEventIds,
          fieldAccess: {
            contactPhone: teamAccess?.profile.fieldAccess.contact_phone !== 'hidden',
            contactEmail: teamAccess?.profile.fieldAccess.contact_email !== 'hidden',
            dealValue: teamAccess?.profile.fieldAccess.deal_value !== 'hidden',
          },
        },
      })
    }
    void syncReadContext().catch(() => null)
    return () => { cancelled = true }
  }, [open, snapshot, currentWorkspace, repositoryMode, route, routeContext.leadId, routeContext.proposalId, canTeamAccess, canTeamAccessRecord, teamAccess])

  useEffect(() => {
    if (!open || !currentWorkspace || !currentUserId || !teamAccess) return
    const sync = () => syncAgentWorkspaceIdentity({
      source: 'crm',
      workspace: { id: currentWorkspace.id, name: currentWorkspace.name, role: currentWorkspace.role },
      user: { id: currentUserId },
      access: {
        profileId: teamAccess.profile.id,
        systemKey: teamAccess.profile.systemKey,
        profileName: teamAccess.profile.name,
        teamIds: teamAccess.teamIds,
        teamRole: teamAccess.profile.systemKey === 'manager' ? 'leader' : 'member',
        rules: teamAccess.profile.rules.map((rule) => ({ resource: rule.resource, scope: rule.scope, actions: [...rule.actions] })),
      },
    }).catch(() => null)
    void sync()
    const timer = window.setInterval(() => { void sync() }, 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [open, currentWorkspace, currentUserId, teamAccess])


  useEffect(() => {
    if (!open || !snapshot || program || mission || workflow) return
    const ctx = { previousLeadIds: contextLeadIds, focusLeadId: routeFocusLead?.id, focusProposalId: routeContext.proposalId, currentRoute: route }
    void getActiveCrmProgram(snapshot, ctx).then((activeProgram) => {
      if (activeProgram) {
        setProgram(activeProgram)
        if (activeProgram.currentMission) { setMission(activeProgram.currentMission); if (activeProgram.currentMission.currentWorkflow) setWorkflow(activeProgram.currentMission.currentWorkflow) }
        return
      }
      void getActiveCrmMission(snapshot, ctx).then((activeMission) => {
        if (activeMission) { setMission(activeMission); if (activeMission.currentWorkflow) setWorkflow(activeMission.currentWorkflow); return }
        void getActiveCrmWorkflow(snapshot, ctx).then((active) => { if (active) setWorkflow(active) })
      })
    })
  // Reattach somente na abertura; missão/workflow ativos passam a ser dirigidos pelos handlers locais.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const routeFocusLead = useMemo(() => {
    if (!snapshot) return null
    if (routeContext.leadId) return snapshot.leads.find((lead) => lead.id === routeContext.leadId) ?? null
    if (routeContext.proposalId) {
      const proposal = snapshot.proposals.find((item) => item.id === routeContext.proposalId)
      return proposal ? snapshot.leads.find((lead) => lead.id === proposal.leadId) ?? null : null
    }
    return null
  }, [routeContext.leadId, routeContext.proposalId, snapshot])

  const contextLeadIds = useMemo(() => {
    if (routeFocusLead) return [routeFocusLead.id]
    if (answer?.items.length) return uniqueLeadIds(answer)
    if (previousLeadIds.length) return previousLeadIds
    return []
  }, [answer, previousLeadIds, routeFocusLead])

  const contextualPrompts = routeFocusLead
    ? ['Resuma o histórico desta conta', 'Prepare a ligação', 'Qual a próxima ação?', 'Sugira uma mensagem']
    : routePrompts[route] ?? assistantSupportedPrompts

  const routeLabel = routeLabels[route]
  const contextDescription = routeFocusLead
    ? `${routeLabel} · ${routeFocusLead.company || routeFocusLead.name}`
    : `${routeLabel} · contexto conectado`

  const submit = async (value = query) => {
    const userPrompt = value.trim()
    if (!userPrompt || !snapshot || sending) return
    const normalizedPrompt = userPrompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    if (pendingCapability && /^(cancelar?|cancela|esquece|deixa pra la|deixa para la|nao quero|pare)$/.test(normalizedPrompt)) {
      setPendingCapability(null)
      setPendingAction(null)
      setLastUserPrompt(userPrompt)
      setQuery('')
      setAnswer({
        id: `assistant-pending-cancel:${Date.now()}`, intent: 'crm_capability', title: 'Ação pendente cancelada',
        text: 'Cancelei a ação que estava aguardando informação. Nenhuma alteração foi feita no CRM.',
        items: [], facts: [], suggestedPrompts: contextualPrompts, pendingCapability: null, generatedAt: new Date().toISOString(),
      })
      window.setTimeout(() => inputRef.current?.focus(), 0)
      return
    }
    const directAction = detectFastActionIntent(userPrompt)
    const switchesRequest = Boolean(pendingCapability && startsNewRequestWhilePending(userPrompt))
    const recommendationContinuation = !pendingCapability && !pendingAction && !directAction
      ? resolveAssistantRecommendationContinuation(userPrompt, answer)
      : null
    const effectivePrompt = pendingCapability && !directAction && !switchesRequest
      ? continuationPrompt(pendingCapability, userPrompt)
      : pendingAction && !directAction ? `${pendingAction.seed} ${userPrompt}` : recommendationContinuation ?? userPrompt
    const actionIntent = directAction ?? (switchesRequest ? null : pendingAction?.kind) ?? null
    setLastUserPrompt(userPrompt)
    setQuery('')
    setSending(true)
    setExecutedPlanId(null)
    setQaResult(null)
    try {
      let workTasks: Array<{ id: string; title: string; status: string; dueAt?: string | null; assigneeId?: string | null; teamId?: string | null }> | undefined
      if (actionIntent === 'complete_task' && currentWorkspace) {
        const work = await loadWorkManagement(repositoryMode, currentWorkspace.id)
        const visibleTasks = canTeamAccess('view', 'tasks')
          ? work.tasks.filter((task) => canTeamAccessRecord('tasks', task.assigneeId, task.teamId))
          : []
        workTasks = visibleTasks.map((task) => ({ id: task.id, title: task.title, status: task.status, dueAt: task.dueAt, assigneeId: task.assigneeId, teamId: task.teamId }))
      }
      const workspaceMembers = actionIntent === 'create_task' ? await listWorkspaceMembers().catch(() => []) : undefined
      const gatewayResult = await realTalentAiGateway.answer(effectivePrompt, snapshot, {
        previousLeadIds: contextLeadIds,
        focusLeadId: routeFocusLead?.id,
        focusProposalId: routeContext.proposalId,
        currentRoute: route,
        workTasks,
        workspaceMembers,
        currentUserId,
        conversationContext: [formatAgentConversationContext(conversationTurns, lastUserPrompt, answer ? `${answer.title}. ${answer.text}` : ''), pendingCapability ? `Ação pendente: ${pendingCapability.capabilityId}; faltando: ${pendingCapability.missingSlots.join(', ')}` : ''].filter(Boolean).join('\n').slice(0, 4000),
        pendingCapability: directAction || switchesRequest ? null : pendingCapability,
        loadWorkspaceMembers: async () => listWorkspaceMembers().catch(() => []),
        loadWorkTasks: async () => {
          if (!currentWorkspace) return []
          const work = await loadWorkManagement(repositoryMode, currentWorkspace.id)
          return (canTeamAccess('view', 'tasks') ? work.tasks.filter((task) => canTeamAccessRecord('tasks', task.assigneeId, task.teamId)) : [])
            .map((task) => ({ id: task.id, title: task.title, status: task.status, dueAt: task.dueAt, assigneeId: task.assigneeId, teamId: task.teamId }))
        },
      })
      const rawResult = gatewayResult.answer
      const normalizedText = rawResult.text.trim().toLocaleLowerCase('pt-BR')
      const facts = rawResult.facts.filter((fact, index, all) => {
        const clean = fact.trim().toLocaleLowerCase('pt-BR')
        return clean && !normalizedText.includes(clean) && all.findIndex((item) => item.trim().toLocaleLowerCase('pt-BR') === clean) === index
      })
      const result = { ...rawResult, facts }
      setAiTrace(gatewayResult)
      const resultLeadIds = uniqueLeadIds(result)
      if (resultLeadIds.length && result.intent !== 'create_followups') setPreviousLeadIds(resultLeadIds)
      if (result.pendingCapability) {
        setPendingCapability(result.pendingCapability)
        setPendingAction(null)
      } else {
        setPendingCapability(null)
        if (['create_task', 'create_followups', 'complete_task'].includes(result.intent) && !result.plan) {
          setPendingAction({ kind: result.intent as 'create_task' | 'create_followups' | 'complete_task', seed: effectivePrompt })
        } else {
          setPendingAction(null)
        }
      }
      setAnswer(result)
      setConversationTurns((history) => appendAgentConversationTurn(history, userPrompt, `${result.title}. ${result.text}`))
      if (result.plan?.kind === 'crm_capabilities' && result.plan.steps.length && result.plan.steps.every((step) => step.risk === 'read')) {
        window.setTimeout(() => void executePlan(result.plan!), 0)
      }
    } catch (error) {
      setAnswer({
        id: `assistant-error:${Date.now()}`, intent: 'unknown', title: 'Não consegui concluir agora',
        text: 'A conexão com a Agent falhou nesta tentativa. Seu pedido não foi perdido; tente enviar novamente.',
        items: [], facts: [], suggestedPrompts: [], generatedAt: new Date().toISOString(),
      })
      notify('error', error instanceof Error ? error.message : 'Falha ao consultar a RealTalent Agent.')
    } finally {
      setSending(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const explainCurrentScreen = () => void submit(`Explique esta tela do CRM (${routeLabel}). Contexto de navegação: ${window.location.pathname}${window.location.hash}; rota lógica: ${route}. Mostre os componentes principais, os dados relevantes, as dependências relacionadas e o que você consegue consultar aqui sem sair do CRM.`)

  const openItem = (item: AssistantResultItem) => {
    if (item.route === 'calls') navigate('calls', { leadId: item.leadId, action: 'start-call' })
    else if (item.route === 'proposals') navigate('proposals', item.proposalId ? { proposalId: item.proposalId } : { leadId: item.leadId, action: 'follow-proposal' })
    else if (item.route === 'pipeline') navigate('pipeline', { leadId: item.leadId, action: 'deal-inspector' })
    else if (item.route === 'agenda') navigate('agenda', { leadId: item.leadId, action: 'create-meeting' })
    else if (item.route === 'communications') navigate('communications', { leadId: item.leadId })
    else navigate('leads', { leadId: item.leadId, ...(item.action === 'map_stakeholder' ? { action: 'account360' } : {}) })
  }

  async function executePlan(plan: AssistantExecutionPlan): Promise<boolean> {
    if (!snapshot || !currentWorkspace || executing) return false

    if (plan.kind === 'crm_capabilities') {
      if (!plan.steps.length) { notify('info', 'O plano não contém nenhuma ação executável.'); return false }
      const writeSteps = plan.steps.filter((step) => step.risk !== 'read')
      if (writeSteps.length && !canWrite) { notify('error', 'Seu perfil está em modo somente leitura e não pode executar esta alteração.'); return false }
      const maxRisk = plan.steps.some((step) => step.risk === 'high') ? 'high'
        : plan.steps.some((step) => step.risk === 'medium') ? 'medium'
        : plan.steps.some((step) => step.risk === 'low') ? 'low' : 'read'
      if (writeSteps.length && maxRisk === 'high') {
        const confirmed = await confirmAction({
          title: plan.title,
          description: `${plan.description}

A Agent executará ${plan.steps.length} etapa(s) usando apenas capacidades nativas liberadas para o seu perfil.`,
          confirmLabel: 'Confirmar ação crítica',
          tone: 'danger',
          details: plan.preview,
        })
        if (!confirmed) return false
      }
      setExecuting(true)
      setQaResult(null)
      const runtime = {
        workspaceId: currentWorkspace.id,
        currentUserId,
        snapshot,
        repositoryMode,
        teamAccess,
        actions,
        navigate,
        canTeamAccess,
        canTeamAccessRecord,
        notificationPreferences: experiencePreferences.notifications,
        staleLeadDays: crmPreferences.commercial.staleLeadDays,
      }
      try {
        const undoStep = plan.steps.find((step) => step.capabilityId === 'agent.undo_last')
        if (undoStep) {
          if (plan.steps.length !== 1) throw new Error('Desfazer deve ser executado como uma ação isolada para preservar a consistência.')
          const transaction = lastUndoableCrmAgentTransaction(currentWorkspace.id)
          if (!transaction) { notify('info', 'Não há uma ação recente da Agent disponível para desfazer.'); return false }
          const undoStartedAt = new Date().toISOString()
          const failures: string[] = []
          for (const operation of [...transaction.operations].reverse()) {
            try { await undoCrmAgentOperation(operation, runtime) }
            catch (error) { failures.push(error instanceof Error ? error.message : String(error)) }
          }
          if (failures.length) {
            recordCrmExecutionReceipt({
              id: `exec:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, workspaceId: currentWorkspace.id, planId: plan.id,
              goal: `Desfazer: ${transaction.goal}`, repositoryMode, startedAt: undoStartedAt, completedAt: new Date().toISOString(),
              status: 'failed', uiRefresh: 'failed', steps: [], failure: failures[0],
            })
            throw new Error(`Não consegui desfazer tudo com segurança: ${failures[0]}`)
          }
          const undoSlices = executionTruthSlicesForUndoOperations(transaction.operations)
          const undoSnapshot = undoSlices.length ? await actions.refreshAgentExecutionState(undoSlices) : snapshot
          const undoEvidence: CrmExecutionStepEvidence[] = []
          for (const operation of transaction.operations) undoEvidence.push(await verifyCrmUndoExecution(operation, undoSnapshot, { workspaceId: currentWorkspace.id, repositoryMode, uiRefreshConfirmed: true }))
          const undoReceipt = recordCrmExecutionReceipt({
            id: `exec:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, workspaceId: currentWorkspace.id, planId: plan.id,
            goal: `Desfazer: ${transaction.goal}`, repositoryMode, startedAt: undoStartedAt, completedAt: new Date().toISOString(),
            status: receiptStatusFromEvidence(undoEvidence), uiRefresh: undoSlices.length ? 'confirmed' : 'not_required', steps: undoEvidence,
          })
          markCrmAgentTransactionUndone(currentWorkspace.id, transaction.id)
          setExecutedPlanId(plan.id)
          const undoVerified = undoReceipt.status === 'verified'
          setAnswer((current) => current?.plan?.id === plan.id ? {
            ...current,
            title: undoVerified ? 'Ação desfeita e verificada' : 'Ação desfeita com verificação parcial',
            text: undoVerified ? `Desfiz e reli o estado restaurado: ${transaction.goal}` : `Desfiz: ${transaction.goal}. Parte do estado não possui readback independente suficiente para declarar verificação total.`,
            facts: [`Recibo de execução: ${undoReceipt.id}`, ...undoEvidence.map((item) => `${item.status === 'verified' ? '✓' : '△'} ${item.title}`)],
          } : current)
          notify(undoVerified ? 'success' : 'warning', undoVerified ? 'A última ação reversível foi desfeita e verificada.' : 'A ação foi desfeita, mas a verificação ficou parcial.')
          return true
        }

        const summaries: string[] = []
        const undoOperations: CrmAgentUndoOperation[] = []
        const executionEvidence: CrmExecutionStepEvidence[] = []
        const startedAt = new Date().toISOString()
        const planTruthSlices = executionTruthSlicesForPlan(plan.steps)
        let truthSnapshot = writeSteps.length && planTruthSlices.length ? await actions.refreshAgentExecutionState(planTruthSlices) : snapshot
        let uiRefreshConfirmed = writeSteps.length === 0
        let rollbackAttempted = false
        let rollbackFailures: string[] = []
        for (const step of plan.steps) {
          const beforeStep = truthSnapshot
          try {
            const result = await executeCrmCapabilityStep(step, { ...runtime, snapshot: beforeStep })
            if (result.summary) summaries.push(result.summary)
            if (result.undo) undoOperations.push(result.undo)
            if (step.risk !== 'read') {
              const stepTruthSlices = executionTruthSlicesForCapability(step.capabilityId)
              truthSnapshot = stepTruthSlices.length ? await actions.refreshAgentExecutionState(stepTruthSlices) : truthSnapshot
              uiRefreshConfirmed = true
            }
            const evidence = await verifyCrmCapabilityExecution(step, result, beforeStep, truthSnapshot, {
              workspaceId: currentWorkspace.id,
              repositoryMode,
              uiRefreshConfirmed: step.risk === 'read' ? true : uiRefreshConfirmed,
            })
            executionEvidence.push(evidence)
          } catch (error) {
            rollbackAttempted = undoOperations.length > 0
            rollbackFailures = []
            for (const operation of [...undoOperations].reverse()) {
              try { await undoCrmAgentOperation(operation, { ...runtime, snapshot: truthSnapshot }) }
              catch (rollbackError) { rollbackFailures.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError)) }
            }
            try { truthSnapshot = planTruthSlices.length ? await actions.refreshAgentExecutionState(planTruthSlices) : truthSnapshot; uiRefreshConfirmed = true } catch { uiRefreshConfirmed = false }
            const cause = error instanceof Error ? error.message : 'Falha ao executar uma etapa do plano.'
            recordCrmExecutionReceipt({
              id: `exec:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
              workspaceId: currentWorkspace.id,
              planId: plan.id,
              goal: plan.goal || plan.title,
              repositoryMode,
              startedAt,
              completedAt: new Date().toISOString(),
              status: rollbackAttempted && !rollbackFailures.length ? 'rolled_back' : 'failed',
              uiRefresh: uiRefreshConfirmed ? 'confirmed' : 'failed',
              steps: executionEvidence,
              rollback: { attempted: rollbackAttempted, complete: rollbackAttempted && !rollbackFailures.length, failures: rollbackFailures },
              failure: cause,
            })
            throw new Error(rollbackFailures.length ? `${cause} A reversão automática ficou incompleta: ${rollbackFailures[0]}` : `${cause}${rollbackAttempted ? ' As etapas anteriores foram revertidas.' : ''}`)
          }
        }
        if (undoOperations.length) recordCrmAgentTransaction(currentWorkspace.id, plan.goal || plan.title, undoOperations)
        const receiptStatus = receiptStatusFromEvidence(executionEvidence)
        const receipt = recordCrmExecutionReceipt({
          id: `exec:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          workspaceId: currentWorkspace.id,
          planId: plan.id,
          goal: plan.goal || plan.title,
          repositoryMode,
          startedAt,
          completedAt: new Date().toISOString(),
          status: receiptStatus,
          uiRefresh: writeSteps.length ? (uiRefreshConfirmed ? 'confirmed' : 'failed') : 'not_required',
          steps: executionEvidence,
        })
        const verified = receipt.status === 'verified'
        const evidenceFacts = executionEvidence.map((item) => `${item.status === 'verified' || item.status === 'read' ? '✓' : '△'} ${item.title}: ${item.status === 'verified' ? 'persistência + readback confirmados' : item.status === 'read' ? 'consulta concluída' : 'executor confirmou, readback parcial'}`)
        setExecutedPlanId(plan.id)
        setAnswer((current) => current?.plan?.id === plan.id ? {
          ...current,
          title: receiptLabel(receipt),
          text: verified
            ? (summaries.join('\n') || 'A operação foi executada, relida no repositório e aplicada à interface do CRM.')
            : `${summaries.join('\n') || 'O executor nativo concluiu a operação.'}\n\nUma ou mais etapas ainda não possuem evidência suficiente de leitura posterior; não estou tratando isso como conclusão totalmente verificada.`,
          facts: [...summaries, `Recibo de execução: ${receipt.id}`, ...evidenceFacts],
        } : current)
        notify(verified ? 'success' : 'warning', verified ? (summaries[0] || 'Ação executada e verificada no CRM.') : 'Ação executada, mas a verificação ponta a ponta ficou parcial. Consulte o recibo.')
        return true
      } catch (error) {
        notify('error', error instanceof Error ? error.message : 'Não foi possível executar e verificar o plano no CRM.')
        return false
      } finally { setExecuting(false) }
    }

    if (plan.kind === 'run_program') {
      const confirmed = await confirmAction({ title: plan.title, description: `${plan.description}

O programa coordenará várias missões. Cada marco só libera dependências após aceite humano explícito.`, confirmLabel: 'Iniciar programa', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true); setWorkflowBusy(true); setQaResult(null)
      try {
        const nextProgram = await startCrmProgram(plan.objective, snapshot, { previousLeadIds: contextLeadIds, focusLeadId: routeFocusLead?.id, focusProposalId: routeContext.proposalId, currentRoute: route })
        setProgram(nextProgram); setMission(nextProgram.currentMission); setWorkflow(nextProgram.currentMission?.currentWorkflow ?? null); setExecutedPlanId(plan.id)
        const handoff = nextProgram.requestedProduct === 'blue_ocean' ? ' Abra o Blue Ocean para continuar a missão atual.' : nextProgram.status === 'awaiting_acceptance' ? ' Revise o marco no Control Center.' : ''
        notify(nextProgram.status === 'failed' ? 'error' : 'success', `Programa: ${nextProgram.status}.${handoff}`)
        return nextProgram.status !== 'failed'
      } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar o programa.'); return false }
      finally { setExecuting(false); setWorkflowBusy(false) }
    }
    if (plan.kind === 'run_mission') {
      const confirmed = await confirmAction({ title: plan.title, description: `${plan.description}\n\nA missão pode alternar entre CRM e Blue Ocean. ANALYZE/QA avançam automaticamente; ACT e Builder continuam exigindo seu checkpoint.`, confirmLabel: 'Iniciar missão', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true); setWorkflowBusy(true); setQaResult(null)
      try {
        const nextMission = await startCrmMission(plan.objective, snapshot, { previousLeadIds: contextLeadIds, focusLeadId: routeFocusLead?.id, focusProposalId: routeContext.proposalId, currentRoute: route })
        setMission(nextMission); setWorkflow(nextMission.currentWorkflow); setExecutedPlanId(plan.id)
        const handoff = nextMission.requestedProduct === 'blue_ocean' ? ' Abra o Blue Ocean para continuar o próximo bloco.' : ''
        notify(nextMission.status === 'failed' ? 'error' : 'success', `Missão: ${nextMission.status}.${handoff}`)
        return nextMission.status !== 'failed'
      } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar a missão.'); return false }
      finally { setExecuting(false); setWorkflowBusy(false) }
    }

    if (plan.kind === 'run_workflow') {
      if (plan.product !== 'crm') { notify('info', 'Abra o Blue Ocean para iniciar um workflow com contexto atual daquele produto.'); return false }
      const confirmed = await confirmAction({ title: plan.title, description: `${plan.description}\n\nO workflow pode executar ANALYZE/QA automaticamente e vai parar antes de qualquer ACT ou Builder.`, confirmLabel: 'Iniciar workflow', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true); setWorkflowBusy(true); setQaResult(null)
      try {
        const next = await startCrmWorkflow(plan.objective, snapshot, { previousLeadIds: contextLeadIds, focusLeadId: routeFocusLead?.id, focusProposalId: routeContext.proposalId, currentRoute: route })
        setWorkflow(next); setExecutedPlanId(plan.id)
        notify(next.status === 'failed' ? 'error' : 'success', next.status === 'awaiting_approval' ? 'Workflow iniciado e aguardando seu próximo checkpoint.' : `Workflow: ${next.status}.`)
        return next.status !== 'failed'
      } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível iniciar o workflow.'); return false }
      finally { setExecuting(false); setWorkflowBusy(false) }
    }

    if (plan.kind === 'run_qa') {
      setExecuting(true); setQaResult(null)
      try {
        const result = await runUnifiedBrowserQa(plan.product, plan.objective)
        setQaResult(result); setExecutedPlanId(plan.id)
        notify(result.status === 'PASS' ? 'success' : result.status === 'FAIL' ? 'error' : 'info', result.summary)
        return result.status === 'PASS'
      } finally { setExecuting(false) }
    }

    if (plan.kind === 'run_builder') {
      const confirmed = await confirmAction({ title: plan.title, description: `${plan.description}\n\nO Builder pode alterar arquivos em src/, mas cria backup, executa gates e faz rollback em falhas.`, confirmLabel: 'Executar Builder', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true); setQaResult(null)
      try {
        const result = await runUnifiedBuilder(plan.product, plan.objective)
        setQaResult(result); setExecutedPlanId(plan.id)
        notify(result.status === 'PASS' ? 'success' : result.status === 'FAIL' ? 'error' : 'info', result.summary)
        return result.status === 'PASS' || result.status === 'NEEDS_USER'
      } finally { setExecuting(false) }
    }

    if (!canWrite) return false

    if (plan.kind === 'move_opportunity') {
      const lead = snapshot.leads.find((item) => item.id === plan.leadId)
      const stage = snapshot.stages.find((item) => item.id === plan.stageId)
      if (!lead || !stage) { notify('error', 'O agente propôs uma oportunidade ou etapa que não existe mais.'); return false }
      const confirmed = await confirmAction({ title: plan.title, description: `${plan.description}\n\nMover ${lead.company || lead.name} para ${stage.name}?`, confirmLabel: 'Mover oportunidade', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true)
      try { await moveLead(lead.id, stage.id); setExecutedPlanId(plan.id); notify('success', `Oportunidade movida para ${stage.name}.`); return true }
      catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível mover a oportunidade.'); return false }
      finally { setExecuting(false) }
    }

    if (plan.kind === 'create_task') {
      const lead = plan.leadId ? snapshot.leads.find((item) => item.id === plan.leadId) ?? null : null
      const due = new Date(plan.dueAt)
      if (!Number.isFinite(due.getTime()) || (plan.leadId && !lead)) { notify('error', 'A tarefa preparada perdeu uma referência ou prazo válido.'); return false }
      const confirmed = await confirmAction({ title: plan.title, description: lead ? `${plan.description}\n\nCriar tarefa vinculada a ${lead.company || lead.name}?` : `${plan.description}\n\nCriar esta tarefa para você?`, confirmLabel: 'Confirmar tarefa', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true)
      try {
        const savedTask = await saveTask(repositoryMode, currentWorkspace.id, {
          title: plan.title, description: plan.description, status: 'todo', priority: plan.priority,
          startsAt: plan.syncToAgenda ? plan.dueAt : null, dueAt: plan.dueAt,
          assigneeId: plan.assigneeId ?? currentUserId ?? lead?.ownerId ?? null, assigneeName: plan.assigneeName, teamId: null, recurrence: 'none', tags: ['realtalent-agent'],
          relation: plan.contactId
            ? { entityType: 'contact', entityId: plan.contactId, entityLabel: plan.contactName || plan.title }
            : lead ? { entityType: 'lead', entityId: lead.id, entityLabel: lead.company || lead.name } : null,
        }, currentUserId, teamAccess)

        if (plan.syncToAgenda) {
          const starts = new Date(plan.dueAt)
          const ends = new Date(starts.getTime() + 30 * 60_000)
          try {
            await createCalendarEvent({
              leadId: lead?.id ?? null,
              contactId: plan.contactId,
              title: plan.title,
              description: appendAgendaMetadata(`Tarefa do CRM · ${savedTask.id}`, { version: 1, type: plan.taskType === 'call' ? 'call' : 'task', calendar: 'commercial', reminderMinutes: 15, recurrence: 'none' }),
              startsAt: starts.toISOString(), endsAt: ends.toISOString(), allDay: false, location: '', status: 'confirmed',
              assignedTo: plan.assigneeId ?? currentUserId ?? null,
            })
          } catch (calendarError) {
            await deleteTask(repositoryMode, currentWorkspace.id, savedTask.id, teamAccess).catch(() => undefined)
            throw new Error(calendarError instanceof Error ? `Não consegui sincronizar a tarefa com a Agenda: ${calendarError.message}` : 'Não consegui sincronizar a tarefa com a Agenda.')
          }
        }

        setExecutedPlanId(plan.id)
        notify('success', plan.syncToAgenda ? 'Tarefa criada e adicionada à Agenda.' : 'Tarefa criada.')
        return true
      } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar a tarefa.'); return false }
      finally { setExecuting(false) }
    }

    if (plan.kind === 'complete_task') {
      const work = await loadWorkManagement(repositoryMode, currentWorkspace.id)
      const task = work.tasks.find((item) => item.id === plan.taskId)
      if (!task || ['completed', 'cancelled'].includes(task.status)) { notify('error', 'A tarefa não está mais disponível para conclusão.'); return false }
      const confirmed = await confirmAction({ title: plan.title, description: plan.description, confirmLabel: 'Concluir tarefa', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true)
      try {
        await updateTaskStatus(repositoryMode, currentWorkspace.id, task.id, 'completed', teamAccess)
        setExecutedPlanId(plan.id); notify('success', 'Tarefa concluída.'); return true
      } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir a tarefa.'); return false }
      finally { setExecuting(false) }
    }

    if (plan.kind === 'update_lead_profile') {
      const lead = snapshot.leads.find((item) => item.id === plan.leadId)
      if (!lead) { notify('error', 'O contato proposto pelo Agent não existe mais.'); return false }
      const confirmed = await confirmAction({ title: plan.title, description: plan.description, confirmLabel: 'Atualizar classificação', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true)
      try { await updateLead(lead.id, { priority: plan.priority, temperature: plan.temperature, ...(plan.notes.trim() ? { notes: plan.notes.trim() } : {}) }); setExecutedPlanId(plan.id); notify('success', 'Classificação comercial atualizada.'); return true }
      catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível atualizar o contato.'); return false }
      finally { setExecuting(false) }
    }

    if (plan.kind === 'create_goal') {
      const confirmed = await confirmAction({ title: plan.title, description: plan.description, confirmLabel: 'Criar meta', tone: 'warning', details: plan.preview })
      if (!confirmed) return false
      setExecuting(true)
      try { await createGoal({ scope: 'workspace', teamId: null, teamName: '', userId: null, userName: currentWorkspace.name, metric: plan.metric, targetValue: plan.targetValue, periodStart: plan.periodStart, periodEnd: plan.periodEnd }); setExecutedPlanId(plan.id); notify('success', 'Meta criada pelo Agent.'); return true }
      catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar a meta.'); return false }
      finally { setExecuting(false) }
    }

    if (plan.kind === 'create_proposal') {
      const lead = snapshot.leads.find((item) => item.id === plan.leadId)
      const product = snapshot.products.find((item) => item.id === plan.productId && item.active)
      if (!lead || !product) { notify('error', 'O lead ou produto proposto pelo Agent não existe mais/está inativo.'); return false }
      const line = createProposalLineFromProduct(product, createId('proposal-item'))
      const totals = calculateProposalTotals([line], plan.contractTermMonths)
      const confirmed = await confirmAction({ title: plan.title, description: `${plan.description}\n\nO preço virá do catálogo atual, sem preço inventado pela IA.`, confirmLabel: 'Criar proposta draft', tone: 'warning', details: [...plan.preview, `TCV calculado: ${formatCurrency(totals.totalContractValue)}`] })
      if (!confirmed) return false
      setExecuting(true)
      try {
        const opportunity = snapshot.opportunities.find((item) => item.leadId === lead.id) ?? null
        await createProposal({
          leadId: lead.id, opportunityId: opportunity?.id ?? lead.opportunityId ?? null, companyId: lead.companyId ?? null, contactId: lead.primaryContactId ?? null,
          title: plan.title, status: 'draft', forecastCategory: 'pipeline', probability: plan.probability, currency: 'BRL',
          subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total,
          recurringMonthlyTotal: totals.recurringMonthlyTotal, oneTimeTotal: totals.oneTimeTotal, annualRecurringTotal: totals.annualRecurringTotal, totalContractValue: totals.totalContractValue,
          isOfficial: true, isCurrentVersion: true, expectedCloseAt: null, contractStartAt: null, contractEndAt: null, contractTermMonths: plan.contractTermMonths,
          autoRenew: false, postSaleStartAt: null, postSaleCadenceName: 'Onboarding padrão', validUntil: plan.validUntil || null, ownerId: lead.ownerId ?? null,
          notes: 'Draft criado pelo RealTalent Agent após confirmação humana.', terms: '', items: [line],
        })
        setExecutedPlanId(plan.id); notify('success', 'Proposta draft criada a partir do catálogo.'); return true
      } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar a proposta.'); return false }
      finally { setExecuting(false) }
    }

    const eligibleLeadIds = plan.leadIds.filter((leadId) => {
      const lead = snapshot.leads.find((item) => item.id === leadId)
      if (!lead || lead.status !== 'active' || lead.doNotContact) return false
      return !snapshot.activities.some((activity) => activity.leadId === leadId && activity.type === 'followup' && !activity.completedAt && activity.resolutionStatus !== 'cancelled' && activity.dueAt && Math.abs(new Date(activity.dueAt).getTime() - new Date(plan.dueAt).getTime()) < 12 * 60 * 60_000)
    })
    if (!eligibleLeadIds.length) { notify('info', 'Nenhum lead elegível: os contatos estão bloqueados/inativos ou já possuem follow-up próximo desse horário.'); return false }
    const dueLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(plan.dueAt))
    const preview = eligibleLeadIds.map((leadId) => { const lead = snapshot.leads.find((item) => item.id === leadId); return `${lead?.company || lead?.name || 'Lead'} — ${lead?.name || ''}` })
    const confirmed = await confirmAction({ title: `Criar ${eligibleLeadIds.length} follow-up(s)`, description: `Criar follow-ups para ${eligibleLeadIds.length} lead(s) em ${dueLabel}?`, confirmLabel: 'Confirmar follow-up', tone: 'warning', details: [...preview.slice(0, 6), ...(preview.length > 6 ? [`+ ${preview.length - 6} lead(s)`] : [])] })
    if (!confirmed) return false
    setExecuting(true)
    try {
      const activities = eligibleLeadIds.map((leadId) => {
        const lead = snapshot.leads.find((item) => item.id === leadId)
        return { leadId, contactId: lead?.primaryContactId ?? null, type: 'followup' as const, title: `Follow-up — ${lead?.company || lead?.name || 'Lead'}`, description: 'Follow-up criado pelo RealTalent Agent após revisão e confirmação do vendedor.', dueAt: plan.dueAt, completedAt: null, resolutionStatus: 'pending' as const, resolutionReason: null, originEventKey: plan.id, purpose: 'assistant-followup', assignedTo: lead?.ownerId ?? null }
      })
      await createActivities(activities); setExecutedPlanId(plan.id); notify('success', `${activities.length} follow-up(s) criados pelo Agent.`); return true
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível executar o plano.'); return false }
    finally { setExecuting(false) }
  }

  const workflowContext = () => ({ previousLeadIds: contextLeadIds, focusLeadId: routeFocusLead?.id, focusProposalId: routeContext.proposalId, currentRoute: route })

  const syncProgram = async () => {
    if (!program || !snapshot) return program
    const nextProgram = await continueCrmProgram(program, snapshot, workflowContext())
    setProgram(nextProgram); setMission(nextProgram.currentMission); setWorkflow(nextProgram.currentMission?.currentWorkflow ?? null)
    return nextProgram
  }

  const syncMission = async () => {
    if (!mission || !snapshot) return mission
    const nextMission = await continueCrmMission(mission, snapshot, workflowContext())
    setMission(nextMission)
    setWorkflow(nextMission.currentWorkflow)
    return nextMission
  }

  const handleWorkflowCheckpoint = async () => {
    if (!workflow || !snapshot || workflowBusy || workflow.status !== 'awaiting_approval' || !workflow.currentStep || !workflow.pendingAction) return
    setWorkflowBusy(true)
    try {
      if (workflow.pendingAction.tool === 'system.run_builder') {
        const confirmed = await confirmAction({ title: workflow.currentStep.title, description: `${workflow.currentStep.objective}\n\nO Builder criará backup, executará gates e fará rollback em falha.`, confirmLabel: 'Aprovar Builder', tone: 'warning' })
        if (!confirmed) return
        const approved = await approveCrmWorkflowStep(workflow.id)
        const next = await continueCrmWorkflow(approved.workflow, snapshot, workflowContext())
        setWorkflow(next)
        if (mission) { const synced = await continueCrmMission(mission, snapshot, workflowContext()); setMission(synced); setWorkflow(synced.currentWorkflow ?? next) }
        if (program) await syncProgram()
        return
      }
      const plan = planFromAction(workflow.pendingAction, snapshot)
      if (!plan || ['run_builder', 'run_qa', 'run_workflow', 'run_mission', 'run_program'].includes(plan.kind)) { notify('error', 'A etapa do workflow não pode ser executada com o contexto atual.'); return }
      const success = await executePlan(plan)
      if (!success) return
      const completed = await completeCrmWorkflowStep(workflow.id, workflow.currentStep.id, true, `Executado no CRM: ${plan.title}`)
      const next = await continueCrmWorkflow(completed, snapshot, workflowContext())
      setWorkflow(next)
      if (mission) { const synced = await continueCrmMission(mission, snapshot, workflowContext()); setMission(synced); setWorkflow(synced.currentWorkflow ?? next) }
        if (program) await syncProgram()
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao avançar workflow.') }
    finally { setWorkflowBusy(false) }
  }

  const handleCancelWorkflow = async () => {
    if (!workflow || workflowBusy) return
    setWorkflowBusy(true)
    try { setWorkflow(await cancelCrmWorkflow(workflow.id)); notify('info', 'Workflow cancelado.') }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível cancelar o workflow.') }
    finally { setWorkflowBusy(false) }
  }

  const handleResumeWorkflow = async () => {
    if (!workflow || workflowBusy || !['paused','needs_user'].includes(workflow.status)) return
    setWorkflowBusy(true)
    try {
      const resumed = await resumeCrmWorkflow(workflow.id)
      const next = snapshot ? await continueCrmWorkflow(resumed, snapshot, workflowContext()) : resumed
      setWorkflow(next); notify('info', 'Workflow retomado com contexto atual do CRM.')
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível retomar o workflow.') }
    finally { setWorkflowBusy(false) }
  }

  const verifyExecutedPlan = async (plan: AssistantExecutionPlan) => {
    if (qaRunning) return
    setQaRunning(true); setQaResult(null)
    const expected = plan.preview.length ? ` Evidências esperadas: ${plan.preview.join('; ')}.` : ''
    const result = plan.kind === 'run_builder' ? await runUnifiedBrowserQa(plan.product, `Verifique visualmente se a alteração do Builder está refletida corretamente. ${plan.objective}`) : await runCrmBrowserQa(`Verifique visualmente no RealTalent CRM se a alteração recém executada está refletida corretamente na interface. Alteração: ${plan.title}. ${plan.description}.${expected} Não altere nenhum dado durante a verificação.`)
    setQaResult(result); setQaRunning(false)
  }

  const copyToolOutput = async () => {
    if (!answer?.toolOutput) return
    const content = answer.toolOutput.kind === 'script'
      ? answer.toolOutput.body
      : `${answer.toolOutput.title}\n${answer.toolOutput.result}\n${answer.toolOutput.formula}\n${answer.toolOutput.details.join('\n')}`
    const copied = await copyTextToClipboard(content)
    if (copied.ok) notify('success', 'Resultado copiado.')
    else notify('error', copied.reason ?? 'Não foi possível copiar.')
  }

  const saveCommercialScript = async () => {
    if (!answer?.toolOutput || answer.toolOutput.kind !== 'script' || savingScript) return
    if (!canWrite || !canTeamAccess('edit','settings')) {
      notify('error', 'Seu perfil não possui permissão para criar Playbooks.')
      return
    }
    setSavingScript(true)
    try {
      const script = answer.toolOutput
      const saved = await actions.createPlaybook({
        kind:'script',title:script.title,content:script.body,category:'Gerado com RealTalent Agent',
        tags:['Agent V4.1',script.channel],active:false,
        guidance:{ executionModes:[script.channel === 'meeting' ? 'meeting' : script.channel === 'call' ? 'call' : 'step_by_step'] },
      })
      if (!saved?.id) throw new Error('A criação do Playbook não devolveu um identificador verificável.')
      notify('success', 'Roteiro salvo como Playbook inativo para revisão.')
      navigate('playbooks')
    } catch(error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível salvar o roteiro.')
    } finally { setSavingScript(false) }
  }

  const copyDraft = async () => {
    if (!answer?.draft) return
    const copied = await copyTextToClipboard(answer.draft.body)
    if (copied.ok) notify('success', 'Mensagem copiada. Revise antes de enviar.')
    else notify('error', copied.reason ?? 'Não foi possível copiar automaticamente.')
  }

  const openDraftChannel = () => {
    if (!answer?.draft) return
    navigate('communications', { leadId: answer.draft.leadId, action: answer.draft.channel === 'whatsapp' ? 'whatsapp' : 'email' })
  }

  if (!open) return null
  return <div className="assistant-layer" role="presentation">
    <aside className={`assistant-drawer ${expanded ? 'is-expanded' : ''}`} data-embedded-agent="crm" role="complementary" aria-label="RealTalent Agent">
      <header className="assistant-drawer__header">
        <div className="assistant-brand"><span><Bot size={20}/></span><div><strong>RealTalent Agent</strong><small>{workspaceLabel} · {contextDescription}</small></div></div>
        <div className="assistant-header-actions">
          <button className="assistant-control-center" type="button" onClick={explainCurrentScreen}><BrainCircuit size={14}/> Explicar tela</button>
          <button className="assistant-control-center" type="button" onClick={() => setExpanded((current) => !current)} aria-label={expanded ? 'Recolher painel da IA' : 'Expandir painel da IA'}>{expanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>} {expanded ? 'Recolher' : 'Expandir'}</button>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar Agent"><X size={19}/></button>
        </div>
      </header>
      <div className="assistant-trust-strip assistant-trust-strip--embedded"><ShieldCheck size={16}/><span><strong>CRM conectado</strong> · leitura + ações seguras com confirmação · contexto acompanha a tela</span></div>
      {technicalMode ? <details className="assistant-technical">
        <summary>Detalhes técnicos</summary>
        <div className="assistant-ai-runtime">
          <span><BrainCircuit size={14}/> Runtime · RealTalent AI Gateway · {env.hosted ? 'Cloud seguro' : env.agentGatewayUrl}</span>
          <span><Database size={14}/> Memória/RAG · {aiTrace?.context.memory.length ?? 0} memórias no foco</span>
          <span><Wrench size={14}/> {aiTrace?.context.toolIds.length ?? 8} ferramentas autorizadas</span>
          <span><ShieldCheck size={14}/> Escrita sempre exige confirmação</span>
          <span>Entendimento semântico comercial ativo</span>
        </div>
      </details> : null}

      {routeFocusLead ? <div className="assistant-context-bar">
        <div className="assistant-context-bar__icon"><Target size={17}/></div>
        <div><small>Contexto atual · {routeLabel}</small><strong>{routeFocusLead.company || routeFocusLead.name}</strong><span>{routeFocusLead.name} · {formatCurrency(routeFocusLead.value)}</span></div>
        <button type="button" onClick={() => void submit('Resuma este negócio')}>Analisar</button>
      </div> : <div className="assistant-context-bar assistant-context-bar--route">
        <div className="assistant-context-bar__icon"><Target size={17}/></div>
        <div><small>Tela atual</small><strong>{routeLabel}</strong><span>A IA acompanha esta rota e usa somente os dados autorizados do CRM.</span></div>
        <button type="button" onClick={explainCurrentScreen}>Explicar</button>
      </div>}

      <div className="assistant-conversation">
        {!answer && !sending && !lastUserPrompt ? <section className="assistant-welcome"><span className="assistant-welcome__icon"><Sparkles size={24}/></span><h2>{routeFocusLead ? `Trabalhando em ${routeFocusLead.company || routeFocusLead.name}` : `O que você quer saber em ${routeLabel}?`}</h2><p>{routeFocusLead ? 'Estou acompanhando este contexto. Você pode perguntar, pedir uma análise ou solicitar uma ação em linguagem natural.' : `Estou conectado à tela de ${routeLabel}. Pergunte ou peça uma ação sem usar comandos técnicos.`}</p><div className="assistant-prompt-grid">{contextualPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => void submit(prompt)}>{prompt}<ArrowRight size={14}/></button>)}</div></section> : <>
          {lastUserPrompt ? <div className="assistant-user-message"><small>Você</small><p>{lastUserPrompt}</p></div> : null}
          {sending ? <div className="assistant-thinking"><LoaderCircle className="spin" size={18}/><div><strong>Entendendo seu pedido...</strong><small>Ações simples usam o caminho rápido; análises complexas podem levar um pouco mais.</small></div></div> : null}
          {!sending && answer ? <section className="assistant-answer">
          {answer.focus ? <div className="assistant-focus-card"><div><small>Contexto analisado</small><strong>{answer.focus.title}</strong><span>{answer.focus.subtitle} · {answer.focus.stageName}</span></div><div className="assistant-focus-card__metrics"><b className={answer.focus.healthScore < 50 ? 'is-risk' : answer.focus.healthScore < 70 ? 'is-warning' : ''}>{answer.focus.healthScore}/100</b><span>{formatCurrency(answer.focus.value)}</span></div></div> : null}
          <div className="assistant-answer__heading"><span className="eyebrow">{assistantIntentLabel[answer.intent] ?? 'RealTalent'}</span><h2>{answer.title}</h2><p>{answer.text}</p></div>
          {answer.toolOutput?.kind === 'calculation' ? <div className="assistant-tool-card assistant-tool-card--calculation" aria-label="Resultado da calculadora comercial">
            <div className="assistant-tool-card__meta"><span>Calculadora comercial</span><span>Resultado verificável</span></div>
            <strong className="assistant-tool-card__value">{answer.toolOutput.result}</strong>
            <div className="assistant-tool-card__formula"><small>Fórmula</small><p>{answer.toolOutput.formula}</p></div>
            <div className="assistant-tool-card__notes">{answer.toolOutput.details.map((item,index)=><p key={index}>{item}</p>)}</div>
            <Button variant="secondary" size="sm" onClick={() => void copyToolOutput()}><Clipboard size={15}/> Copiar cálculo</Button>
          </div> : null}
          {answer.toolOutput?.kind === 'script' ? <div className="assistant-tool-card assistant-tool-card--script" aria-label="Roteiro comercial gerado">
            <div className="assistant-tool-card__meta"><span>Script Studio</span><span>{answer.toolOutput.grounded ? 'Baseado no contexto do CRM' : 'Modelo para personalizar'}</span></div>
            <pre className="assistant-tool-card__script">{answer.toolOutput.body}</pre>
            <div className="assistant-tool-card__actions">
              <Button variant="secondary" size="sm" onClick={() => void copyToolOutput()}><Clipboard size={15}/> Copiar roteiro</Button>
              <Button size="sm" loading={savingScript} disabled={!canWrite || !canTeamAccess('edit','settings')} onClick={() => void saveCommercialScript()}><Wrench size={15}/> Salvar nos Playbooks</Button>
            </div>
            <small className="assistant-tool-card__disclaimer">Salvar cria um Playbook inativo para revisão. Nenhuma mensagem é enviada automaticamente.</small>
          </div> : null}
          {answer.facts.length ? <div className="assistant-facts">{answer.facts.map((fact) => <span key={fact}>{fact}</span>)}</div> : null}
          {answer.items.length ? <div className="assistant-results">{answer.items.map((item, index) => <button type="button" key={item.id} onClick={() => openItem(item)}>
            <span className="assistant-results__rank">{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small><p>{item.reason}</p></div>{item.score !== undefined ? <b className={item.score < 50 ? 'is-risk' : item.score < 70 ? 'is-warning' : ''}>{item.score}</b> : <ExternalLink size={16}/>}</button>)}</div> : null}
          {answer.draft ? <div className="assistant-draft"><div className="assistant-draft__heading"><MessageSquareText size={18}/><div><strong>{answer.draft.title}</strong><small>{answer.draft.channel === 'whatsapp' ? 'WhatsApp sugerido' : 'E-mail sugerido'} · não enviado</small></div></div><div className="assistant-draft__body">{answer.draft.body}</div><p>{answer.draft.rationale}</p><div className="assistant-draft__actions"><Button variant="secondary" size="sm" onClick={() => void copyDraft()}><Clipboard size={15}/> Copiar</Button><Button size="sm" onClick={openDraftChannel}>Abrir Comunicação <ArrowRight size={15}/></Button></div></div> : null}
          {answer.plan ? <div className={`assistant-plan ${executedPlanId === answer.plan.id ? 'is-done' : ''}`}><div className="assistant-plan__title">{executedPlanId === answer.plan.id ? <CheckCircle2 size={19}/> : <AlertTriangle size={19}/>}<div><strong>{executedPlanId === answer.plan.id ? (answer.plan.kind === 'run_program' ? 'Programa iniciado' : answer.plan.kind === 'run_mission' ? 'Missão iniciada' : answer.plan.kind === 'run_workflow' ? 'Workflow iniciado' : answer.plan.kind === 'run_qa' ? 'QA concluído' : answer.plan.kind === 'run_builder' ? 'Builder concluído' : 'Plano executado') : answer.plan.title}</strong><small>{answer.plan.description}</small></div></div><div className="assistant-plan__meta"><Clock3 size={15}/>{answer.plan.kind === 'create_followups' || answer.plan.kind === 'create_task' ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(answer.plan.dueAt)) : executedPlanId === answer.plan.id ? (answer.plan.kind === 'run_qa' ? 'Verificação concluída' : 'Pronto para verificação visual') : 'Aguardando sua confirmação'}</div>{executedPlanId !== answer.plan.id ? <Button disabled={executing || (!canWrite && (answer.plan.kind === 'crm_capabilities' ? answer.plan.steps.some((step) => step.risk !== 'read') : !['run_builder','run_qa','run_workflow','run_mission','run_program'].includes(answer.plan.kind)))} onClick={() => void executePlan(answer.plan!)}>{executing ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>} {answer.plan.kind === 'run_program' ? 'Iniciar programa' : answer.plan.kind === 'run_mission' ? 'Iniciar missão' : answer.plan.kind === 'run_workflow' ? 'Iniciar workflow' : answer.plan.kind === 'run_builder' ? 'Revisar e construir' : answer.plan.kind === 'run_qa' ? 'Executar QA' : answer.plan.kind === 'crm_capabilities' ? (answer.plan.steps.some((step) => step.risk === 'high') ? 'Revisar e executar' : answer.plan.steps.some((step) => step.risk !== 'read') ? 'Confirmar e executar' : 'Consultar CRM') : ['create_task','create_followups','complete_task'].includes(answer.plan.kind) ? 'Confirmar' : 'Revisar e executar'}</Button> : !['run_qa','run_workflow','run_mission','run_program','create_task','create_followups','complete_task'].includes(answer.plan.kind) ? <Button variant="secondary" disabled={qaRunning} onClick={() => void verifyExecutedPlan(answer.plan!)}>{qaRunning ? <LoaderCircle className="spin" size={16}/> : <MonitorCheck size={16}/>} {qaRunning ? 'Verificando interface' : 'Verificar na interface'}</Button> : null}{qaResult ? <div className={`assistant-qa-result is-${qaResult.status.toLowerCase().replace('_','-')}`}><strong>Browser QA: {qaResult.status}</strong><span>{qaResult.summary}</span>{qaResult.evidence ? <small>{qaResult.evidence}</small> : null}</div> : null}</div> : null}
          {program ? <div className={`assistant-workflow assistant-mission is-${program.status.replace('_','-')}`}><div className="assistant-workflow__head"><div><small>Programa autônomo · V2.9 Long-Horizon Autonomous Workflows</small><strong>{program.title}</strong><span>{program.progress.completed}/{program.progress.total} marcos · {program.progress.percent}% · replanejamentos {program.replans}/2</span></div><b>{program.status}</b></div><p>{program.objective}</p><div className="assistant-workflow__steps">{program.stages.map((stage, index) => <div key={stage.id} className={`assistant-workflow__step is-${stage.status}`}><span>{index + 1}</span><div><strong>{stage.title}</strong><small>{stage.priority.toUpperCase()} · {stage.summary || stage.objective}</small></div><b>{stage.status}</b></div>)}</div>{program.status === 'awaiting_acceptance' && program.currentStage ? <div className="assistant-workflow__error">Marco concluído. Revise os critérios de aceite no Control Center antes de liberar dependências.</div> : null}{program.requestedProduct === 'blue_ocean' && !['completed','failed','cancelled'].includes(program.status) ? <Button variant="secondary" onClick={() => env.blueOceanUrl && window.open(env.blueOceanUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={16}/> Abrir Blue Ocean</Button> : null}{(!program.requestedProduct || program.requestedProduct === 'crm') && ['ready','needs_context','running','waiting_mission'].includes(program.status) ? <Button disabled={workflowBusy} onClick={() => void syncProgram()}>{workflowBusy ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>} Continuar programa no CRM</Button> : null}{env.agentControlUrl ? <Button variant="secondary" onClick={() => window.open(env.agentControlUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={16}/> Gerenciar programa</Button> : null}{program.error ? <small className="assistant-workflow__error">{program.error}</small> : null}</div> : null}
          {mission ? <div className={`assistant-workflow assistant-mission is-${mission.status.replace('_','-')}`}><div className="assistant-workflow__head"><div><small>Missão CRM ↔ Blue Ocean</small><strong>{mission.title}</strong><span>{mission.progress.completed}/{mission.progress.total} blocos · {mission.progress.percent}% · replanejamentos {mission.replans}/2</span></div><b>{mission.status}</b></div><p>{mission.objective}</p><div className="assistant-workflow__steps">{mission.legs.map((leg, index) => <div key={leg.id} className={`assistant-workflow__step is-${leg.status}`}><span>{index + 1}</span><div><strong>{leg.title}</strong><small>{leg.product === 'crm' ? 'CRM' : 'BLUE OCEAN'} · {leg.summary || leg.objective}</small></div><b>{leg.status}</b></div>)}</div>{mission.requestedProduct === 'blue_ocean' && !['completed','failed','cancelled'].includes(mission.status) ? <Button variant="secondary" onClick={() => env.blueOceanUrl && window.open(env.blueOceanUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={16}/> Abrir Blue Ocean</Button> : null}{mission.requestedProduct === 'crm' && ['needs_context','running','waiting_workflow'].includes(mission.status) ? <Button disabled={workflowBusy} onClick={() => void syncMission()}>{workflowBusy ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>} Continuar missão no CRM</Button> : null}{env.agentControlUrl ? <Button variant="secondary" onClick={() => window.open(env.agentControlUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={16}/> Gerenciar missão</Button> : null}{mission.error ? <small className="assistant-workflow__error">{mission.error}</small> : null}</div> : null}
          {workflow ? <div className={`assistant-workflow is-${workflow.status.replace('_','-')}`}><div className="assistant-workflow__head"><div><small>Workflow autônomo</small><strong>{workflow.title}</strong><span>{workflow.progress.completed}/{workflow.progress.total} etapas · {workflow.progress.percent}%</span></div><b>{workflow.status}</b></div><p>{workflow.objective}</p><div className="assistant-workflow__steps">{workflow.steps.map((step, index) => <div key={step.id} className={`assistant-workflow__step is-${step.status}`}><span>{index + 1}</span><div><strong>{step.title}</strong><small>{step.kind.toUpperCase()} · {step.summary || step.objective}</small></div><b>{step.status}</b></div>)}</div>{workflow.status === 'awaiting_approval' ? <Button disabled={workflowBusy} onClick={() => void handleWorkflowCheckpoint()}>{workflowBusy ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>} {workflow.pendingAction?.tool === 'system.run_builder' ? 'Aprovar Builder' : 'Revisar e executar etapa'}</Button> : null}{['paused','needs_user'].includes(workflow.status) ? <Button disabled={workflowBusy} onClick={() => void handleResumeWorkflow()}>{workflowBusy ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>} Retomar workflow</Button> : null}{!['completed','failed','cancelled'].includes(workflow.status) ? <Button variant="secondary" disabled={workflowBusy} onClick={() => void handleCancelWorkflow()}>Cancelar workflow</Button> : null}{workflow.error ? <small className="assistant-workflow__error">{workflow.error}</small> : null}</div> : null}
          <div className="assistant-suggestions">{answer.suggestedPrompts.slice(0, 4).map((prompt) => <button key={prompt} type="button" onClick={() => void submit(prompt)}>{prompt}</button>)}</div>
        </section> : null}</>}
      </div>

      <form className="assistant-composer assistant-composer--v314" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <MessageSquareText size={18}/><textarea ref={inputRef} autoFocus rows={1} value={query} disabled={sending} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} placeholder={routeFocusLead ? `Pergunte ou peça uma ação sobre ${routeFocusLead.company || routeFocusLead.name}...` : 'Pergunte ou peça uma ação...'}/><Button type="submit" size="sm" disabled={sending || !query.trim() || !snapshot}>{sending ? <LoaderCircle className="spin" size={15}/> : null} Enviar</Button>
      </form>
      <footer className="assistant-drawer__footer"><span>{routeLabel}</span><span>•</span><span>CRM conectado</span><span>•</span><span>Ações com confirmação</span></footer>
    </aside>
  </div>
}

/* V1.0 regression markers: PROGRAM · GOVERNANCE | uma única conversa | Production Governance V1.0 · Programs · Control Center | Programa autônomo · V1.0 governado */

/* V1.1 regression markers: Local AI Runtime V1.1 | V1.1 local-first */
/* V3.1.4 Conversational Actions: linguagem natural -> fast path -> preview -> confirmação; UI sem códigos internos. */

/* V3.1.4-H2 Natural Action Bridge: comandos naturais -> entidades CRM -> confirmação -> gravação + sincronização Agenda. */

/* V3.1.4-H2 compatibility marker — Natural Action Bridge & CRM Sync preserved. */

/* V3.1.4-H3 compatibility marker: semantic sales language lexical fallback preserved. */
/* V3.1.5 Semantic Sales Language Engine: model-first structured intent + entity + context + confidence routing. */
/* V3.2 CRM Agent Operating Layer: capability registry + planner + permission/risk execution + rollback + undo. */
