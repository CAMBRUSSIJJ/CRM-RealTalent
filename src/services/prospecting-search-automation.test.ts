import { describe, expect, it } from 'vitest'
import {
  dedupeProspectingDrafts,
  prospectingAutomationAreas,
  prospectingAutomationQueries,
  runProspectingSearchAutomation,
} from './prospecting-search-automation'

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

  it('pagina automaticamente até atingir a meta', async () => {
    let calls = 0
    const result = await runProspectingSearchAutomation({ workspaceId: 'ws', segment: 'Barbearias', city: 'Canoas, RS', query: '', targetQuantity: 25 }, {
      search: async (input) => {
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
  })
})
