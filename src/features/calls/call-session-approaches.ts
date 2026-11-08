import type { CallOutcome, CallRecord, Lead, Playbook, WorkspaceSnapshot } from '../../domain/types'
import type { CallSessionObjective } from '../../services/call-session-intelligence'
import { recommendPlaybooks } from '../../services/coaching-engine'

export type CallApproachType = 'first_contact' | 'follow_up' | 'callback' | 'proposal' | 'reactivation'
export const CALL_APPROACHES: Record<CallApproachType, { label: string; keywords: string[] }> = {
  first_contact: { label: 'Primeiro contato', keywords: ['primeiro contato', 'abordagem', 'inicial', 'prospecção', 'descoberta'] },
  follow_up: { label: 'Follow-up', keywords: ['follow-up', 'follow up', 'continuidade', 'acompanhamento'] },
  callback: { label: 'Retorno combinado', keywords: ['retorno', 'recontato', 'callback', 'retomada'] },
  proposal: { label: 'Proposta em andamento', keywords: ['proposta', 'negociação', 'objeção', 'decisão'] },
  reactivation: { label: 'Reativação', keywords: ['reativação', 'reconexão', 'inativo', 'recuperação'] },
}
export const callApproachEntries = Object.entries(CALL_APPROACHES) as Array<[CallApproachType, typeof CALL_APPROACHES[CallApproachType]]>

export function classifyCallApproach(input: {
  lead: Lead
  calls: CallRecord[]
  activityDates?: string[]
  proposalExists?: boolean
  now?: Date
}): CallApproachType {
  const { lead } = input
  const calls = input.calls.filter((call) => call.leadId === lead.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const recent = calls[0]
  if (recent?.outcome === 'callback_requested') return 'callback'
  if (input.proposalExists) return 'proposal'
  const dates = [...calls.map((call) => call.startedAt), ...(input.activityDates ?? [])]
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => b.localeCompare(a))
  if (!dates.length) return 'first_contact'
  if ((input.now ?? new Date()).getTime() - Date.parse(dates[0]) > 75 * 24 * 60 * 60 * 1000) return 'reactivation'
  return 'follow_up'
}

export function recommendApproachPlaybook(input: {
  lead: Lead
  approach: CallApproachType
  objective: CallSessionObjective
  playbooks: Playbook[]
  lastOutcome?: CallOutcome | null
}): Playbook | null {
  const active = input.playbooks.filter((item) => item.kind === 'script' && item.active)
  if (!active.length) return null
  const ranked = recommendPlaybooks(active, {
    objective: input.objective,
    stageId: input.lead.stageId,
    decisionRole: input.lead.decisionRole ?? null,
    temperature: input.lead.temperature,
    outcome: input.lastOutcome,
    kind: 'script',
  })
  // Respect existing CRM recommendation scores. Favor a matching approach
  // when available without inventing non-existent scripts.
  const keywords = CALL_APPROACHES[input.approach].keywords
  const scored = ranked.map((item) => {
    const text = [item.playbook.title, item.playbook.category, ...item.playbook.tags].join(' ').toLocaleLowerCase('pt-BR')
    return { ...item, approachBonus: keywords.some((word) => text.includes(word)) ? 38 : 0 }
  })
  scored.sort((a, b) => (b.score + b.approachBonus) - (a.score + a.approachBonus))
  return scored[0]?.playbook ?? null
}

/** Read-only CRM evidence; never fabricate a WhatsApp conversation or AI finding. */
export interface LeadPlaybookAdvice {
  approach: CallApproachType
  recommended: Playbook | null
  explanation: string
  context: string[]
  related: {
    stage: string | null
    proposalId: string | null
    proposalTitle: string | null
    pendingActivities: number
    upcomingMeetings: number
    lastCallAt: string | null
    contacts: number
  }
  isSpecific: boolean
}

