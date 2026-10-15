import type { Lead, PipelineStage, WorkspaceSnapshot } from '../domain/types'

const DAY = 86_400_000

export type PipelineHealth = 'healthy' | 'attention' | 'critical' | 'no_action' | 'proposal_stale'
export type ExpectedCloseState = 'missing' | 'overdue' | 'this_month' | 'future'

export interface PipelineStagePolicy {
  maxDays: number
  requirePhone: boolean
  requireValue: boolean
  requireNextAction: boolean
  preventSkipping: boolean
  confirmBackward: boolean
  instructions: string
}

export interface PipelineSignal {
  stageEnteredAt: string
  stageAge: number
  lastInteractionAt: string | null
  inactivityDays: number | null
  attempts: number
  health: PipelineHealth
  healthReason: string
  expectedCloseState: ExpectedCloseState
}

const validDate = (value: string | null | undefined) => {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export const elapsedDays = (value: string | null | undefined, now = new Date()) => {
  const timestamp = validDate(value)
  return timestamp === null ? 0 : Math.max(0, Math.floor((now.getTime() - timestamp) / DAY))
}

export const recommendedStagePolicy = (stage: PipelineStage | null | undefined, index = 0, total = 1): PipelineStagePolicy => {
  const name = stage?.name.toLocaleLowerCase('pt-BR') ?? ''
  if (stage?.isWon || stage?.isLost) return { maxDays: 365, requirePhone: false, requireValue: false, requireNextAction: false, preventSkipping: false, confirmBackward: true, instructions: stage.isWon ? 'Confirme valor, responsável e data do fechamento.' : 'Registre o motivo da perda para alimentar os relatórios.' }
  if (/proposta|orçamento/.test(name)) return { maxDays: 3, requirePhone: true, requireValue: true, requireNextAction: true, preventSkipping: true, confirmBackward: true, instructions: 'Confirme o recebimento da proposta, o decisor e a data combinada para retorno.' }
  if (/negocia|decisão|fechamento/.test(name)) return { maxDays: 5, requirePhone: true, requireValue: true, requireNextAction: true, preventSkipping: true, confirmBackward: true, instructions: 'Registre objeções, condições acordadas e um próximo passo com data.' }
  if (/qualific|diagnóstico|reunião/.test(name)) return { maxDays: 4, requirePhone: true, requireValue: false, requireNextAction: true, preventSkipping: index > 1, confirmBackward: true, instructions: 'Valide necessidade, urgência, orçamento e quem participa da decisão.' }
  if (/contato|abordagem/.test(name)) return { maxDays: 2, requirePhone: true, requireValue: false, requireNextAction: true, preventSkipping: false, confirmBackward: true, instructions: 'Faça a primeira abordagem e deixe a próxima tentativa agendada.' }
  if (/follow|retorno|nutri/.test(name)) return { maxDays: 4, requirePhone: true, requireValue: false, requireNextAction: true, preventSkipping: false, confirmBackward: true, instructions: 'Mantenha uma cadência ativa e registre o contexto de cada tentativa.' }
  if (/novo|entrada|lead/.test(name) || index === 0) return { maxDays: 1, requirePhone: false, requireValue: false, requireNextAction: true, preventSkipping: false, confirmBackward: true, instructions: 'Confirme dados mínimos, responsável e primeira ação comercial.' }
  return { maxDays: index >= Math.max(1, total - 3) ? 5 : 7, requirePhone: index > 0, requireValue: index >= Math.max(2, total - 3), requireNextAction: true, preventSkipping: index > 1, confirmBackward: true, instructions: 'Registre o resultado da etapa e mantenha o próximo passo agendado.' }
}

export const effectiveStagePolicy = (recommended: PipelineStagePolicy, local?: Partial<PipelineStagePolicy>, shared?: Partial<PipelineStagePolicy>): PipelineStagePolicy => ({
  ...recommended,
  ...local,
  ...shared,
})

export const latestStageEntryAt = (lead: Lead, snapshot: Pick<WorkspaceSnapshot, 'activities'>) => {
  const latest = snapshot.activities
    .filter((item) => item.leadId === lead.id && item.type === 'stage_change')
    .map((item) => item.completedAt ?? item.createdAt)
    .filter((value): value is string => validDate(value) !== null)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  return latest ?? lead.createdAt
}

export const latestInteractionAt = (lead: Lead, snapshot: Pick<WorkspaceSnapshot, 'activities' | 'calls' | 'events'>) => {
  const dates: string[] = []
  for (const item of snapshot.activities) {
    if (item.leadId !== lead.id || item.type === 'stage_change' || !item.completedAt) continue
    dates.push(item.completedAt)
  }
  for (const item of snapshot.calls) if (item.leadId === lead.id) dates.push(item.endedAt ?? item.startedAt)
  for (const item of snapshot.events) if (item.leadId === lead.id && item.status === 'completed') dates.push(item.endsAt)
  return dates.filter((value) => validDate(value) !== null).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
}

export const expectedCloseState = (value: string | null | undefined, now = new Date()): ExpectedCloseState => {
  const timestamp = validDate(value)
  if (timestamp === null) return 'missing'
  const date = new Date(timestamp)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (date.getTime() < today) return 'overdue'
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return 'this_month'
  return 'future'
}

export const forecastMonthKey = (value: string | null | undefined) => {
  const timestamp = validDate(value)
  if (timestamp === null) return 'Sem previsão'
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(timestamp))
}

