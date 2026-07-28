import type { CallOutcome, Lead, PipelineStage } from '../domain/types'
import { outcomeLabel } from './call-workspace'

export type CommercialStageIntent = 'keep' | 'proposal' | 'won' | 'lost'
export type PendingActivityPolicy = 'keep' | 'close_calls' | 'close_prospecting'

export interface CommercialCallPlan {
  outcome: CallOutcome
  label: string
  addTags: string[]
  stageIntent: CommercialStageIntent
  leadStatus: Lead['status'] | null
  pendingActivityPolicy: PendingActivityPolicy
  nextStepKind: 'none' | 'call' | 'meeting'
  requiresNextAt: boolean
}

export interface CommercialCallPlanInput {
  outcome: CallOutcome
  scheduleNext: boolean
  nextAt: string | null
}

export function buildCommercialCallPlan(input: CommercialCallPlanInput): CommercialCallPlan {
  const requiresNextAt = ['no_answer', 'busy', 'voicemail', 'callback_requested', 'interested', 'meeting_scheduled', 'proposal_requested', 'proposal_sent', 'wrong_person'].includes(input.outcome)
  if (requiresNextAt && (!input.scheduleNext || !input.nextAt)) {
    throw new Error('Este resultado exige o agendamento do próximo passo.')
  }

  const nextStepKind: CommercialCallPlan['nextStepKind'] = !input.scheduleNext || !input.nextAt
    ? 'none'
    : input.outcome === 'meeting_scheduled'
      ? 'meeting'
      : 'call'

  if (input.outcome === 'sale_completed') {
    return { outcome: input.outcome, label: outcomeLabel(input.outcome), addTags: [], stageIntent: 'won', leadStatus: 'won', pendingActivityPolicy: 'close_prospecting', nextStepKind: 'none', requiresNextAt: false }
  }
  if (input.outcome === 'not_interested') {
    return { outcome: input.outcome, label: outcomeLabel(input.outcome), addTags: [], stageIntent: 'lost', leadStatus: 'lost', pendingActivityPolicy: 'close_prospecting', nextStepKind: 'none', requiresNextAt: false }
  }
  if (input.outcome === 'invalid_number') {
    return { outcome: input.outcome, label: outcomeLabel(input.outcome), addTags: ['telefone-invalido'], stageIntent: 'keep', leadStatus: null, pendingActivityPolicy: 'close_calls', nextStepKind: 'none', requiresNextAt: false }
  }
  if (input.outcome === 'wrong_person') {
    return { outcome: input.outcome, label: outcomeLabel(input.outcome), addTags: ['buscar-decisor'], stageIntent: 'keep', leadStatus: null, pendingActivityPolicy: 'keep', nextStepKind, requiresNextAt }
  }
  if (input.outcome === 'proposal_requested' || input.outcome === 'proposal_sent') {
    return { outcome: input.outcome, label: outcomeLabel(input.outcome), addTags: [], stageIntent: 'proposal', leadStatus: null, pendingActivityPolicy: 'keep', nextStepKind, requiresNextAt }
  }
  if (input.outcome === 'meeting_scheduled') {
    return { outcome: input.outcome, label: outcomeLabel(input.outcome), addTags: [], stageIntent: 'keep', leadStatus: null, pendingActivityPolicy: 'close_prospecting', nextStepKind, requiresNextAt }
  }
  return { outcome: input.outcome, label: outcomeLabel(input.outcome), addTags: [], stageIntent: 'keep', leadStatus: null, pendingActivityPolicy: 'keep', nextStepKind, requiresNextAt }
}

export function resolveCommercialStage(stages: PipelineStage[], workspaceId: string, intent: CommercialStageIntent): PipelineStage | null {
  const workspaceStages = stages.filter((stage) => stage.workspaceId === workspaceId)
  if (intent === 'won') return workspaceStages.find((stage) => stage.isWon) ?? null
  if (intent === 'lost') return workspaceStages.find((stage) => stage.isLost) ?? null
  if (intent === 'proposal') return workspaceStages.find((stage) => stage.name.toLocaleLowerCase('pt-BR').includes('proposta')) ?? null
  return null
}

export function shouldClosePendingActivity(type: string, policy: PendingActivityPolicy) {
  if (policy === 'close_calls') return type === 'call'
  if (policy === 'close_prospecting') return type === 'call' || type === 'followup'
  return false
}