export function buildLeadPlaybookAdvice(input: {
  lead: Lead
  snapshot: WorkspaceSnapshot
  objective: CallSessionObjective
  manualApproach?: CallApproachType
  now?: Date
}): LeadPlaybookAdvice {
  const { lead, snapshot } = input
  const now = input.now ?? new Date()
  const calls = snapshot.calls.filter((call) => call.leadId === lead.id)
    .sort((a,b) => b.startedAt.localeCompare(a.startedAt))
  const activities = snapshot.activities.filter((item) => item.leadId === lead.id)
  const meetings = snapshot.events.filter((item) => item.leadId === lead.id &&
    item.startsAt && Number.isFinite(Date.parse(item.startsAt)) &&
    !['cancelled','canceled'].includes(String(item.status).toLowerCase()))
  const proposal = snapshot.proposals
    .filter((item) => item.leadId === lead.id && item.isCurrentVersion &&
      !['cancelled','rejected','expired','superseded'].includes(String(item.status).toLowerCase()))
    .sort((a,b) => b.version - a.version)[0] ?? null
  const completedActivities = activities
    .filter((item) => item.completedAt && item.type !== 'note')
    .map((item) => item.completedAt!)
  const pastMeetings = meetings.filter((item) => Date.parse(item.startsAt) <= now.getTime()).map((item) => item.startsAt)
  const approach = input.manualApproach ?? classifyCallApproach({
    lead,
    calls,
    activityDates: [...completedActivities,...pastMeetings],
    proposalExists: Boolean(proposal),
    now,
  })
  const recommended = recommendApproachPlaybook({
    lead,
    approach,
    objective: input.objective,
    playbooks: snapshot.playbooks,
    lastOutcome: calls[0]?.outcome ?? null,
  })
  const tags = recommended
    ? [recommended.title,recommended.category,...recommended.tags].join(' ').toLocaleLowerCase('pt-BR')
    : ''
  const isSpecific = Boolean(recommended && (
    CALL_APPROACHES[approach].keywords.some((word) => tags.includes(word))
    || recommended.guidance?.stageIds?.includes(lead.stageId)
    || recommended.guidance?.objectives?.includes(input.objective)
  ))
  const stage = snapshot.stages.find((item) => item.id === lead.stageId)?.name ?? null
  const contacts = snapshot.contacts.filter((item) =>
    item.leadIds.includes(lead.id) || (lead.companyId && item.companyId === lead.companyId)).length
  const pendingActivities = activities.filter((item) => !item.completedAt &&
    !['cancelled','canceled'].includes(String(item.resolutionStatus).toLowerCase())).length
  const upcomingMeetings = meetings.filter((item) => Date.parse(item.startsAt) > now.getTime()).length
  const context = [
    stage ? `Pipeline: ${stage}` : null,
    proposal ? `Proposta vinculada: ${proposal.title}` : null,
    calls[0] ? `Ligação anterior registrada em ${new Date(calls[0].startedAt).toLocaleDateString('pt-BR')}` : null,
    pendingActivities ? `${pendingActivities} tarefa(s) pendente(s)` : null,
    upcomingMeetings ? `${upcomingMeetings} reunião(ões) agendada(s)` : null,
    contacts ? `${contacts} contato(s) vinculado(s)` : null,
  ].filter((value): value is string => Boolean(value))
  const explanation = !recommended
    ? 'Não existe playbook de ligação ativo na biblioteca. Crie ou ative um roteiro.'
    : isSpecific
      ? `Recomendado por aderência a ${CALL_APPROACHES[approach].label.toLowerCase()}${stage ? ` e à etapa ${stage}` : ''}.`
      : `Roteiro geral disponível. Não há playbook específico para ${CALL_APPROACHES[approach].label.toLowerCase()} na biblioteca.`
  return {
    approach, recommended, explanation, context,
    isSpecific,
    related: {
      stage, proposalId: proposal?.id ?? null, proposalTitle: proposal?.title ?? null,
      pendingActivities, upcomingMeetings, lastCallAt: calls[0]?.startedAt ?? null, contacts,
    },
  }
}
