export const SUPABASE_PAGE_SIZE = 1000
export const MAX_SNAPSHOT_ROWS_PER_ENTITY = 50_000

export type PagedResponse<T> = { data: T[] | null; error: { message?: string } | null }

/**
 * Reads a PostgREST query in stable ranges instead of trusting the server-side
 * max_rows setting. This prevents silent truncation once an entity exceeds
 * 1,000 rows while keeping an explicit safety ceiling for full snapshots.
 */
export const fetchAllRows = async <T>(
  queryRange: (from: number, to: number) => PromiseLike<PagedResponse<T>>,
  pageSize = SUPABASE_PAGE_SIZE,
  maxRows = MAX_SNAPSHOT_ROWS_PER_ENTITY,
): Promise<T[]> => {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('pageSize deve ser um inteiro positivo.')
  if (!Number.isInteger(maxRows) || maxRows < pageSize) throw new Error('maxRows deve ser um inteiro maior ou igual a pageSize.')

  const rows: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1)
    const { data, error } = await queryRange(from, to)
    if (error) throw new Error(error.message || 'Falha ao carregar uma página do Supabase.')
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) return rows
  }

  throw new Error(`A consulta excedeu o limite de segurança de ${maxRows.toLocaleString('pt-BR')} registros. Use filtros ou paginação dedicada para este módulo.`)
}
