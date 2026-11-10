import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('../lib/env', () => ({ effectiveDataMode: 'supabase', env: { supabaseUrl: 'https://crm.example.com', supabasePublishableKey: 'public' } }))
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => {
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.maybeSingle }
  return { functions: { invoke: mocks.invoke }, from: () => query }
} }))
import { searchProspectsWithAi } from './prospecting-ai'

const input = { organizationId: 'aaaaaaaa-0000-4000-8000-000000000001', segment: 'Barbearias', city: 'Canoas', query: '', source: 'maps' as const, limit: 5, execution: 'local' as const }
const result = { leads: [], warnings: ['Sem fontes'], researchedAt: '2026-11-10T15:00:00.000Z' }
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

describe('cliente do conector de Garimpo', () => {
  it('aguarda o trabalho local e devolve o resultado publicado na fila', async () => {
    vi.useFakeTimers()
    mocks.invoke.mockImplementation(async (name: string) => ({ data: name === 'prospecting-search' ? { jobId: 'job-1' } : { cancelled: true }, error: null }))
    mocks.maybeSingle.mockResolvedValue({ data: { status: 'completed', result }, error: null })
    const pending = searchProspectsWithAi(input)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toEqual(result)
    expect(mocks.invoke).toHaveBeenCalledWith('prospecting-search', { body: input, signal: undefined })
    expect(mocks.invoke).toHaveBeenCalledWith('prospecting-local-connector', { body: { organizationId: input.organizationId, action: 'cancel', jobId: 'job-1' } })
  })

  it('cancela a espera e pede o cancelamento do trabalho remoto', async () => {
    vi.useFakeTimers()
    mocks.invoke.mockResolvedValue({ data: { jobId: 'job-1' }, error: null })
    const controller = new AbortController()
    const pending = searchProspectsWithAi(input, controller.signal)
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(1)
    controller.abort()
    await rejection
    expect(mocks.maybeSingle).not.toHaveBeenCalled()
    expect(mocks.invoke).toHaveBeenCalledWith('prospecting-local-connector', expect.objectContaining({ body: expect.objectContaining({ action: 'cancel' }) }))
  })

  it('mostra a necessidade de iniciar o computador sem criar uma pesquisa fictícia', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: 'local_connector_offline' }) } } })
    await expect(searchProspectsWithAi(input)).rejects.toThrow('Inicie o conector local')
    expect(mocks.maybeSingle).not.toHaveBeenCalled()
  })
})
