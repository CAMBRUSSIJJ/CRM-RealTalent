import { describe, expect, it } from 'vitest'
import {
  dedupeProspectingDrafts,
  prospectingAutomationAreas,
  prospectingAutomationQueries,
  runProspectingSearchAutomation,
} from './prospecting-search-automation'
import {
  buildDeterministicProspectingSearchPlan,
  verifyProspectingDraft,
} from './prospecting-search-intelligence'

const draft = (id: string, name = `Empresa ${id}`) => ({ name, company: name, city: 'Canoas', placeId: id, source: 'maps' })

describe('Prospecting Search Automation V101.10.1', () => {
  it('permite várias áreas separadas por ponto e vírgula', () => {
    expect(prospectingAutomationAreas('Canoas, RS; Esteio, RS\nSapucaia do Sul, RS')).toEqual(['Canoas, RS', 'Esteio, RS', 'Sapucaia do Sul, RS'])
  })

  it('não repete query específica igual ao segmento', () => {
    expect(prospectingAutomationQueries('Barbearias', 'barbearias')).toEqual(['barbearias'])
  })

  it('remove duplicidade forte por placeId', () => {
    expect(dedupeProspectingDrafts([draft('p1'), draft('p1'), draft('p2')])).toHaveLength(2)
  })

  it('expande semanticamente uma busca odontológica sem perder o pedido explícito', () => {
    const plan = buildDeterministicProspectingSearchPlan({
      segment: 'Clínicas odontológicas',
      city: 'Porto Alegre, RS',
      query: 'implantes e atendimento particular',
    })
    expect(plan.queries[0]?.term).toBe('implantes e atendimento particular')
    expect(plan.queries.some((item) => item.term === 'implantodontia')).toBe(true)
    expect(plan.queries.some((item) => item.term === 'dentista')).toBe(true)
    expect(plan.desiredSignals).toEqual(expect.arrayContaining(['implantes', 'atendimento particular']))
    expect(plan.areas).toEqual(['Porto Alegre, RS'])
  })

  it('filtra conteúdo genérico sem sinal de empresa e preserva local real do Places', () => {
    const plan = buildDeterministicProspectingSearchPlan({ segment: 'Clínicas', city: 'Canoas, RS', query: 'clínica particular' })
    const noise = verifyProspectingDraft({ name: '10 melhores clínicas — artigo', description: 'blog artigo ranking de clínicas' }, plan, 'Canoas, RS')
    const place = verifyProspectingDraft({ name: 'Clínica Alfa', company: 'Clínica Alfa', placeId: 'g-1', address: 'Centro, Canoas', city: 'Canoas' }, plan, 'Canoas, RS')
    expect(noise.accept).toBe(false)
    expect(place.accept).toBe(true)
  })

  it('pagina automaticamente até atingir a meta', async () => {
    let calls = 0
    const result = await runProspectingSearchAutomation({ workspaceId: 'ws', segment: 'Barbearias', city: 'Canoas, RS', query: '', targetQuantity: 25 }, {
      search: async () => {
        calls += 1
        return {
          source: 'maps', provider: 'google_places', batchId: null, warnings: [], fetchedAt: new Date().toISOString(),
          drafts: calls === 1 ? Array.from({ length: 20 }, (_, i) => draft(`p${i}`)) : Array.from({ length: 10 }, (_, i) => draft(`p${20 + i}`)),
          count: calls === 1 ? 20 : 10,
          nextPageToken: calls === 1 ? 'next' : null,
        }
      },
    })
    expect(calls).toBe(2)
    expect(result.uniqueCount).toBe(25)
    expect(result.stoppedReason).toBe('target_reached')
  })

  it('aceita plano refinado pela Agent e mantém fallback saneado', async () => {
    let planned = 0
    const queries: string[] = []
    const result = await runProspectingSearchAutomation({ workspaceId: 'ws', segment: 'Clínicas', city: 'Canoas, RS', query: 'implantes', targetQuantity: 1 }, {
      planSearch: async (_input, baseline) => {
        planned += 1
        return { ...baseline, source: 'ai', planner: 'openai:test', queries: [{ term: 'implantodontista particular', priority: 100, reason: 'Agent' }] }
      },
      search: async (input) => {
        queries.push(input.query)
        return {
          source: 'maps', provider: 'google_places', batchId: null, warnings: [], fetchedAt: new Date().toISOString(),
          drafts: [draft('ai-1', 'Clínica Implante')], count: 1, nextPageToken: null,
        }
      },
    })
    expect(planned).toBe(1)
    expect(result.plan.source).toBe('ai')
    expect(result.plan.planner).toBe('openai:test')
    expect(queries[0]).toBe('implantodontista particular')
  })

  it('abandona paginação de baixa qualidade e adapta para outra variação', async () => {
    let calls = 0
    const seenQueries: string[] = []
    const result = await runProspectingSearchAutomation({ workspaceId: 'ws', segment: 'Clínicas odontológicas', city: 'Canoas, RS', query: 'implantes', targetQuantity: 2, maxRequests: 4 }, {
      search: async (input) => {
        calls += 1
        seenQueries.push(input.query)
        if (calls === 1) return {
          source: 'maps', provider: 'google_places', batchId: null, warnings: [], fetchedAt: new Date().toISOString(),
          drafts: Array.from({ length: 6 }, (_, i) => ({ name: `Artigo ${i}`, description: 'blog artigo ranking de clínicas' })),
          count: 6, nextPageToken: 'wasteful-next-page',
        }
        return {
          source: 'maps', provider: 'google_places', batchId: null, warnings: [], fetchedAt: new Date().toISOString(),
          drafts: [draft('good-1', 'Odonto Alfa'), draft('good-2', 'Odonto Beta')], count: 2, nextPageToken: null,
        }
      },
    })
    expect(calls).toBe(2)
    expect(seenQueries[1]).not.toBe(seenQueries[0])
    expect(result.uniqueCount).toBe(2)
    expect(result.rejectedCount).toBe(6)
    expect(result.adaptations.length).toBeGreaterThan(0)
  })

  it('cancela preservando resultados já coletados', async () => {
    const controller = new AbortController()
    let calls = 0
    const result = await runProspectingSearchAutomation({ workspaceId: 'ws', segment: 'Restaurantes', city: 'Canoas, RS', query: '', targetQuantity: 40 }, {
      signal: controller.signal,
      search: async () => {
        calls += 1
        if (calls === 1) controller.abort()
        return {
          source: 'maps', provider: 'google_places', batchId: null, warnings: [], fetchedAt: new Date().toISOString(),
          drafts: [draft('cancel-1'), draft('cancel-2')], count: 2, nextPageToken: 'next',
        }
      },
    })
    expect(calls).toBe(1)
    expect(result.uniqueCount).toBe(2)
    expect(result.stoppedReason).toBe('cancelled')
  })

  it('deduplica resultados entre páginas antes de contar a meta', async () => {
    let calls = 0
    const result = await runProspectingSearchAutomation({ workspaceId: 'ws', segment: 'Clínicas', city: 'Porto Alegre, RS', query: '', targetQuantity: 3 }, {
      search: async () => {
        calls += 1
        return {
          source: 'maps', provider: 'google_places', batchId: null, warnings: [], fetchedAt: new Date().toISOString(),
          drafts: calls === 1 ? [draft('a'), draft('b')] : [draft('b'), draft('c')], count: 2,
          nextPageToken: calls === 1 ? 'next' : null,
        }
      },
    })
    expect(result.drafts.map((item) => item.placeId)).toEqual(['a', 'b', 'c'])
    expect(result.uniqueCount).toBe(3)
    expect(result.duplicatesFiltered).toBe(1)
  })
})
