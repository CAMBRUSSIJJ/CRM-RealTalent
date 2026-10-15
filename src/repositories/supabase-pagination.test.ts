import { describe, expect, it } from 'vitest'
import { fetchAllRows } from './supabase-pagination'

describe('fetchAllRows', () => {
  it('carrega todas as páginas sem truncar em 1.000 registros', async () => {
    const source = Array.from({ length: 2_350 }, (_, index) => ({ id: index + 1 }))
    const rows = await fetchAllRows(async (from, to) => ({ data: source.slice(from, to + 1), error: null }), 1000, 10_000)
    expect(rows).toHaveLength(2_350)
    expect(rows.at(-1)?.id).toBe(2_350)
  })

  it('propaga falhas da página', async () => {
    await expect(fetchAllRows(async () => ({ data: null, error: { message: 'database unavailable' } }), 1000, 10_000)).rejects.toThrow('database unavailable')
  })

  it('interrompe snapshots que ultrapassam o teto de segurança', async () => {
    await expect(fetchAllRows(async (from, to) => ({ data: Array.from({ length: to - from + 1 }, (_, index) => from + index), error: null }), 1000, 2_000)).rejects.toThrow('limite de segurança')
  })
})
