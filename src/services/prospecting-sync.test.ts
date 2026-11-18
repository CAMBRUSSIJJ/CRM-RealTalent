import { afterEach, describe, expect, it, vi } from 'vitest'

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }))
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ from: () => ({ upsert }) }) }))
import { createProspect, flushProspectingSync, writeProspectingState } from './prospecting-workspace'

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('prospecting durable synchronization', () => {
  it('retains a failed write for retry and preserves a newer CRM receipt', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    const prospect = createProspect('qa-retry-workspace', { company:'Empresa QA', phone:'53999991234' }, 'maps')
    const state = { prospects:[prospect], history:[], lastExtensionSyncAt:null }
    upsert.mockResolvedValueOnce({error:new Error('temporary offline')}).mockResolvedValue({error:null})
    writeProspectingState('qa-retry-workspace', state)
    await expect(flushProspectingSync('qa-retry-workspace')).rejects.toThrow('temporary offline')
    const newer = { ...state, prospects:[{...prospect,status:'sent' as const,rawData:{...prospect.rawData,hostedCrmCompanyId:'company-qa'}}] }
    writeProspectingState('qa-retry-workspace', newer)
    await flushProspectingSync('qa-retry-workspace')
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[1][0][0]).toMatchObject({status:'sent',raw_data:{hostedCrmCompanyId:'company-qa'}})
  })
})
