import { describe, expect, it } from 'vitest'
import { CALL_SESSION_SCHEMA_VERSION, callRecordingDraftKey, callSessionStorageKey, storedCallSessionMatchesScope } from './call-session-storage-v10151'

describe('call session scope V101.5.1', () => {
  it('isolates keys by workspace and user', () => {
    expect(callSessionStorageKey('a', 'u')).not.toBe(callSessionStorageKey('b', 'u'))
    expect(callSessionStorageKey('a', 'u')).not.toBe(callSessionStorageKey('a', 'v'))
    expect(callRecordingDraftKey('a', 'u', 'attempt-1')).not.toBe(callRecordingDraftKey('a', 'u', 'attempt-2'))
  })

  it('rejects recovery from a different scope', () => {
    const payload = { schemaVersion: CALL_SESSION_SCHEMA_VERSION, workspaceId: 'a', userId: 'u', leadId: 'lead' }
    expect(storedCallSessionMatchesScope(payload, 'a', 'u')).toBe(true)
    expect(storedCallSessionMatchesScope(payload, 'b', 'u')).toBe(false)
    expect(storedCallSessionMatchesScope(payload, 'a', 'v')).toBe(false)
  })
})
