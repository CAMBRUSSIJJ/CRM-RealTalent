import { getSupabaseClient } from '../lib/supabase'
import type { CaptureDraft, ProspectSource } from './prospecting-workspace'

export type DirectProspectingSource = Extract<ProspectSource, 'maps' | 'cnpj'>

export interface ProspectingProviderChannelStatus {
  available: boolean
  configured: boolean
  mode: 'direct' | 'assisted'
  provider: string
  message: string
  maxResults: number
}

export interface ProspectingProviderDiagnostics {
  runtime: 'supabase' | 'local-vite' | 'assisted'
  maps: ProspectingProviderChannelStatus
  cnpj: ProspectingProviderChannelStatus
  instagram: ProspectingProviderChannelStatus
  checkedAt: string
}

export interface ProspectingProviderSearchInput {
  workspaceId: string
  source: DirectProspectingSource
  segment: string
  city: string
  query: string
  quantity: number
  pageToken?: string | null
}

export interface ProspectingProviderSearchResult {
  source: DirectProspectingSource
  provider: string
  drafts: CaptureDraft[]
  count: number
  batchId: string | null
  warnings: string[]
  nextPageToken: string | null
  fetchedAt: string
}

export class ProspectingProviderError extends Error {
  code: string
  status: number
  details: Record<string, unknown>

  constructor(message: string, code = 'prospecting_provider_error', status = 500, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ProspectingProviderError'
    this.code = code
    this.status = status
    this.details = details
  }
}

const fallbackDiagnostics = (): ProspectingProviderDiagnostics => ({
  runtime: 'assisted',
  maps: {
    available: false,
    configured: false,
    mode: 'assisted',
    provider: 'Google Maps',
    message: 'Pesquisa direta indisponível. Use a busca assistida ou conecte o gateway de prospecção.',
    maxResults: 20,
  },
  cnpj: {
    available: false,
    configured: false,
    mode: 'assisted',
    provider: 'BrasilAPI',
    message: 'Consulta direta indisponível. Use a busca assistida ou conecte o gateway de prospecção.',
    maxResults: 1,
  },
  instagram: {
    available: false,
    configured: true,
    mode: 'assisted',
    provider: 'Instagram',
    message: 'Descoberta de perfis permanece assistida; o CRM não automatiza buscas não suportadas oficialmente.',
    maxResults: 0,
  },
  checkedAt: new Date().toISOString(),
})

const responseJson = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new ProspectingProviderError('O gateway de prospecção não respondeu em JSON.', 'invalid_gateway_response', response.status || 502)
  }
  return await response.json() as Record<string, unknown>
}

const normalizeDiagnostics = (value: unknown, runtime: ProspectingProviderDiagnostics['runtime']): ProspectingProviderDiagnostics => {
  const fallback = fallbackDiagnostics()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback, runtime }
  const input = value as Record<string, unknown>
  const normalizeChannel = (key: 'maps' | 'cnpj' | 'instagram', defaultValue: ProspectingProviderChannelStatus) => {
    const raw = input[key]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultValue
    const item = raw as Record<string, unknown>
    return {
      available: Boolean(item.available),
      configured: item.configured == null ? Boolean(item.available) : Boolean(item.configured),
      mode: item.mode === 'direct' ? 'direct' as const : 'assisted' as const,
      provider: typeof item.provider === 'string' && item.provider.trim() ? item.provider.trim() : defaultValue.provider,
      message: typeof item.message === 'string' && item.message.trim() ? item.message.trim() : defaultValue.message,
      maxResults: Number.isFinite(Number(item.maxResults)) ? Math.max(0, Number(item.maxResults)) : defaultValue.maxResults,
    }
  }
  return {
    runtime,
    maps: normalizeChannel('maps', fallback.maps),
    cnpj: normalizeChannel('cnpj', fallback.cnpj),
    instagram: normalizeChannel('instagram', fallback.instagram),
    checkedAt: typeof input.checkedAt === 'string' ? input.checkedAt : new Date().toISOString(),
  }
}

const normalizeSearchResult = (value: unknown, source: DirectProspectingSource): ProspectingProviderSearchResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProspectingProviderError('Resposta inválida do motor de prospecção.', 'invalid_search_response', 502)
  }
  const input = value as Record<string, unknown>
  const rawDrafts = Array.isArray(input.drafts) ? input.drafts : []
  const drafts = rawDrafts.filter((item): item is CaptureDraft => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  return {
    source,
    provider: typeof input.provider === 'string' ? input.provider : source === 'maps' ? 'google_places' : 'brasilapi',
    drafts,
    count: Number.isFinite(Number(input.count)) ? Number(input.count) : drafts.length,
    batchId: typeof input.batchId === 'string' && input.batchId ? input.batchId : null,
    warnings: Array.isArray(input.warnings) ? input.warnings.filter((item): item is string => typeof item === 'string') : [],
    nextPageToken: typeof input.nextPageToken === 'string' && input.nextPageToken ? input.nextPageToken : null,
    fetchedAt: typeof input.fetchedAt === 'string' ? input.fetchedAt : new Date().toISOString(),
  }
}

const throwFromPayload = (payload: unknown, status = 500): never => {
  const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
  const message = typeof input.message === 'string' && input.message.trim()
    ? input.message
    : typeof input.error === 'string' && input.error.trim()
      ? input.error
      : 'O motor de prospecção não conseguiu concluir a consulta.'
  const code = typeof input.code === 'string' && input.code.trim() ? input.code : 'prospecting_provider_error'
  throw new ProspectingProviderError(message, code, status, input)
}

export const isDirectProspectingSource = (source: ProspectSource): source is DirectProspectingSource => source === 'maps' || source === 'cnpj'

export async function getProspectingProviderDiagnostics(workspaceId: string): Promise<ProspectingProviderDiagnostics> {
  const client = getSupabaseClient()
  if (client && workspaceId) {
    try {
      const { data, error } = await client.functions.invoke('prospecting-search', { body: { action: 'diagnostics', organizationId: workspaceId } })
      if (!error) return normalizeDiagnostics(data, 'supabase')
    } catch { /* fallback local/assistido */ }
  }

  try {
    const response = await fetch('/api/prospecting/diagnostics', { headers: { accept: 'application/json' } })
    const payload = await responseJson(response)
    if (!response.ok) throwFromPayload(payload, response.status)
    return normalizeDiagnostics(payload, 'local-vite')
  } catch {
    return fallbackDiagnostics()
  }
}

export async function runProspectingProviderSearch(input: ProspectingProviderSearchInput): Promise<ProspectingProviderSearchResult> {
  const payload = {
    action: 'search',
    organizationId: input.workspaceId,
    source: input.source,
    segment: input.segment.trim(),
    city: input.city.trim(),
    query: input.query.trim(),
    quantity: Math.min(20, Math.max(1, Math.round(input.quantity || 1))),
    pageToken: input.pageToken?.trim() || null,
  }

  const client = getSupabaseClient()
  if (client && input.workspaceId) {
    const { data, error } = await client.functions.invoke('prospecting-search', { body: payload })
    if (error) throw new ProspectingProviderError(error.message || 'Falha no gateway Supabase de prospecção.', 'supabase_function_error', 502)
    if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) throwFromPayload(data, Number((data as Record<string, unknown>).status ?? 400))
    return normalizeSearchResult(data, input.source)
  }

  const response = await fetch('/api/prospecting/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await responseJson(response)
  if (!response.ok) throwFromPayload(data, response.status)
  return normalizeSearchResult(data, input.source)
}
