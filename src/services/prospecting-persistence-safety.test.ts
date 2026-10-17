import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => {
  const upserts: Array<{ table: string; rows: Array<Record<string, unknown>> }> = []
  const deletions: Array<{ table: string; organization: string; ids: string[] }> = []
  const fake = {
    from(table: string) {
      return {
        upsert: async (rows: Array<Record<string, unknown>>) => {
          upserts.push({ table, rows })
          return { error: null }
        },
        delete: () => ({
          eq: (_column: string, organization: string) => ({
            in: (_field: string, ids: string[]) => ({
              select: async (_field: string) => {
                deletions.push({ table, organization, ids })
                return { data: ids.map((id) => ({ id })), error: null }
              },
            }),
          }),
        }),
      }
    },
  }
  return { upserts, deletions, fake }
})
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => mock.fake }))
import { createProspect, deleteProspectingRecords, readProspectingState, writeProspectingState,
  cacheProspectingStateLocally } from './prospecting-workspace'

const wid = '11111111-1111-4111-8111-111111111111'
const currentUser = '22222222-2222-4222-8222-222222222222'
const prospect = () => createProspect(wid, { name: 'Empresa Teste', company: 'Empresa Teste', city: 'Porto Alegre' }, 'manual', [], currentUser)

describe('Garimpo RC1 H1: sincronização de registros sem exclusão em massa', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    mock.upserts.length = 0
    mock.deletions.length = 0
  })
  afterEach(() => { vi.useRealTimers() })

  it('salva somente o registro modificado, nunca todos os registros do cache', async () => {
    const a = prospect()
    const b = prospect()
    cacheProspectingStateLocally(wid, { prospects: [a, b], history: [], lastExtensionSyncAt: null })
    writeProspectingState(wid, { prospects: [{ ...a, notes: 'Editada', updatedAt: new Date().toISOString() }, b], history: [], lastExtensionSyncAt: null })
    await vi.advanceTimersByTimeAsync(360)
    expect(mock.upserts).toHaveLength(1)
    expect(mock.upserts[0].rows).toHaveLength(1)
    expect(mock.upserts[0].rows[0].id).toBe(a.id)
    expect(mock.deletions).toHaveLength(0)
  })

  it('não trata ausência no estado local como exclusão de outras empresas', async () => {
    const a = prospect()
    const b = prospect()
    cacheProspectingStateLocally(wid, { prospects: [a, b], history: [], lastExtensionSyncAt: null })
    writeProspectingState(wid, { prospects: [a], history: [], lastExtensionSyncAt: null })
    await vi.advanceTimersByTimeAsync(360)
    expect(mock.upserts).toHaveLength(0)
    expect(mock.deletions).toHaveLength(0)
    expect(readProspectingState(wid).prospects).toHaveLength(1)
  })

  it('faz exclusão apenas com IDs explícitos, organização restrita e confirmação do servidor', async () => {
    const a = prospect()
    const b = prospect()
    cacheProspectingStateLocally(wid, { prospects: [a,b], history: [], lastExtensionSyncAt: null })
    await deleteProspectingRecords(wid, [a.id])
    expect(mock.deletions).toHaveLength(1)
    expect(mock.deletions[0]).toEqual({ table: 'prospecting_leads', organization: wid, ids: [a.id] })
    expect(mock.deletions[0].ids).not.toContain(b.id)
  })

  it('falha fechado para seleção inválida', async () => {
    await expect(deleteProspectingRecords(wid, ['invalid id'])).rejects.toThrow('inválida')
    expect(mock.deletions).toHaveLength(0)
  })
})
