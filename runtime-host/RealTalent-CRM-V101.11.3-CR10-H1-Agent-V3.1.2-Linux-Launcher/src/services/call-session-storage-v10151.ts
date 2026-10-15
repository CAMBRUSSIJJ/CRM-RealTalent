export const CALL_SESSION_SCHEMA_VERSION = 2

const identityPart = (userId: string | null | undefined) => userId?.trim() || 'anonymous'

export const callSessionStorageKey = (workspaceId: string, userId: string | null | undefined) =>
  `realtalent:call-session:v101.5.1:${workspaceId}:${identityPart(userId)}`

export const callRecordingDraftKey = (workspaceId: string, userId: string | null | undefined, attemptId: string) =>
  `draft:call:v101.5.1:${workspaceId}:${identityPart(userId)}:${attemptId || 'pending'}`

export const storedCallSessionMatchesScope = (value: unknown, workspaceId: string, userId: string | null | undefined) => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.schemaVersion === CALL_SESSION_SCHEMA_VERSION
    && record.workspaceId === workspaceId
    && (record.userId ?? null) === (userId ?? null)
    && typeof record.leadId === 'string'
}
