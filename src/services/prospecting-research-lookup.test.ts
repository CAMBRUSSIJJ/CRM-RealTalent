import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
const state = vi.hoisted(() => ({ client: null as unknown, requests: [] as URL[], jobs: [] as Record<string, unknown>[] }))
vi.mock('../lib/env', () => ({ effectiveDataMode: 'supabase', env: {} }))
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => state.client }))
import { recentLocalResearch, localResearchVersion } from './prospecting-ai'
import { createProspect } from './prospecting-workspace'
const org = 'aaaaaaaa-0000-4000-8000-000000000001'
const id = 'aaaaaaaa-0000-4000-8000-000000000002'
const finalResult = { leads: [], warnings: [], researchedAt: '2026-11-15T20:00:00Z' }
beforeEach(() => {
  state.requests = []; state.jobs = []
  state.client = createClient('https://test.supabase.co', 'test-publishable-key', { auth: { persistSession: false }, global: {
    fetch: async (request) => {
      const url = new URL(String(request)); state.requests.push(url)
      // The fake PostgREST server only exposes this company's older job when
      // the request includes its entity filter before the row limit.
      const scoped = url.searchParams.get('input->>prospectId') === `eq.${id}`
      const legacy = url.searchParams.get('input->>segment') === 'eq.Fainer Barber' && url.searchParams.get('input->>city') === 'eq.Canoas'
      const rows = scoped || legacy ? state.jobs : Array.from({ length: 30 }, (_, n) => ({ id: `unrelated-${n}`, status: 'completed', input: { source: 'manual', segment: 'Outra empresa', city: 'Outra cidade' }, result: finalResult }))
      return new Response(JSON.stringify(url.searchParams.has('id') ? state.jobs[0] || null : rows), { headers: { 'content-type': 'application/json' } })
    },
  } })
})

describe('histórico de investigação por empresa', () => {
  it('recupera a investigação anterior mesmo depois de trinta trabalhos de outras empresas', async () => {
    state.jobs = [{ id: 'old-job', status: 'completed', result: finalResult, created_at: '2026-11-15T20:00:00Z',
      input: { source: 'manual', segment: 'Fainer Barber', city: 'Canoas', prospectId: id } }]
    expect((await recentLocalResearch(org, 'Fainer Barber', 'Canoas', '', id))?.id).toBe('old-job')
    expect(state.requests[0].searchParams.get('organization_id')).toBe(`eq.${org}`)
    expect(state.requests[0].searchParams.get('input->>prospectId')).toBe(`eq.${id}`)
  })
  it('mantém o vínculo pelo ID mesmo depois de corrigir o nome da empresa', async () => {
    state.jobs = [{ id: 'old-job', status: 'completed', result: finalResult, created_at: '2026-11-15T20:00:00Z',
      input: { source: 'manual', segment: 'Fainer Barber', city: 'Canoas', prospectId: id } }]
    expect((await recentLocalResearch(org, 'Fainer Barbearia', 'Canoas', '', id))?.id).toBe('old-job')
  })
  it('faz o recorte por empresa e cidade para conectores antigos sem prospectId', async () => {
    state.jobs = [{ id: 'legacy-job', status: 'completed', result: finalResult, created_at: '2026-11-15T20:00:00Z',
      input: { source: 'manual', segment: 'Fainer Barber', city: 'Canoas' } }]
    expect((await recentLocalResearch(org, 'Fainer Barber', 'Canoas'))?.id).toBe('legacy-job')
    expect(state.requests[0].searchParams.get('input->>segment')).toBe('eq.Fainer Barber')
    expect(state.requests[0].searchParams.get('input->>city')).toBe('eq.Canoas')
  })
  it('sinaliza uma pesquisa expirada como recuperável, sem declarar que foi concluída', async () => {
    state.jobs = [{ id: 'expired-job', status: 'processing', result: null, expires_at: '2020-01-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z',
      input: { source: 'manual', segment: 'Fainer Barber', city: 'Canoas', prospectId: id } }]
    const job = await recentLocalResearch(org, 'Fainer Barber', 'Canoas', '', id)
    expect(job?.recoverable).toBe(true)
    expect(job?.status).toBe('processing')
    expect(job?.result).toBe(null)
    expect(job?.progress).toMatchObject({ stage: 'completed', phaseStatus: 'failed' })
  })
  it('consulta uma versão exata da mesma empresa e organização, sem misturar homônimos', async () => {
    const row = { ...createProspect(org, { company: 'Fainer Barber', city: 'Canoas' }, 'manual', []), id }
    const run = 'bbbbbbbb-0000-4000-8000-000000000003'
    state.jobs = [{ input: { source: 'manual', segment: row.company, city: row.city, prospectId: id }, result: finalResult }]
    expect(await localResearchVersion(row, run)).toMatchObject({ executionId: run })
    expect(state.requests[0].searchParams.get('organization_id')).toBe(`eq.${org}`)
    expect(state.requests[0].searchParams.get('id')).toBe(`eq.${run}`)
    expect(state.requests[0].searchParams.get('status')).toBe('eq.completed')
    state.jobs[0].input = { source: 'manual', segment: row.company, city: row.city, prospectId: 'another-company' }
    expect(await localResearchVersion(row, run)).toBeNull()
    state.jobs[0].input = { source: 'manual', segment: row.company, city: row.city }
    expect(await localResearchVersion(row, run)).toMatchObject({ executionId: run })
    state.jobs[0].input = { source: 'manual', segment: 'Outra empresa', city: row.city }
    expect(await localResearchVersion(row, run)).toBeNull()
  })
})
