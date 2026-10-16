import type { WorkspaceSnapshot } from '../domain/types'
import { safeStorage } from '../lib/storage'
import { loadWorkManagement } from './work-management'
import { loadNotificationUiState } from './notification-state'
import type { CrmAgentUndoOperation } from './realtalent-crm-agent-transactions'
import type { SnapshotSlice } from './snapshot-refresh'
import type { CrmCapabilityStepResult } from './realtalent-crm-capability-executor'
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'

const PREFIX = 'realtalent:agent-execution-receipts:v35:'
const MAX_RECEIPTS = 80

export type CrmExecutionEvidenceStatus = 'read' | 'verified' | 'acknowledged' | 'failed'
export type CrmExecutionReceiptStatus = 'verified' | 'partial' | 'failed' | 'rolled_back'

export interface CrmExecutionStepEvidence {
  stepId: string
  capabilityId: string
  title: string
  risk: CrmCapabilityPlanStep['risk']
  status: CrmExecutionEvidenceStatus
  summary: string
  checks: string[]
  entityId?: string
}

export interface CrmExecutionReceipt {
  id: string
  workspaceId: string
  planId: string
  goal: string
  repositoryMode: 'local' | 'supabase'
  startedAt: string
  completedAt: string
  status: CrmExecutionReceiptStatus
  uiRefresh: 'confirmed' | 'failed' | 'not_required'
  steps: CrmExecutionStepEvidence[]
  rollback?: { attempted: boolean; complete: boolean; failures: string[] }
  failure?: string
}