export const buildPipelineSignal = (lead: Lead, stage: PipelineStage | undefined, snapshot: Pick<WorkspaceSnapshot, 'activities' | 'calls' | 'events'>, policy: PipelineStagePolicy, now = new Date()): PipelineSignal => {
  const stageEnteredAt = latestStageEntryAt(lead, snapshot)
  const stageAge = elapsedDays(stageEnteredAt, now)
  const lastInteractionAt = latestInteractionAt(lead, snapshot)
  const closeState = expectedCloseState(lead.expectedCloseAt, now)
  const attempts = snapshot.calls.filter((item) => item.leadId === lead.id).length
  let health: PipelineHealth = 'healthy'
  let healthReason = `Dentro do prazo saudável de ${policy.maxDays} dia(s) desta etapa.`

  if (lead.status === 'active' && !lead.nextActionAt) {
    health = 'no_action'
    healthReason = 'Oportunidade ativa sem próxima ação definida.'
  } else if (lead.status === 'active' && lead.nextActionAt && new Date(lead.nextActionAt).getTime() < now.getTime()) {
    health = 'critical'
    healthReason = 'A próxima ação está vencida.'
  } else if (lead.status === 'active' && closeState === 'overdue') {
    health = 'critical'
    healthReason = 'A previsão de fechamento venceu e precisa ser revisada.'
  } else if (lead.status === 'active' && /proposta|orçamento/i.test(stage?.name ?? '') && stageAge > policy.maxDays) {
    health = 'proposal_stale'
    healthReason = `Proposta há ${stageAge} dia(s) sem avanço; o prazo saudável é ${policy.maxDays}.`
  } else if (lead.status === 'active' && stageAge > Math.max(policy.maxDays + 2, Math.round(policy.maxDays * 1.5))) {
    health = 'critical'
    healthReason = `${stageAge} dias nesta etapa; requer intervenção comercial.`
  } else if (lead.status === 'active' && stageAge > policy.maxDays) {
    health = 'attention'
    healthReason = `${stageAge} dias nesta etapa; o prazo saudável é ${policy.maxDays}.`
  }

  if (stage?.isWon) { health = 'healthy'; healthReason = 'Oportunidade ganha.' }
  return { stageEnteredAt, stageAge, lastInteractionAt, inactivityDays: lastInteractionAt ? elapsedDays(lastInteractionAt, now) : null, attempts, health, healthReason, expectedCloseState: closeState }
}
