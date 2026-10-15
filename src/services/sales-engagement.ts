import type { ActivityItem, Lead } from '../domain/types'
import {
  cadencePolicy, readFollowupMetadata, withFollowupMetadata,
  type CadenceEnrollmentState, type CadencePolicy, type FollowupOutcome,
} from './followup-workspace'

export type EngagementDecision = 'continue' | 'pause' | 'stop'

export interface CadenceDecision {
  action: EngagementDecision
  reason: string
}

export interface CadenceEnrollmentSummary {
  enrollmentId: string
  cadenceId: string
  cadenceName: string
  leadId: string
  leadName: string
  state: CadenceEnrollmentState
  pending: number
  completed: number
  cancelled: number
  total: number
  nextAt: string | null
  lastOutcome: FollowupOutcome | null
  response: boolean
}

const RESPONSE_OUTCOMES = new Set<FollowupOutcome>(['answered', 'interested', 'proposal_requested', 'meeting_scheduled', 'not_decision_maker'])

export const decideCadenceAfterOutcome = (outcome: FollowupOutcome, policyInput?: Partial<CadencePolicy> | null): CadenceDecision => {
  const policy = { ...cadencePolicy(), ...(policyInput ?? {}) }
  if (outcome === 'no_response') return policy.continueOnNoResponse
    ? { action: 'continue', reason: 'Sem resposta: manter a sequência multicanal.' }
    : { action: 'pause', reason: 'Sem resposta: sequência pausada para revisão.' }
  if (outcome === 'callback_requested' && policy.pauseOnCallback) return { action: 'pause', reason: 'Lead pediu retorno: pausar a cadência até o próximo contato combinado.' }
  if (outcome === 'meeting_scheduled' && policy.stopOnMeeting) return { action: 'stop', reason: 'Reunião marcada: retirar o lead da cadência de prospecção.' }
  if (outcome === 'proposal_requested' && policy.stopOnProposal) return { action: 'stop', reason: 'Proposta solicitada: encerrar a cadência e avançar para negociação.' }
  if (['won', 'lost'].includes(outcome) && policy.stopOnWonLost) return { action: 'stop', reason: `Oportunidade ${outcome === 'won' ? 'ganha' : 'perdida'}: encerrar a cadência.` }
  if (outcome === 'not_interested' && policy.stopOnNotInterested) return { action: 'stop', reason: 'Lead sem interesse: encerrar a cadência.' }
  if (outcome === 'invalid_contact') return { action: 'stop', reason: 'Contato inválido: interromper tentativas automáticas.' }
  if (RESPONSE_OUTCOMES.has(outcome) && policy.stopOnResponse) return { action: 'stop', reason: 'Lead respondeu: sair da cadência e seguir com atendimento contextual.' }
  return { action: 'continue', reason: 'Continuar a próxima etapa planejada.' }
}

export const cadenceActivitiesForEnrollment = (activities: ActivityItem[], activity: ActivityItem) => {
  const current = readFollowupMetadata(activity)
  if (!current?.cadenceId || !activity.leadId) return []
  return activities.filter((item) => {
    const meta = readFollowupMetadata(item)
    return item.leadId === activity.leadId && meta?.cadenceId === current.cadenceId && meta?.kind === 'cadence-step'
  })
}

export const buildCadenceOutcomePatches = (
  activities: ActivityItem[],
  activity: ActivityItem,
  outcome: FollowupOutcome,
  resumeAt?: string | null,
): Array<{ id: string; description: string; dueAt?: string | null; resolutionStatus?: ActivityItem['resolutionStatus']; resolutionReason?: string | null }> => {
  const meta = readFollowupMetadata(activity)
  if (!meta?.cadenceId || !activity.leadId) return []
  const decision = decideCadenceAfterOutcome(outcome, meta.policy)
  const pending = cadenceActivitiesForEnrollment(activities, activity).filter((item) => item.id !== activity.id && !item.completedAt && (item.resolutionStatus ?? 'pending') === 'pending')
  if (decision.action === 'continue') return pending.map((item) => ({ id: item.id, description: withFollowupMetadata(item, { cadenceState: 'active', engagementAction: 'continue' }) }))
  if (decision.action === 'stop') return pending.map((item) => ({
    id: item.id,
    description: withFollowupMetadata(item, { cadenceState: 'stopped', stopReason: decision.reason, engagementAction: 'stop' }),
    resolutionStatus: 'superseded',
    resolutionReason: decision.reason,
  }))
  const target = resumeAt ? new Date(resumeAt) : null
  const validTarget = target && !Number.isNaN(target.getTime()) ? target : null
  const earliest = pending.map((item) => item.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY).sort((a, b) => a - b)[0]
  const shiftMs = validTarget && Number.isFinite(earliest) ? Math.max(0, validTarget.getTime() - earliest) : 0
  return pending.map((item) => ({
    id: item.id,
    dueAt: item.dueAt && shiftMs ? new Date(new Date(item.dueAt).getTime() + shiftMs).toISOString() : item.dueAt,
    description: withFollowupMetadata(item, { cadenceState: 'paused', pauseReason: decision.reason, resumeAt: validTarget?.toISOString(), engagementAction: 'pause' }),
  }))
}

