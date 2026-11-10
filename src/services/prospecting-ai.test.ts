import { describe, expect, it, vi } from 'vitest'
import { createProspect, readProspectingState, writeProspectingState, type ProspectingState } from './prospecting-workspace'
import { aiResearchNotes, applyAiDiscovery, applyAiEnrichment, prospectIdentityKeys, searchProspectsWithAi } from './prospecting-ai'
import { createProspectingAiHandler, parseAiSearchInput, ProspectingError, sanitizeAiResult, type AiSearchResult } from '../../supabase/functions/_shared/prospecting-ai'
import { createFirecrawlResearch } from '../../supabase/functions/_shared/firecrawl-research'

const organizationId = 'aaaaaaaa-0000-4000-8000-000000000001'
const input = { organizationId, segment: 'Barbearias', city: 'Canoas', query: '', source: 'maps' as const, limit: 5 }
const url = 'https://alpha.com.br/'
const report = 'Alpha Barbearia Canoas (51) 99999-1001 contato@alpha.com.br 11.222.333/0001-81 https://alpha.com.br/'
const raw = { leads: [{ facts: [
  { field: 'company', value: 'Alpha Barbearia', sourceUrl: url }, { field: 'city', value: 'Canoas', sourceUrl: url },
  { field: 'phone', value: '(51) 99999-1001', sourceUrl: url }, { field: 'email', value: 'contato@alpha.com.br', sourceUrl: url },
  { field: 'cnpj', value: '11.222.333/0001-81', sourceUrl: url }, { field: 'website', value: url, sourceUrl: url },
], opportunity: 'Verificar como organiza os agendamentos.', suggestedApproach: 'Perguntar sobre o processo atual.' }] }
const result = () => sanitizeAiResult(raw, [{ url, title: 'Alpha', content: report }], report, 5, '2026-11-10T15:00:00.000Z')
const blank = (): ProspectingState => ({ prospects: [], history: [], lastExtensionSyncAt: null })

describe('Garimpo com IA e fontes', () => {
  it('mantém somente dados presentes na fonte correspondente, validando CNPJ e URLs', () => {
    const value = structuredClone(raw)
    value.leads[0].facts.push(
      { field: 'instagram', value: '@inventado', sourceUrl: url },
      { field: 'bookingUrl', value: 'javascript:alert(1)', sourceUrl: url },
      { field: 'systemName', value: 'Alpha', sourceUrl: 'https://outra.com.br/' },
    )
    const output = sanitizeAiResult(value, [{ url, title: 'Alpha', content: report }], report, 5)
    expect(output.leads[0]).toMatchObject({ company: 'Alpha Barbearia', cnpj: '11.222.333/0001-81', instagram: '', bookingUrl: '', systemName: '', whatsappUrl: '' })
    expect(output.leads[0].aiResearch.missingFields).toContain('whatsappUrl')
    expect(output.leads[0].aiResearch.sources).toEqual([{ url, title: 'Alpha' }])
    expect(output.warnings).toHaveLength(1)
  })

  it('não atribui dado de outra página a uma empresa e não cria leads sem fonte', () => {
    expect(sanitizeAiResult(raw, [{ url, title: 'Alpha', content: 'Outra empresa' }], report, 5).leads).toEqual([])
    expect(sanitizeAiResult(raw, [], report, 5).leads).toEqual([])
    expect(sanitizeAiResult({ leads: null }, [], '', 5).leads).toEqual([])
  })

  it('não importa duas vezes e persiste fontes após recarregar o Garimpo', () => {
    const first = applyAiDiscovery(blank(), result(), organizationId, 'maps', [])
    const second = applyAiDiscovery(first, result(), organizationId, 'maps', [])
    expect(second.prospects).toHaveLength(1)
    expect(second.prospects[0].status).toBe('review')
    expect(second.history[0].description).toContain('1 repetido(s)')
    writeProspectingState(organizationId, second)
    const restored = readProspectingState(organizationId)
    expect(restored.prospects[0].rawData.aiResearch).toEqual(result().leads[0].aiResearch)
    expect(aiResearchNotes(restored.prospects[0])).toContain(`Fonte: ${url}`)
  })

  it('normaliza DDI brasileiro e não confunde contatos sem identidade', () => {
    const a = createProspect(organizationId, { company: 'Alpha', phone: '+55 51 99999-1001' })
    const b = createProspect(organizationId, { company: 'Beta', phone: '(51) 99999-1001' })
    expect(prospectIdentityKeys(a)).toContain(prospectIdentityKeys(b).find((key) => key.startsWith('phone:')))
    expect(prospectIdentityKeys({ company: '', city: '', phone: '', cnpj: '', instagram: '', website: '' })).toEqual([])
  })

  it('enriquece somente campos vazios e preserva status e revisão humana', () => {
    const prospect = { ...createProspect(organizationId, { company: 'Alpha Barbearia', city: 'Canoas', email: 'revisado@alpha.com.br' }), status: 'approved' as const, notes: 'Revisão humana' }
    const updated = applyAiEnrichment(prospect, result(), [])
    expect(updated).toMatchObject({ email: 'revisado@alpha.com.br', phone: '(51) 99999-1001', status: 'approved', notes: 'Revisão humana' })
    expect(() => applyAiEnrichment({ ...prospect, company: 'Outra empresa', city: 'Outra cidade' }, result(), [])).toThrow('identidade compatível')
  })

  it('rejeita limites e organizações inválidas antes de chamar serviços', () => {
    for (const patch of [{ limit: 100 }, { limit: 1.5 }, { limit: '5' }, { organizationId: '../outra' }, { city: '' }, { source: 'foo' }]) expect(() => parseAiSearchInput({ ...input, ...patch })).toThrow()
    expect(parseAiSearchInput(input)).toEqual(input)
  })

  it('exige Supabase e nunca simula resultados no modo local', async () => {
    await expect(searchProspectsWithAi(input)).rejects.toThrow('modo local')
  })
})

