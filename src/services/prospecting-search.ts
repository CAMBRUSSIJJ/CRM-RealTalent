import { getSupabaseClient } from '../lib/supabase'
import type { CaptureDraft, ProspectRecord } from './prospecting-workspace'

export type ProspectingSearchMode = 'maps' | 'cnpj' | 'enrich'

export interface ProspectingSearchParams {
  mode: ProspectingSearchMode
  segment?: string
  city?: string
  query?: string
  limit?: number
  enrich?: boolean
  cnpjs?: string
  items?: CaptureDraft[]
}

export interface ProspectingSearchStats {
  returned: number
  withPhone: number
  withWhatsapp: number
  withEmail: number
  withInstagram: number
  withCnpj: number
  withWebsite: number
}

export interface ProspectingSearchResponse {
  mode: ProspectingSearchMode
  query: string
  results: CaptureDraft[]
  stats: ProspectingSearchStats
  warnings: string[]
  durationMs: number
}

const errorMessages: Record<string, string> = {
  maps_not_configured: 'A busca no Google Maps ainda não está configurada: defina o segredo GOOGLE_MAPS_API_KEY no Supabase com a Places API (New) ativada.',
  unauthorized: 'Sua sessão expirou. Entre novamente para buscar leads.',
  forbidden: 'Seu perfil não tem permissão de escrita neste workspace.',
  query_required: 'Informe o segmento ou uma busca específica.',
  cnpj_required: 'Informe pelo menos um CNPJ válido.',
}

export const isProspectingSearchAvailable = () => Boolean(getSupabaseClient())

async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: string; message?: string }
      if (payload.error && errorMessages[payload.error]) return errorMessages[payload.error]
      if (payload.message) return payload.message
      if (payload.error) return `Falha na busca (${payload.error}).`
    } catch { /* corpo sem JSON */ }
    if (context.status === 404) return 'A função prospecting-search não foi publicada no Supabase. Rode: supabase functions deploy prospecting-search'
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir a busca.'
}

export async function runProspectingSearch(workspaceId: string, params: ProspectingSearchParams): Promise<ProspectingSearchResponse> {
  const client = getSupabaseClient()
  if (!client) throw new Error('A busca automática usa o servidor do CRM. Conecte o Supabase (VITE_DATA_MODE=supabase) para buscar empresas reais.')
  const { data, error } = await client.functions.invoke('prospecting-search', { body: { organizationId: workspaceId, ...params } })
  if (error) throw new Error(await readFunctionError(error))
  const response = data as Partial<ProspectingSearchResponse> | null
  if (!response || !Array.isArray(response.results)) throw new Error('Resposta inesperada do servidor de busca.')
  return {
    mode: params.mode, query: response.query ?? '', results: response.results, warnings: response.warnings ?? [], durationMs: response.durationMs ?? 0,
    stats: response.stats ?? { returned: response.results.length, withPhone: 0, withWhatsapp: 0, withEmail: 0, withInstagram: 0, withCnpj: 0, withWebsite: 0 },
  }
}

/** Campos enviados para reprocessar um lead já capturado. */
export function prospectToEnrichItem(prospect: ProspectRecord): CaptureDraft {
  return {
    name: prospect.name, company: prospect.company, phone: prospect.phone, email: prospect.email, city: prospect.city, address: prospect.address,
    cnpj: prospect.cnpj, instagram: prospect.instagram, website: prospect.website, bookingUrl: prospect.bookingUrl, systemName: prospect.systemName,
    source: prospect.source === 'cnpj' ? 'cnpj' : 'maps',
  }
}