export const buildCadenceStatePatches = (
  activities: ActivityItem[], cadenceId: string, action: 'pause' | 'resume' | 'stop', leadId?: string | null,
): Array<{ id: string; description: string; dueAt?: string | null; resolutionStatus?: ActivityItem['resolutionStatus']; resolutionReason?: string | null }> => {
  const pending = activities.filter((item) => {
    const meta = readFollowupMetadata(item)
    return meta?.kind === 'cadence-step' && meta.cadenceId === cadenceId && (!leadId || item.leadId === leadId) && !item.completedAt && (item.resolutionStatus ?? 'pending') === 'pending'
  })
  const now = Date.now()
  if (action === 'stop') return pending.map((item) => ({ id: item.id, description: withFollowupMetadata(item, { cadenceState: 'stopped', stopReason: 'Cadência encerrada manualmente.', engagementAction: 'stop' }), resolutionStatus: 'cancelled', resolutionReason: 'Cadência encerrada manualmente.' }))
  if (action === 'pause') return pending.map((item) => ({ id: item.id, description: withFollowupMetadata(item, { cadenceState: 'paused', pauseReason: 'Cadência pausada manualmente.', resumeAt: undefined, engagementAction: 'pause' }) }))
  if (action === 'resume') {
    const firstDue = pending.map((item) => item.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY).sort((a, b) => a - b)[0]
    const shift = Number.isFinite(firstDue) && firstDue < now ? now - firstDue + 60_000 : 0
    return pending.map((item) => ({ id: item.id, dueAt: item.dueAt && shift ? new Date(new Date(item.dueAt).getTime() + shift).toISOString() : item.dueAt, description: withFollowupMetadata(item, { cadenceState: 'active', pauseReason: undefined, resumeAt: undefined, engagementAction: 'continue' }) }))
  }
  return []
}

export const summarizeCadenceEnrollments = (activities: ActivityItem[], leads: Lead[]): CadenceEnrollmentSummary[] => {
  const map = new Map<string, ActivityItem[]>()
  for (const activity of activities) {
    const meta = readFollowupMetadata(activity)
    if (meta?.kind !== 'cadence-step' || !meta.cadenceId || !activity.leadId) continue
    const enrollmentId = meta.enrollmentId ?? `${meta.cadenceId}:${activity.leadId}`
    const list = map.get(enrollmentId) ?? []
    list.push(activity); map.set(enrollmentId, list)
  }
  return [...map.entries()].map(([enrollmentId, items]) => {
    const metas = items.map((item) => readFollowupMetadata(item)).filter(Boolean)
    const firstMeta = metas[0]!
    const pendingItems = items.filter((item) => !item.completedAt && (item.resolutionStatus ?? 'pending') === 'pending')
    const paused = pendingItems.some((item) => { const meta = readFollowupMetadata(item); return meta?.cadenceState === 'paused' && (!meta.resumeAt || new Date(meta.resumeAt).getTime() > Date.now()) })
    const stopped = !pendingItems.length && items.some((item) => ['cancelled', 'superseded'].includes(item.resolutionStatus ?? ''))
    const completedNaturally = !pendingItems.length && !stopped && items.every((item) => Boolean(item.completedAt))
    const leadId = items[0].leadId!
    const resultItems = activities.filter((item) => item.leadId === leadId).map((item) => ({ item, meta: readFollowupMetadata(item) })).filter((entry) => entry.meta?.kind === 'result' && entry.meta.cadenceId === firstMeta.cadenceId)
    const last = resultItems.sort((a, b) => b.item.createdAt.localeCompare(a.item.createdAt))[0]
    const next = pendingItems.filter((item) => item.dueAt).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))[0]
    return {
      enrollmentId, cadenceId: firstMeta.cadenceId!, cadenceName: firstMeta.cadenceName ?? 'Cadência', leadId,
      leadName: leads.find((lead) => lead.id === leadId)?.name ?? 'Lead', state: stopped ? 'stopped' : completedNaturally ? 'completed' : paused ? 'paused' : 'active',
      pending: pendingItems.length, completed: items.filter((item) => item.completedAt && (item.resolutionStatus ?? 'completed') === 'completed').length,
      cancelled: items.filter((item) => ['cancelled', 'superseded'].includes(item.resolutionStatus ?? '')).length, total: items.length,
      nextAt: next?.dueAt ?? null, lastOutcome: (last?.meta?.outcome as FollowupOutcome | undefined) ?? null,
      response: Boolean(last?.meta?.outcome && last.meta.outcome !== 'no_response'),
    }
  })
}

export const cadenceChannelAvailable = (lead: Lead | null, channel: string) => {
  if (!lead) return false
  if (channel === 'call' || channel === 'whatsapp') return Boolean(lead.phone?.replace(/\D/g, ''))
  if (channel === 'email') return Boolean(lead.email?.trim())
  if (channel === 'linkedin') return Boolean(lead.linkedinUrl?.trim())
  if (channel === 'instagram') return Boolean(lead.instagramUrl?.trim())
  return true
}