describe('endpoint do Garimpo', () => {
  const request = (body: unknown = input, token = 'Bearer test') => new Request('https://crm.com/prospecting-search', { method: 'POST', headers: { authorization: token }, body: JSON.stringify(body) })

  it('bloqueia chamadas sem login e acesso a outro workspace antes de pesquisar', async () => {
    const search = vi.fn(), authorize = vi.fn().mockRejectedValue(new ProspectingError('workspace_forbidden', 403))
    const handler = createProspectingAiHandler({ authorize, configured: () => true, search })
    expect((await handler(request(input, ''))).status).toBe(401)
    expect(authorize).not.toHaveBeenCalled()
    expect((await handler(request())).status).toBe(403)
    expect(search).not.toHaveBeenCalled()
  })

  it('responde a preflight e valida limite sem consumir IA', async () => {
    const search = vi.fn(), authorize = vi.fn()
    const handler = createProspectingAiHandler({ authorize, configured: () => true, search })
    const options = await handler(new Request('https://crm.com', { method: 'OPTIONS' }))
    expect(options.status).toBe(204)
    expect(options.headers.get('access-control-allow-headers')).toContain('x-client-info')
    expect((await handler(request({ ...input, limit: 11 }))).status).toBe(400)
    expect(authorize).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it('informa configuração ausente e não expõe erros ou segredos do provedor', async () => {
    const search = vi.fn().mockRejectedValue(new Error('Authorization: secret-key'))
    const handler = createProspectingAiHandler({ authorize: async () => {}, configured: () => false, search })
    expect((await handler(request())).status).toBe(503)
    expect(search).not.toHaveBeenCalled()
    const failure = await createProspectingAiHandler({ authorize: async () => {}, configured: () => true, search })(request())
    expect(failure.status).toBe(502)
    expect(await failure.text()).not.toContain('secret-key')
  })

  it('retorna dados e fontes de uma pesquisa autorizada', async () => {
    const search = vi.fn().mockResolvedValue(result())
    const response = await createProspectingAiHandler({ authorize: async () => {}, configured: () => true, search })(request())
    expect(response.status).toBe(200)
    const data = await response.json() as AiSearchResult
    const state = applyAiDiscovery(blank(), data, organizationId, 'maps', [])
    expect(state.prospects[0].phone).toBe('(51) 99999-1001')
    expect(state.prospects[0].rawData.aiResearch).toEqual(data.leads[0].aiResearch)
    expect(search.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
  })
})

describe('coleta com Firecrawl próprio', () => {
  it('consulta v2/search com Markdown, preserva fontes e limita o conteúdo', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { web: [
      { url, title: 'Alpha', markdown: report }, { url: 'http://127.0.0.1/admin', markdown: 'privado' },
    ] } })))
    const output = await createFirecrawlResearch('https://firecrawl.exemplo.com/v2', 'test-key', fetcher)(input, new AbortController().signal)
    expect(fetcher.mock.calls[0][0].href).toBe('https://firecrawl.exemplo.com/v2/search')
    const options = fetcher.mock.calls[0][1]
    expect(options).toMatchObject({ redirect: 'error', headers: { authorization: 'Bearer test-key' } })
    expect(JSON.parse(options.body).scrapeOptions.formats).toEqual(['markdown'])
    expect(output.sources).toHaveLength(1)
    expect(output.report).toContain('Alpha')
  })

  it('não aceita credenciais na URL nem devolve o corpo do erro do coletor', async () => {
    expect(() => createFirecrawlResearch('https://user:secret@firecrawl.exemplo.com')).toThrow()
    expect(() => createFirecrawlResearch('http://firecrawl.exemplo.com')).toThrow()
    const collect = createFirecrawlResearch('https://firecrawl.exemplo.com', '', vi.fn().mockResolvedValue(new Response('secret', { status: 500 })))
    await expect(collect(input, new AbortController().signal)).rejects.toThrow('firecrawl_search_failed')
  })
})
