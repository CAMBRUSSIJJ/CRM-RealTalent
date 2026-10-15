import { safeStorage } from '../lib/storage'

const PREFIX = 'realtalent:agent-transactions:v32:'
const MAX_TRANSACTIONS = 40

export interface CrmAgentUndoOperation {
  kind: string
  entityId?: string
  before?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface CrmAgentTransaction {
  id: string
  workspaceId: string
  goal: string
  createdAt: string
  undoneAt: string | null
  operations: CrmAgentUndoOperation[]
}

const key = (workspaceId: string) => `${PREFIX}${workspaceId}`

export function loadCrmAgentTransactions(workspaceId: string): CrmAgentTransaction[] {
  if (!workspaceId) return []
  try {
    const parsed = JSON.parse(safeStorage.getItem(key(workspaceId)) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is CrmAgentTransaction => Boolean(item && typeof item === 'object' && typeof (item as CrmAgentTransaction).id === 'string'))
  } catch { return [] }
}

const save = (workspaceId: string, transactions: CrmAgentTransaction[]) => {
  safeStorage.setItem(key(workspaceId), JSON.stringify(transactions.slice(-MAX_TRANSACTIONS)))
}

export function recordCrmAgentTransaction(workspaceId: string, goal: string, operations: CrmAgentUndoOperation[]): CrmAgentTransaction | null {
  if (!workspaceId || !operations.length) return null
  const transaction: CrmAgentTransaction = {
    id: `agent-tx:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    goal: goal.trim().slice(0, 500),
    createdAt: new Date().toISOString(),
    undoneAt: null,
    operations,
  }
  save(workspaceId, [...loadCrmAgentTransactions(workspaceId), transaction])
  return transaction
}

export function lastUndoableCrmAgentTransaction(workspaceId: string): CrmAgentTransaction | null {
  return [...loadCrmAgentTransactions(workspaceId)].reverse().find((item) => !item.undoneAt && item.operations.length > 0) ?? null
}

export function markCrmAgentTransactionUndone(workspaceId: string, transactionId: string): void {
  const now = new Date().toISOString()
  save(workspaceId, loadCrmAgentTransactions(workspaceId).map((item) => item.id === transactionId ? { ...item, undoneAt: now } : item))
}