const key = (workspaceId: string) => `${PREFIX}${workspaceId}`
const readReceipts = (workspaceId: string): CrmExecutionReceipt[] => {
  try {
    const raw = JSON.parse(safeStorage.getItem(key(workspaceId)) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((item): item is CrmExecutionReceipt => Boolean(item && typeof item === 'object' && typeof (item as CrmExecutionReceipt).id === 'string')) : []
  } catch { return [] }
}

export const recordCrmExecutionReceipt = (receipt: CrmExecutionReceipt) => {
  safeStorage.setItem(key(receipt.workspaceId), JSON.stringify([...readReceipts(receipt.workspaceId), receipt].slice(-MAX_RECEIPTS)))
  return receipt
}

export const lastCrmExecutionReceipt = (workspaceId: string) => [...readReceipts(workspaceId)].reverse()[0] ?? null

const collectionForCapability = (snapshot: WorkspaceSnapshot, capabilityId: string): Array<{ id: string; [key: string]: unknown }> | null => {
  if (capabilityId.startsWith('contacts.')) return snapshot.contacts as any[]
  if (capabilityId.startsWith('companies.')) return snapshot.companies as any[]
  if (capabilityId.startsWith('leads.') || capabilityId.startsWith('pipeline.mark_') || capabilityId === 'pipeline.move') return snapshot.leads as any[]
  if (capabilityId.startsWith('pipeline.') && capabilityId.includes('stage')) return snapshot.stages as any[]
  if (capabilityId.startsWith('activities.')) return snapshot.activities as any[]
  if (capabilityId.startsWith('calendar.')) return snapshot.events as any[]
  if (capabilityId.startsWith('calls.')) return snapshot.calls as any[]
  if (capabilityId.startsWith('proposals.')) return snapshot.proposals as any[]
  if (capabilityId.startsWith('catalog.')) return snapshot.products as any[]
  if (capabilityId.startsWith('goals.')) return snapshot.goals as any[]
  if (capabilityId.startsWith('playbooks.')) return snapshot.playbooks as any[]
  if (capabilityId.startsWith('automations.')) return snapshot.automationRules as any[]
  if (capabilityId.startsWith('revenue.')) return snapshot.revenueEntries as any[]
  return null
}

const entityChanged = (before: WorkspaceSnapshot, after: WorkspaceSnapshot, capabilityId: string, entityId: string) => {
  const beforeRows = collectionForCapability(before, capabilityId)
  const afterRows = collectionForCapability(after, capabilityId)
  if (!beforeRows || !afterRows) return false
  const previous = beforeRows.find((item) => item.id === entityId)
  const current = afterRows.find((item) => item.id === entityId)
  if (!previous || !current) return false
  return JSON.stringify(previous) !== JSON.stringify(current)
}

const entityCreated = (before: WorkspaceSnapshot, after: WorkspaceSnapshot, capabilityId: string, entityId: string) => {
  const beforeRows = collectionForCapability(before, capabilityId)
  const afterRows = collectionForCapability(after, capabilityId)
  return Boolean(beforeRows && afterRows && !beforeRows.some((item) => item.id === entityId) && afterRows.some((item) => item.id === entityId))
}

const familyChanged = (before: WorkspaceSnapshot, after: WorkspaceSnapshot, capabilityId: string) => {
  const beforeRows = collectionForCapability(before, capabilityId)
  const afterRows = collectionForCapability(after, capabilityId)
  if (!beforeRows || !afterRows) return false
  return JSON.stringify(beforeRows) !== JSON.stringify(afterRows)
}

const familyCreated = (before: WorkspaceSnapshot, after: WorkspaceSnapshot, capabilityId: string) => {
  const beforeRows = collectionForCapability(before, capabilityId)
  const afterRows = collectionForCapability(after, capabilityId)
  return Boolean(beforeRows && afterRows && afterRows.length > beforeRows.length)
}

const familyDeleted = (before: WorkspaceSnapshot, after: WorkspaceSnapshot, capabilityId: string) => {
  const beforeRows = collectionForCapability(before, capabilityId)
  const afterRows = collectionForCapability(after, capabilityId)
  return Boolean(beforeRows && afterRows && afterRows.length < beforeRows.length)
}

export const executionTruthSlicesForCapability = (capabilityId: string): SnapshotSlice[] => {
  if (capabilityId.startsWith('contacts.') || capabilityId.startsWith('companies.') || capabilityId.startsWith('leads.')) return ['commercial']
  if (capabilityId.startsWith('pipeline.')) return ['commercial', 'stages']
  if (capabilityId.startsWith('activities.')) return ['commercial', 'activities']
  if (capabilityId.startsWith('calendar.')) return ['events']
  if (capabilityId.startsWith('calls.')) return ['commercial', 'calls']
  if (capabilityId.startsWith('proposals.')) return ['commercial', 'products', 'proposals', 'revenue']
  if (capabilityId.startsWith('catalog.')) return ['products', 'proposals']
  if (capabilityId.startsWith('goals.')) return ['goals']
  if (capabilityId.startsWith('playbooks.')) return ['playbooks']
  if (capabilityId.startsWith('automations.')) return ['automationRules', 'automationRuns']
  if (capabilityId.startsWith('revenue.')) return ['revenue']
  if (capabilityId === 'prospecting.send_to_crm') return ['commercial', 'stages', 'activities']
  if (capabilityId.startsWith('prospecting.')) return ['commercial']
  return []
}

export const executionTruthSlicesForPlan = (steps: CrmCapabilityPlanStep[]): SnapshotSlice[] => [...new Set(steps.flatMap((step) => executionTruthSlicesForCapability(step.capabilityId)))]

const executionTruthSlicesForUndoOperation = (operation: CrmAgentUndoOperation): SnapshotSlice[] => {
  if (operation.kind === 'task.delete' && typeof operation.metadata?.calendarEventId === 'string') return ['events']
  if (operation.kind.startsWith('contact.') || operation.kind.startsWith('company.') || operation.kind.startsWith('lead.')) return ['commercial']
  if (operation.kind.startsWith('stage.')) return ['stages']
  if (operation.kind.startsWith('activity.')) return ['activities']
  if (operation.kind.startsWith('call.')) return ['calls']
  if (operation.kind.startsWith('calendar.')) return ['events']
  if (operation.kind.startsWith('proposal.')) return ['proposals']
  if (operation.kind.startsWith('product.')) return ['products']
  if (operation.kind.startsWith('goal.')) return ['goals']
  if (operation.kind.startsWith('playbook.')) return ['playbooks']
  if (operation.kind.startsWith('automation.')) return ['automationRules']
  if (operation.kind.startsWith('revenue.')) return ['revenue']
  return []
}

export const executionTruthSlicesForUndoOperations = (operations: CrmAgentUndoOperation[]): SnapshotSlice[] => [...new Set(operations.flatMap(executionTruthSlicesForUndoOperation))]

const undoCollection = (snapshot: WorkspaceSnapshot, operationKind: string): Array<{ id: string; [key: string]: unknown }> | null => {
  if (operationKind.startsWith('contact.')) return snapshot.contacts as any[]
  if (operationKind.startsWith('company.')) return snapshot.companies as any[]
  if (operationKind.startsWith('lead.')) return snapshot.leads as any[]
  if (operationKind.startsWith('stage.')) return snapshot.stages as any[]
  if (operationKind.startsWith('activity.')) return snapshot.activities as any[]
  if (operationKind.startsWith('call.')) return snapshot.calls as any[]
  if (operationKind.startsWith('calendar.')) return snapshot.events as any[]
  if (operationKind.startsWith('proposal.')) return snapshot.proposals as any[]
  if (operationKind.startsWith('product.')) return snapshot.products as any[]
  if (operationKind.startsWith('goal.')) return snapshot.goals as any[]
  if (operationKind.startsWith('playbook.')) return snapshot.playbooks as any[]
  if (operationKind.startsWith('automation.')) return snapshot.automationRules as any[]
  if (operationKind.startsWith('revenue.')) return snapshot.revenueEntries as any[]
  return null
}

const matchesUndoBefore = (row: Record<string, unknown>, before: Record<string, unknown>) => Object.entries(before).every(([field, expected]) => JSON.stringify(row[field]) === JSON.stringify(expected))
const stepArg = (step: CrmCapabilityPlanStep, name: string) => step.args.find((item) => item.name === name)?.value.trim() ?? ''
const normalizeGoalMetricForTruth = (value: string) => {
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const aliases: Record<string, string> = {
    call: 'calls', calls: 'calls', ligacao: 'calls', ligacoes: 'calls',
    contact: 'contacts', contacts: 'contacts', contato: 'contacts', contatos: 'contacts',
    followup: 'followups', followups: 'followups', 'follow-up': 'followups', 'follow-ups': 'followups',
    meeting: 'meetings', meetings: 'meetings', reuniao: 'meetings', reunioes: 'meetings',
    proposal: 'proposals', proposals: 'proposals', proposta: 'proposals', propostas: 'proposals',
    win: 'wins', wins: 'wins', venda: 'wins', vendas: 'wins',
    revenue: 'revenue', receita: 'revenue',
    new_leads: 'new_leads', 'novos leads': 'new_leads',
  }
  return aliases[key] || key
}

export async function verifyCrmUndoExecution(
  operation: CrmAgentUndoOperation,
  after: WorkspaceSnapshot,
  context: CrmExecutionTruthContext,
): Promise<CrmExecutionStepEvidence> {
  const evidence: CrmExecutionStepEvidence = {
    stepId: `undo:${operation.kind}:${operation.entityId || 'state'}`,
    capabilityId: 'agent.undo_last',
    title: `Desfazer ${operation.kind}`,
    risk: 'low',
    status: 'acknowledged',
    summary: `Operação ${operation.kind} executada.`,
    checks: [],
    ...(operation.entityId ? { entityId: operation.entityId } : {}),
  }

  if (operation.kind === 'notifications.replace_dismissed') {
    const expected = Array.isArray(operation.metadata?.dismissedIds) ? operation.metadata!.dismissedIds.map(String).sort() : []
    const current = loadNotificationUiState(context.workspaceId).dismissedIds.map(String).sort()
    if (JSON.stringify(expected) === JSON.stringify(current)) {
      evidence.status = 'verified'
      evidence.checks.push('Estado das notificações foi relido e corresponde exatamente ao estado anterior.')
    } else evidence.checks.push('O estado local das notificações não corresponde ao estado anterior esperado.')
    return evidence
  }

  if (operation.kind.startsWith('task.')) {
    const work = await loadWorkManagement(context.repositoryMode, context.workspaceId)
    const task = operation.entityId ? work.tasks.find((item) => item.id === operation.entityId) : undefined
    if (operation.kind === 'task.delete' && operation.entityId && !task) {
      const calendarEventId = typeof operation.metadata?.calendarEventId === 'string' ? operation.metadata.calendarEventId : ''
      if (calendarEventId && after.events.some((item) => item.id === calendarEventId)) {
        evidence.checks.push('A tarefa foi removida, mas o compromisso sincronizado ainda aparece na Agenda.'); return evidence
      }
      evidence.status = 'verified'
      evidence.checks.push(calendarEventId ? 'A tarefa e o compromisso sincronizado foram relidos como removidos.' : 'A tarefa criada pela Agent não existe mais no Work Management.')
      return evidence
    }
    if (operation.kind === 'task.status' && task && String(task.status) === String(operation.before?.status || 'todo')) {
      evidence.status = 'verified'; evidence.checks.push('A tarefa foi relida com o status anterior restaurado.'); return evidence
    }
    evidence.checks.push('O serviço de tarefas foi relido, mas o estado anterior não pôde ser confirmado.')
    return evidence
  }

  const rows = undoCollection(after, operation.kind)
  if (rows && operation.entityId) {
    const row = rows.find((item) => item.id === operation.entityId)
    if (operation.kind.endsWith('.delete') && !row) {
      evidence.status = 'verified'; evidence.checks.push('A entidade criada pela Agent não existe mais após o Undo.'); return evidence
    }
    if (row && operation.before && matchesUndoBefore(row, operation.before)) {
      evidence.status = 'verified'; evidence.checks.push('A entidade foi relida com os campos anteriores restaurados.'); return evidence
    }
    evidence.checks.push('O repositório foi relido, mas o estado anterior da entidade não foi confirmado integralmente.')
    return evidence
  }

  if (operation.kind === 'invite.revoke' || operation.kind === 'member.role') {
    evidence.checks.push('O executor de Equipes concluiu, mas esta operação ainda não possui readback independente no snapshot progressivo.')
    return evidence
  }

  evidence.checks.push('O executor de Undo concluiu, mas esta operação ainda não possui verificador específico de estado posterior.')
  return evidence
}

export interface CrmExecutionTruthContext {
  workspaceId: string
  repositoryMode: 'local' | 'supabase'
  uiRefreshConfirmed: boolean
}

export async function verifyCrmCapabilityExecution(
  step: CrmCapabilityPlanStep,
  result: CrmCapabilityStepResult,
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
  context: CrmExecutionTruthContext,
): Promise<CrmExecutionStepEvidence> {
  const base: CrmExecutionStepEvidence = {
    stepId: step.id,
    capabilityId: step.capabilityId,
    title: step.title,
    risk: step.risk,
    status: step.risk === 'read' ? 'read' : 'acknowledged',
    summary: result.summary,
    checks: [],
    ...(result.undo?.entityId ? { entityId: result.undo.entityId } : {}),
  }

  if (step.risk === 'read') {
    base.checks.push('Consulta/navegação concluída sem mutação de dados.')
    return base
  }

  if (!context.uiRefreshConfirmed) {
    base.checks.push('Executor respondeu, mas a atualização da interface não foi confirmada.')
    return base
  }
  base.checks.push('Snapshot do repositório foi relido e aplicado à interface.')

  if (step.capabilityId.startsWith('tasks.')) {
    const work = await loadWorkManagement(context.repositoryMode, context.workspaceId)
    const taskId = result.undo?.entityId
    if (step.capabilityId === 'tasks.create' && taskId && work.tasks.some((item) => item.id === taskId)) {
      base.status = 'verified'; base.checks.push('Tarefa encontrada novamente no Work Management após a gravação.'); return base
    }
    if (step.capabilityId === 'tasks.complete' && taskId && work.tasks.some((item) => item.id === taskId && item.status === 'completed')) {
      base.status = 'verified'; base.checks.push('Tarefa relida com status concluído.'); return base
    }
    if (step.capabilityId === 'tasks.delete') {
      base.status = 'verified'; base.checks.push('Exclusão concluída pelo serviço nativo de tarefas; a coleção foi recarregada.'); return base
    }
  }

  if (step.capabilityId === 'goals.create') {
    const entityId = result.undo?.entityId
    const created = entityId ? after.goals.find((goal) => goal.id === entityId) : undefined
    const expectedMetric = normalizeGoalMetricForTruth(stepArg(step, 'metric'))
    const expectedTarget = Number(stepArg(step, 'target_value'))
    const expectedStart = stepArg(step, 'period_start')
    const expectedEnd = stepArg(step, 'period_end')
    const exactMatch = Boolean(
      created
      && entityId
      && entityCreated(before, after, step.capabilityId, entityId)
      && created.metric === expectedMetric
      && Number(created.targetValue) === expectedTarget
      && created.periodStart === expectedStart
      && created.periodEnd === expectedEnd
    )
    if (exactMatch) {
      base.status = 'verified'
      base.checks.push(`Meta relida com métrica, valor e período exatos: ${expectedMetric} · ${expectedTarget} · ${expectedStart}${expectedStart === expectedEnd ? '' : ` até ${expectedEnd}`}.`)
      return base
    }
    base.checks.push('A meta pode ter sido persistida, mas métrica, valor ou período não correspondem exatamente ao plano executado; conclusão total não foi declarada.')
    return base
  }

  if (result.evidence?.source === 'gateway') {
    base.status = 'verified'
    base.entityId = result.evidence.entityId || base.entityId
    base.checks.push(`Gateway confirmou o evento${result.evidence.state ? ` no estado ${result.evidence.state}` : ''}.`)
    return base
  }
  if (result.evidence?.source === 'local_state' || result.evidence?.source === 'prospecting_state' || result.evidence?.source === 'repository') {
    base.status = result.evidence.state === 'running' ? 'acknowledged' : 'verified'
    base.entityId = result.evidence.entityId || base.entityId
    base.checks.push(result.evidence.detail || `Estado ${result.evidence.source} confirmado após a operação.`)
    return base
  }

  const entityId = result.undo?.entityId
  const undoKind = result.undo?.kind ?? ''
  if (entityId && /\.delete$/.test(undoKind) && entityCreated(before, after, step.capabilityId, entityId)) {
    base.status = 'verified'; base.checks.push('Entidade criada foi relida pelo ID no repositório.'); return base
  }
  if (entityId && /\.(update|move|status|toggle)$/.test(undoKind) && entityChanged(before, after, step.capabilityId, entityId)) {
    base.status = 'verified'; base.checks.push('Entidade foi relida e a versão persistida mudou.'); return base
  }

  if (step.capabilityId.endsWith('.create') && familyCreated(before, after, step.capabilityId)) {
    base.status = 'verified'; base.checks.push('A coleção persistida aumentou após a criação.'); return base
  }
  if (step.capabilityId.endsWith('.delete') && familyDeleted(before, after, step.capabilityId)) {
    base.status = 'verified'; base.checks.push('A coleção persistida diminuiu após a exclusão.'); return base
  }
  if ((step.capabilityId.includes('.update') || step.capabilityId.includes('.mark_') || step.capabilityId === 'pipeline.move' || step.capabilityId === 'proposals.make_official' || step.capabilityId === 'proposals.close_opportunity') && familyChanged(before, after, step.capabilityId)) {
    base.status = 'verified'; base.checks.push('A coleção persistida foi relida com alteração efetiva.'); return base
  }
  if (step.capabilityId === 'prospecting.send_to_crm' && after.leads.length > before.leads.length) {
    base.status = 'verified'; base.checks.push('Novos registros comerciais foram relidos após a conversão do Garimpo.'); return base
  }

  base.checks.push('O executor nativo concluiu sem erro, mas esta capability ainda não possui prova de leitura posterior suficiente para declarar conclusão verificada.')
  return base
}

export const receiptStatusFromEvidence = (steps: CrmExecutionStepEvidence[]): CrmExecutionReceiptStatus => {
  const writes = steps.filter((item) => item.risk !== 'read')
  if (!writes.length) return 'verified'
  return writes.every((item) => item.status === 'verified') ? 'verified' : 'partial'
}

export const receiptLabel = (receipt: CrmExecutionReceipt) => receipt.status === 'verified'
  ? 'Concluído e verificado no CRM'
  : receipt.status === 'rolled_back'
    ? 'Falha detectada e alterações revertidas'
    : receipt.status === 'failed'
      ? 'Execução não confirmada'
      : 'Executado com verificação parcial'