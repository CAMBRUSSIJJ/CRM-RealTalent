import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_WORKSPACE } from '../domain/defaults'
import { loadSnapshotPatch } from '../services/snapshot-refresh'
import type { CrmRepository } from './crm-repository'
import { LOCAL_DATABASE_STORAGE_KEY, LocalCrmRepository } from './local-crm-repository'

describe('V101.5.3 snapshot refresh', () => {
  it('carrega somente os domínios solicitados e combina o patch uma vez', async () => {
    const repository = {
      listLeads: vi.fn(async () => []), listCompanies: vi.fn(async () => []), listContacts: vi.fn(async () => []),
      listContactRelationships: vi.fn(async () => []), listOpportunities: vi.fn(async () => []), listSocialProfiles: vi.fn(async () => []),
      listActivities: vi.fn(async () => []), listCalls: vi.fn(async () => []), listStages: vi.fn(async () => []),
    } as unknown as CrmRepository
    const patch = await loadSnapshotPatch(repository, 'workspace-1', ['commercial', 'activities'])
    expect(repository.listLeads).toHaveBeenCalledTimes(1)
    expect(repository.listActivities).toHaveBeenCalledTimes(1)
    expect(repository.listCalls).not.toHaveBeenCalled()
    expect(repository.listStages).not.toHaveBeenCalled()
    expect(patch).toMatchObject({ leads: [], activities: [], companies: [], contacts: [] })
  })
})

describe('V101.5.3 local/supabase parity contract', () => {
  beforeEach(() => localStorage.clear())

  it('mantém snapshot inicial de chamadas em 500 registros e pagina o restante sem resolver áudio', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const raw = JSON.parse(localStorage.getItem(LOCAL_DATABASE_STORAGE_KEY) || '{}')
    const base = Date.parse('2026-09-26T18:00:00.000Z')
    raw.calls = Array.from({ length: 520 }, (_, index) => ({
      id: `call-perf-${index}`, workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-alpha', contactId: null, userId: 'local-user',
      outcome: 'answered', durationSeconds: 30, notes: '', transcript: '', recordingPath: index === 0 ? 'indexeddb:call-perf-0' : null,
      recordingUrl: 'should-not-be-hydrated', consentAt: null, startedAt: new Date(base - index * 60_000).toISOString(), endedAt: new Date(base - index * 60_000 + 30_000).toISOString(), createdAt: new Date(base - index * 60_000).toISOString(),
    }))
    localStorage.setItem(LOCAL_DATABASE_STORAGE_KEY, JSON.stringify(raw))

    const initial = await repository.listCalls(DEMO_WORKSPACE.id)
    expect(initial).toHaveLength(500)
    expect(initial[0].recordingUrl).toBeNull()
    const older = await repository.listCallsPage(DEMO_WORKSPACE.id, initial.at(-1)?.startedAt ?? null, 200)
    expect(older).toHaveLength(20)
    expect(older[0].id).toBe('call-perf-500')
  })
})
