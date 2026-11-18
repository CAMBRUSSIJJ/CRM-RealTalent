import { getSupabaseClient } from '../../lib/supabase'
import type { CaptureDraft } from '../../services/prospecting-workspace'
import type { RecheckResult } from './recheck'

export interface IndexedCompany {
  cnpj: string
  legal_name: string
  trade_name: string
  uf: string
  municipality_code: string
  city: string
  main_cnae: string
  secondary_cnaes: string[]
  status: string
  opened_on: string | null
  headquarters: boolean
  source_month: string
  source_url: string
}

export interface CompanyIndexSearch {
  city: string
  cnae: string
  name: string
  active_only: boolean
  headquarters: 'all' | 'yes' | 'no'
  opened_after: string
  opened_before: string
  cnae_scope: 'any' | 'main' | 'secondary'
  limit: number
  offset: number
}

export interface CompanyIndexPage {
  items: IndexedCompany[]
  has_more: boolean
  limit: number
  offset: number
}

export interface HostedJob {
  id: string
  organization_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  phase: string
  created_at: string
  updated_at: string
  request: { segment: string; city: string; state: string; limit: number }
  discovered: number
  processed: number
  results: CaptureDraft[]
  result_count?: number
  pending?: CaptureDraft[]
  warnings: string[]
  error: string | null
  partial: boolean
  can_resume: boolean
  metrics?: { first_result_ms?: number; duration_ms?: number }
}

export interface SearchInput {
  segment: string
  city: string
  state: string
  limit: number
  require_phone: boolean
  require_email: boolean
  require_observed_location: boolean
  minimum_relevance: number
  enrich_websites: boolean
}

async function request(workspaceId: string, path: string, method = 'GET', body?: unknown, key?: string, signal?: AbortSignal) {
  const client = getSupabaseClient()
  const session = client ? await client.auth.getSession() : null
  let currentSession = session?.data.session
  // The stream keeps one JWT for up to four minutes. Refresh before starting
  // when the existing session cannot cover that window.
  if (client && currentSession?.expires_at && currentSession.expires_at * 1000 - Date.now() < 300_000) {
    const refreshed = await client.auth.refreshSession()
    if (refreshed.error) throw new Error('Sua sessão expirou. Entre novamente no CRM.')
    currentSession = refreshed.data.session
  }
  const token = currentSession?.access_token
  if (!token) throw new Error('Entre na sua conta do CRM para usar o motor hospedado.')
  const response = await fetch(`/api/garimpo${path}`, {
    method, signal, credentials: 'same-origin', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'X-Workspace-Id': workspaceId,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { detail?: unknown } | null
    throw new Error(typeof detail?.detail === 'string' ? detail.detail : `O motor não respondeu à solicitação (HTTP ${response.status}). Tente verificar a conexão novamente.`)
  }
  return response
}

export const hostedGarimpo = {
  async recheck(workspaceId: string, input: { company: string; city: string; state: string;
    cnpj: string; website: string; phone: string; address: string }, signal?: AbortSignal): Promise<RecheckResult> {
    return (await request(workspaceId, '/companies/recheck', 'POST', input, undefined, signal)).json()
  },
  async index(workspaceId: string, input: CompanyIndexSearch, signal?: AbortSignal): Promise<CompanyIndexPage> {
    const query = new URLSearchParams({
      state: 'RS', city: input.city, cnae: input.cnae, name: input.name,
      active_only: String(input.active_only),
      ...(input.headquarters === 'all' ? {} : { headquarters: String(input.headquarters === 'yes') }),
      ...(input.opened_after ? { opened_after: input.opened_after } : {}),
      ...(input.opened_before ? { opened_before: input.opened_before } : {}),
      cnae_scope: input.cnae_scope, limit: String(input.limit),
      offset: String(input.offset),
    })
    return (await request(workspaceId, `/index?${query.toString()}`, 'GET', undefined, undefined, signal)).json()
  },
  async capabilities(workspaceId: string, signal?: AbortSignal): Promise<{ ready: boolean; hosted: boolean; can_write: boolean }> {
    return (await request(workspaceId, '/capabilities', 'GET', undefined, undefined, signal)).json()
  },
  async list(workspaceId: string, signal?: AbortSignal): Promise<HostedJob[]> {
    return (await request(workspaceId, '/searches', 'GET', undefined, undefined, signal)).json()
  },
  async create(workspaceId: string, input: SearchInput, key: string): Promise<HostedJob> {
    return (await request(workspaceId, '/searches', 'POST', { ...input, provider: 'maps', search_mode: 'expanded', qualify: false }, key)).json()
  },
  async get(workspaceId: string, id: string, signal?: AbortSignal): Promise<HostedJob> {
    return (await request(workspaceId, `/searches/${encodeURIComponent(id)}`, 'GET', undefined, undefined, signal)).json()
  },
  async cancel(workspaceId: string, id: string): Promise<HostedJob> {
    return (await request(workspaceId, `/searches/${encodeURIComponent(id)}/cancel`, 'POST')).json()
  },
  async resume(workspaceId: string, id: string, key: string): Promise<HostedJob> {
    return (await request(workspaceId, `/searches/${encodeURIComponent(id)}/resume`, 'POST', undefined, key)).json()
  },
  async run(workspaceId: string, id: string, onProgress: (job: HostedJob) => void, signal: AbortSignal) {
    const response = await request(workspaceId, `/searches/${encodeURIComponent(id)}/run`, 'POST', undefined, undefined, signal)
    if (!response.body) throw new Error('O navegador não recebeu o acompanhamento da pesquisa.')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const consume = (line: string) => {
      if (!line.trim()) return
      const event = JSON.parse(line) as { event: string; job?: HostedJob; message?: string }
      if (event.job) onProgress(event.job)
      if (event.event === 'error') throw new Error(event.message || 'Pesquisa interrompida. Os dados salvos foram preservados.')
    }
    try {
      for (;;) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        lines.forEach(consume)
        if (done) { consume(buffer); break }
      }
    } finally { reader.releaseLock() }
  },
}
