import type { Lead, WorkspaceSnapshot } from '../domain/types'

export type IntegritySeverity = 'error' | 'warning' | 'info'

export interface IntegrityIssue {
  code: string
  severity: IntegritySeverity
  label: string
  detail: string
  entityIds: string[]
}

export interface IntegrityReport {
  checkedAt: string
  score: number
  errors: number
  warnings: number
  issues: IntegrityIssue[]
  counts: {
    stages: number
    leads: number
    activities: number
    calls: number
    events: number
    goals: number
    automations: number
  }
}

const normalizePhone = (value: string) => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
const normalizeText = (value: string) => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const isInvalidDate = (value: string | null | undefined) => Boolean(value && Number.isNaN(new Date(value).getTime()))

const duplicateGroups = (leads: Lead[], keyOf: (lead: Lead) => string, minimumLength: number) => {
  const groups = new Map<string, Lead[]>()
  for (const lead of leads) {
    const key = keyOf(lead)
    if (key.length < minimumLength) continue
    groups.set(key, [...(groups.get(key) ?? []), lead])
  }
  return [...groups.values()].filter((group) => group.length > 1)
}

export function inspectWorkspaceIntegrity(snapshot: WorkspaceSnapshot): IntegrityReport {
  const issues: IntegrityIssue[] = []
  const stageById = new Map(snapshot.stages.map((stage) => [stage.id, stage]))
  const leadById = new Map(snapshot.leads.map((lead) => [lead.id, lead]))

  const add = (issue: IntegrityIssue) => issues.push(issue)

  const invalidStages = snapshot.stages.filter((stage) => stage.isWon && stage.isLost)
  if (invalidStages.length) add({
    code: 'stage_conflicting_status', severity: 'error', label: 'Etapas com status conflitante',
    detail: `${invalidStages.length} etapa(s) estão marcadas como ganha e perdida ao mesmo tempo.`, entityIds: invalidStages.map((stage) => stage.id),
  })

  const orphanLeads = snapshot.leads.filter((lead) => !stageById.has(lead.stageId))
  if (orphanLeads.length) add({
    code: 'lead_without_stage', severity: 'error', label: 'Leads fora do Pipeline',
    detail: `${orphanLeads.length} lead(s) apontam para uma etapa inexistente.`, entityIds: orphanLeads.map((lead) => lead.id),
  })

  const statusMismatch = snapshot.leads.filter((lead) => {
    const stage = stageById.get(lead.stageId)
    if (!stage) return false
    const expected = stage.isWon ? 'won' : stage.isLost ? 'lost' : 'active'
    return lead.status !== expected && lead.status !== 'archived'
  })
  if (statusMismatch.length) add({
    code: 'lead_stage_status_mismatch', severity: 'warning', label: 'Status divergente do Pipeline',
    detail: `${statusMismatch.length} lead(s) têm status diferente da etapa atual.`, entityIds: statusMismatch.map((lead) => lead.id),
  })

  const orphanActivities = snapshot.activities.filter((activity) => activity.leadId && !leadById.has(activity.leadId))
  if (orphanActivities.length) add({
    code: 'orphan_activity', severity: 'warning', label: 'Atividades sem lead',
    detail: `${orphanActivities.length} atividade(s) apontam para leads removidos.`, entityIds: orphanActivities.map((activity) => activity.id),
  })

  const orphanCalls = snapshot.calls.filter((call) => !leadById.has(call.leadId))
  if (orphanCalls.length) add({
    code: 'orphan_call', severity: 'error', label: 'Ligações sem lead',
    detail: `${orphanCalls.length} ligação(ões) apontam para leads inexistentes.`, entityIds: orphanCalls.map((call) => call.id),
  })

  const orphanEvents = snapshot.events.filter((event) => event.leadId && !leadById.has(event.leadId))
  if (orphanEvents.length) add({
    code: 'orphan_event', severity: 'warning', label: 'Eventos sem lead',
    detail: `${orphanEvents.length} compromisso(s) apontam para leads removidos.`, entityIds: orphanEvents.map((event) => event.id),
  })

  const invalidEvents = snapshot.events.filter((event) => isInvalidDate(event.startsAt) || isInvalidDate(event.endsAt) || new Date(event.endsAt).getTime() < new Date(event.startsAt).getTime())
  if (invalidEvents.length) add({
    code: 'invalid_event_range', severity: 'error', label: 'Horários inválidos na Agenda',
    detail: `${invalidEvents.length} compromisso(s) possuem datas inválidas ou término anterior ao início.`, entityIds: invalidEvents.map((event) => event.id),
  })

  const invalidActivities = snapshot.activities.filter((activity) => isInvalidDate(activity.dueAt) || isInvalidDate(activity.completedAt))
  if (invalidActivities.length) add({
    code: 'invalid_activity_date', severity: 'warning', label: 'Datas inválidas em atividades',
    detail: `${invalidActivities.length} atividade(s) possuem datas que não podem ser interpretadas.`, entityIds: invalidActivities.map((activity) => activity.id),
  })

  const phoneDuplicates = duplicateGroups(snapshot.leads, (lead) => normalizePhone(lead.phone), 10)
  if (phoneDuplicates.length) add({
    code: 'duplicate_phone', severity: 'warning', label: 'Possíveis leads duplicados por telefone',
    detail: `${phoneDuplicates.length} grupo(s) compartilham o mesmo telefone.`, entityIds: phoneDuplicates.flatMap((group) => group.map((lead) => lead.id)),
  })

  const emailDuplicates = duplicateGroups(snapshot.leads, (lead) => normalizeText(lead.email), 5)
  if (emailDuplicates.length) add({
    code: 'duplicate_email', severity: 'warning', label: 'Possíveis leads duplicados por e-mail',
    detail: `${emailDuplicates.length} grupo(s) compartilham o mesmo e-mail.`, entityIds: emailDuplicates.flatMap((group) => group.map((lead) => lead.id)),
  })

  const nameCityDuplicates = duplicateGroups(snapshot.leads, (lead) => {
    const name = normalizeText(lead.company || lead.name)
    const city = normalizeText(lead.city)
    return name && city ? `${name}|${city}` : ''
  }, 5)
  if (nameCityDuplicates.length) add({
    code: 'duplicate_name_city', severity: 'info', label: 'Registros semelhantes por empresa e cidade',
    detail: `${nameCityDuplicates.length} grupo(s) merecem revisão antes de novas importações.`, entityIds: nameCityDuplicates.flatMap((group) => group.map((lead) => lead.id)),
  })

  const rulesWithoutActions = snapshot.automationRules.filter((rule) => !rule.actions.length)
  if (rulesWithoutActions.length) add({
    code: 'automation_without_actions', severity: 'error', label: 'Automações sem ações',
    detail: `${rulesWithoutActions.length} automação(ões) não possuem nenhuma ação configurada.`, entityIds: rulesWithoutActions.map((rule) => rule.id),
  })

  const invalidGoals = snapshot.goals.filter((goal) => goal.targetValue <= 0 || goal.periodEnd < goal.periodStart)
  if (invalidGoals.length) add({
    code: 'invalid_goal', severity: 'warning', label: 'Metas inválidas',
    detail: `${invalidGoals.length} meta(s) possuem alvo ou período inválido.`, entityIds: invalidGoals.map((goal) => goal.id),
  })

  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  const score = Math.max(0, 100 - (errors * 18) - (warnings * 7) - (issues.filter((issue) => issue.severity === 'info').length * 2))

  return {
    checkedAt: new Date().toISOString(), score, errors, warnings, issues,
    counts: {
      stages: snapshot.stages.length, leads: snapshot.leads.length, activities: snapshot.activities.length,
      calls: snapshot.calls.length, events: snapshot.events.length, goals: snapshot.goals.length,
      automations: snapshot.automationRules.length,
    },
  }
}
