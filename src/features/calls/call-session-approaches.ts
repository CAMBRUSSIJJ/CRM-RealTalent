import type { CallOutcome, CallRecord, Lead, Playbook } from '../../domain/types'
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
