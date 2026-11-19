import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ functions: { invoke } }) }))

import { ProspectingProviderError, runProspectingProviderSearch } from './prospecting-provider-gateway'

const input = { workspaceId: 'ws-1', source: 'maps' as const, segment: 'Barbearia', city: 'Rio Grande, RS', query: '', quantity: 20 }

describe('gateway de prospecção · erros da Edge Function', () => {
  beforeEach(() => invoke.mockReset())

  it('mostra o motivo enviado pela função quando a cota gratuita do Google acabou', async () => {
    const context = new Response(JSON.stringify({ error: 'free_quota_reached', code: 'free_quota_reached', message: 'Cota gratuita do Google deste mês esgotada (950/950).' }), { status: 429 })
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context }) })
    const error = await runProspectingProviderSearch(input).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ProspectingProviderError)
    expect(error).toMatchObject({ code: 'free_quota_reached', status: 429, message: 'Cota gratuita do Google deste mês esgotada (950/950).' })
  })

  it('mantém a mensagem genérica quando a resposta não traz JSON', async () => {
    const context = new Response('Bad gateway', { status: 502 })
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context }) })
    await expect(runProspectingProviderSearch(input)).rejects.toMatchObject({ code: 'supabase_function_error', status: 502 })
  })
})
