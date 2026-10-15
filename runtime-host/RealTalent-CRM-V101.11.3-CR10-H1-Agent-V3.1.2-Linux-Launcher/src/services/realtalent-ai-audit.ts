import { safeStorage } from '../lib/storage'

export type AiAuditOutcome = 'success' | 'error' | 'blocked'
export interface RealTalentAiAuditEntry {
  id: string
  workspaceId: string
  providerId: string
  intent: string
  focusLeadId?: string
  route?: string
  toolIds: string[]
  outcome: AiAuditOutcome
  durationMs: number
  generatedAt: string
  note?: string
}

const key = (workspaceId: string) => `realtalent-ai:audit:${workspaceId}`

export const listRealTalentAiAudit = (workspaceId: string): RealTalentAiAuditEntry[] => {
  try {
    const raw = safeStorage.getItem(key(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 100) : []
  } catch { return [] }
}

export const appendRealTalentAiAudit = (entry: RealTalentAiAuditEntry) => {
  const current = listRealTalentAiAudit(entry.workspaceId)
  safeStorage.setItem(key(entry.workspaceId), JSON.stringify([entry, ...current].slice(0, 100)))
}

export const clearRealTalentAiAudit = (workspaceId: string) => safeStorage.removeItem(key(workspaceId))
