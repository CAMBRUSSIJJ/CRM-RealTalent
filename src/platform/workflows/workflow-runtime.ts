import type { AutomationAction, AutomationCondition, AutomationRule } from '../../domain/types'
import { getSupabaseClient } from '../../lib/supabase'

export type WorkflowExecutionStatus = 'queued' | 'running' | 'waiting' | 'retrying' | 'succeeded' | 'failed' | 'cancelled'
export type WorkflowStepStatus = 'pending' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'skipped'
export type WorkflowStepType = 'action' | 'wait' | 'branch'

export interface WorkflowExecutionRecord {
  id: string
  workspaceId: string
  ruleId: string | null
  leadId: string | null
  triggerType: string
  entityId: string
  idempotencyKey: string
  correlationId: string
  status: WorkflowExecutionStatus
  currentStep: number
  attempts: number
  maxAttempts: number
  nextRunAt: string
  lastError: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkflowStepRunRecord {
  id: string
  workspaceId: string
  executionId: string
  stepIndex: number
  stepType: WorkflowStepType
  actionType: string | null
  status: WorkflowStepStatus
  attempt: number
  branchResult: boolean | null
  scheduledFor: string | null
  input: Record<string, unknown>
  output: Record<string, unknown>
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkflowRuntimeState {
  executions: WorkflowExecutionRecord[]
  steps: WorkflowStepRunRecord[]
}

export interface EnqueueWorkflowInput {
  workspaceId: string
  rule: AutomationRule
  triggerType: string
  entityId: string
  leadId: string | null
  idempotencyKey: string
  correlationId: string
  input?: Record<string, unknown>
  context?: Record<string, unknown>
}

const controlTypes = new Set<AutomationAction['type']>(['wait', 'branch_if'])

export const workflowRuntimeRequired = (rule: Pick<AutomationRule, 'actions'>) => rule.actions.some((action) => controlTypes.has(action.type))

export const workflowControlCondition = (action: AutomationAction): AutomationCondition | null => {
  if (action.type !== 'branch_if' || !action.branchField) return null
  return {
    id: `runtime-branch:${action.id}`,
    field: action.branchField,
    operator: action.branchOperator ?? 'equals',
    value: action.branchValue ?? '',
  }
}

export const workflowWaitMilliseconds = (action: AutomationAction) => {
  if (action.type !== 'wait') return 0
  const minutes = Math.max(0, Number(action.delayMinutes ?? 0))
  const hours = Math.max(0, Number(action.delayHours ?? 0))
  const days = Math.max(0, Number(action.delayDays ?? 0))
  return Math.round((minutes + hours * 60 + days * 24 * 60) * 60_000)
}

export const describeWorkflowControl = (action: AutomationAction) => {
  if (action.type === 'wait') {
    const parts = [
      action.delayDays ? `${action.delayDays}d` : '',
      action.delayHours ? `${action.delayHours}h` : '',
      action.delayMinutes ? `${action.delayMinutes}min` : '',
    ].filter(Boolean)
    return `Aguardar ${parts.join(' ') || '1 min'}`
  }
  if (action.type === 'branch_if') {
    return `Se ${action.branchField ?? 'campo'} ${action.branchOperator ?? 'equals'} ${action.branchValue ?? ''}; caso falso, pular ${Math.max(1, Number(action.branchSkip ?? 1))} etapa(s)`
  }
  return ''
}

const mapExecution = (row: Record<string, any>): WorkflowExecutionRecord => ({
  id: row.id,
  workspaceId: row.organization_id,
  ruleId: row.rule_id,
  leadId: row.lead_id,
  triggerType: row.trigger_type,
  entityId: row.entity_id,
  idempotencyKey: row.idempotency_key,
  correlationId: row.correlation_id,
  status: row.status,
  currentStep: Number(row.current_step ?? 0),
  attempts: Number(row.attempts ?? 0),
  maxAttempts: Number(row.max_attempts ?? 5),
  nextRunAt: row.next_run_at,
  lastError: row.last_error,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapStep = (row: Record<string, any>): WorkflowStepRunRecord => ({
  id: row.id,
  workspaceId: row.organization_id,
  executionId: row.execution_id,
  stepIndex: Number(row.step_index ?? 0),
  stepType: row.step_type,
  actionType: row.action_type,
  status: row.status,
  attempt: Number(row.attempt ?? 0),
  branchResult: typeof row.branch_result === 'boolean' ? row.branch_result : null,
  scheduledFor: row.scheduled_for,
  input: row.input && typeof row.input === 'object' ? row.input : {},
  output: row.output && typeof row.output === 'object' ? row.output : {},
  errorMessage: row.error_message,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export async function enqueueWorkflowExecution(input: EnqueueWorkflowInput) {
  const client = getSupabaseClient() as any
  if (!client) throw new Error('Workflow Runtime 3.0 requer o workspace cloud para continuar com o CRM fechado.')
  const { data, error } = await client.rpc('enqueue_workflow_execution', {
    p_organization_id: input.workspaceId,
    p_rule_id: input.rule.id,
    p_trigger_type: input.triggerType,
    p_entity_id: input.entityId,
    p_lead_id: input.leadId,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: input.correlationId,
    p_input: input.input ?? {},
    p_context: input.context ?? {},
  })
  if (error) throw new Error(`Não foi possível enfileirar o workflow: ${error.message}`)
  return String(data)
}

export async function loadWorkflowRuntime(workspaceId: string): Promise<WorkflowRuntimeState> {
  const client = getSupabaseClient() as any
  if (!client) return { executions: [], steps: [] }
  const { data: executions, error } = await client.from('workflow_executions').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(150)
  if (error) throw new Error(`Não foi possível carregar o runtime: ${error.message}`)
  const ids = (executions ?? []).map((item: any) => item.id)
  if (!ids.length) return { executions: [], steps: [] }
  const { data: steps, error: stepError } = await client.from('workflow_step_runs').select('*').eq('organization_id', workspaceId).in('execution_id', ids).order('step_index', { ascending: true }).limit(1000)
  if (stepError) throw new Error(`Não foi possível carregar as etapas do runtime: ${stepError.message}`)
  return { executions: (executions ?? []).map(mapExecution), steps: (steps ?? []).map(mapStep) }
}

export async function retryWorkflowExecution(executionId: string) {
  const client = getSupabaseClient() as any
  if (!client) throw new Error('A retomada persistente está disponível no workspace cloud.')
  const { error } = await client.rpc('retry_workflow_execution', { p_execution_id: executionId })
  if (error) throw new Error(`Não foi possível reprocessar o workflow: ${error.message}`)
}

export async function cancelWorkflowExecution(executionId: string) {
  const client = getSupabaseClient() as any
  if (!client) throw new Error('O cancelamento persistente está disponível no workspace cloud.')
  const { error } = await client.rpc('cancel_workflow_execution', { p_execution_id: executionId })
  if (error) throw new Error(`Não foi possível cancelar o workflow: ${error.message}`)
}

export function installWorkflowRuntimeInspector() {
  if (typeof window === 'undefined') return
  ;(window as Window & { __REALTALENT_WORKFLOWS__?: unknown }).__REALTALENT_WORKFLOWS__ = {
    version: '101.9.5',
    required: workflowRuntimeRequired,
    describe: (rule: AutomationRule) => rule.actions.map((action, index) => ({ index, type: action.type, control: controlTypes.has(action.type), description: describeWorkflowControl(action) })),
    load: loadWorkflowRuntime,
  }
}
