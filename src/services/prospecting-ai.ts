import { getSupabaseClient } from '../lib/supabase'
import { buildGarimpoLinuxCommand, buildGarimpoLinuxInstaller } from './local-connector-installer'
import { effectiveDataMode, env } from '../lib/env'
import type { Lead } from '../domain/types'
import { appendHistory, createProspect, refreshProspectAnalysis, type ProspectRecord, type ProspectingState, type ProspectSource } from './prospecting-workspace'
import type { AiField, AiResearch, AiSearchInput, AiSearchResult } from '../../supabase/functions/_shared/prospecting-ai'
import { parseAiSearchResult, parseAiResearch, researchCompletionStatus } from '../../supabase/functions/_shared/prospecting-ai'

export type { AiResearch, AiSearchInput, AiSearchResult }
export const aiFieldLabels: Record<AiField, string> = {
  company: 'Empresa', phone: 'Telefone', email: 'E-mail', city: 'Cidade', address: 'Endereço', cnpj: 'CNPJ',
  instagram: 'Instagram', website: 'Site', bookingUrl: 'Agendamento', systemName: 'Sistema utilizado', whatsappUrl: 'WhatsApp publicado',
}
const messages: Record<string, string> = {
  ai_not_configured: 'A pesquisa com IA ainda precisa ser conectada em seu servidor. Configure o coletor e o modelo seguindo GARIMPO-IA.md.',
  firecrawl_search_failed: 'O Firecrawl não concluiu a busca. Verifique o servidor e a configuração do mecanismo de pesquisa (SearXNG).',
  firecrawl_response_invalid: 'O Firecrawl retornou um formato incompatível. A integração utiliza a API v2/search.',
  unauthorized: 'Entre novamente no CRM para pesquisar com IA.', workspace_forbidden: 'Seu usuário não tem permissão de edição neste workspace.',
  search_criteria_required: 'Informe o segmento e a cidade ou região.', invalid_limit: 'Pesquise de 1 a 10 leads por rodada.',
  search_timeout: 'A pesquisa excedeu o tempo disponível. Tente um lote menor ou critérios mais específicos.',
  ai_provider_failed: 'O provedor de IA não concluiu a pesquisa. Verifique a chave, o modelo com busca web e o saldo da conta.',
  prospect_not_found: 'Este contato ainda não está disponível no servidor. Aguarde a sincronização antes de enriquecer.',
  local_connector_unavailable: 'O conector local ainda precisa ser instalado no Supabase. Consulte o guia do Garimpo local.',
  local_connector_offline: 'Seu computador está desconectado. Inicie o conector local e aguarde alguns segundos antes de pesquisar.',
  local_queue_busy: 'Há pesquisas aguardando no seu computador. Aguarde a conclusão para iniciar outra.',
  local_research_failed: 'A pesquisa local não concluiu. Consulte as etapas no Garimpo ou o terminal Linux.',
  local_stage_failed: 'Uma etapa da investigação não concluiu; confira o diagnóstico e as fontes já coletadas.',
  local_stage_timeout: 'A investigação excedeu o tempo permitido. As etapas concluídas continuam registradas no Linux.',
  local_job_expired: 'A pesquisa local expirou. Verifique se o conector continua aberto no computador.',
  invalid_ai_response: 'A investigação retornou dados incompatíveis. Os dados atuais foram preservados.',
  research_contract_unsupported: 'O conector e o CRM usam contratos de pesquisa diferentes. Atualize o conector Linux antes de tentar novamente.',
  connector_admin_required: 'Somente um administrador do workspace pode conectar ou desconectar um computador.',
}

const waitForPoll = (signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Pesquisa cancelada', 'AbortError')); return }
  const timer = window.setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, 2000)
  const abort = () => { window.clearTimeout(timer); reject(new DOMException('Pesquisa cancelada', 'AbortError')) }
  signal?.addEventListener('abort', abort, { once: true })
})

async function connectorAction(organizationId: string, action: 'register' | 'disconnect' | 'cancel', jobId?: string) {
  const client = effectiveDataMode === 'local' ? null : getSupabaseClient()
  if (!client) throw new Error('Conecte o CRM ao Supabase para configurar seu computador.')
  const { data, error } = await client.functions.invoke('prospecting-local-connector', { body: { organizationId, action, jobId } })
  if (error) {
    let code = ''; try { code = (await error.context?.json())?.error ?? '' } catch { /* No JSON on network failures. */ }
    throw new Error(messages[code] ?? 'Não foi possível acessar o conector local. Verifique se ele está publicado no Supabase.')
  }
  return data
}

async function registeredLocalConnectorEnvironment(organizationId: string): Promise<string> {
  const data = await connectorAction(organizationId, 'register')
  if (!data || typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error('Não foi possível gerar o acesso do Linux.')
  return `SUPABASE_URL=${env.supabaseUrl}\nSUPABASE_PUBLISHABLE_KEY=${env.supabasePublishableKey}\nGARIMPO_WORKSPACE_ID=${organizationId}\nGARIMPO_CONNECTOR_TOKEN=${data.token}\nFIRECRAWL_API_URL=http://127.0.0.1:3002\nPROSPECTING_AI_BASE_URL=http://127.0.0.1:11434/v1\nPROSPECTING_AI_MODEL=qwen2.5-coder:3b\n`
}

function downloadPrivateFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

// Backward-compatible advanced setup. Each registration revokes the previous connector token.
export async function downloadLocalConnectorConfig(organizationId: string) {
  downloadPrivateFile('garimpo.env', await registeredLocalConnectorEnvironment(organizationId), 'text/plain')
}

// Primary setup: a single personal installer, without manually moving or naming an .env file.
// The browser constructs this download locally; the private token is never published as a static asset.
export async function downloadLocalConnectorInstaller(organizationId: string) {
  const configuration = await registeredLocalConnectorEnvironment(organizationId)
  downloadPrivateFile('CONECTAR-GARIMPO-LINUX.sh', buildGarimpoLinuxInstaller(configuration), 'text/x-shellscript')
}

// Generated in the authenticated browser. Never send the command to logs or telemetry.
export async function generateLocalConnectorCommand(organizationId: string): Promise<string> {
  const configuration = await registeredLocalConnectorEnvironment(organizationId)
  return buildGarimpoLinuxCommand(configuration)
}

export const disconnectLocalConnector = (organizationId: string) => connectorAction(organizationId, 'disconnect')

export async function getLocalConnectorStatus(organizationId: string) {
  const client = effectiveDataMode === 'local' ? null : getSupabaseClient()
  if (!client) return null
  const { data, error } = await client.from('prospecting_local_connectors').select('enabled,last_seen_at').eq('organization_id', organizationId).maybeSingle()
  if (error || !data) return null
  return { enabled: data.enabled, lastSeenAt: data.last_seen_at, online: Boolean(data.enabled && data.last_seen_at && Date.now() - Date.parse(data.last_seen_at) < 60_000) }
}

export interface LocalResearchProgress {
  stage: 'discover' | 'website' | 'web' | 'instagram' | 'facts' | 'signals' | 'business' | 'completed'
  phaseStatus: 'running' | 'completed' | 'failed'
  sourceCount: number
  leadCount: number
  errorCode?: string
  updatedAt?: string
}
export interface LocalSearchOptions {
  onProgress?: (progress: LocalResearchProgress) => void
  keepRunningOnClose?: boolean
}

export function localResearchProgress(value: unknown): LocalResearchProgress | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (!['discover', 'website', 'web', 'instagram', 'facts', 'signals', 'business', 'completed'].includes(row.stage as string)
    || !['running', 'completed', 'failed'].includes(row.phaseStatus as string)
    || !Number.isInteger(row.sourceCount) || Number(row.sourceCount) < 0
    || !Number.isInteger(row.leadCount) || Number(row.leadCount) < 0) return null
  return { stage: row.stage as LocalResearchProgress['stage'], phaseStatus: row.phaseStatus as LocalResearchProgress['phaseStatus'],
    sourceCount: Number(row.sourceCount), leadCount: Number(row.leadCount),
    ...(typeof row.errorCode === 'string' ? { errorCode: row.errorCode.slice(0, 100) } : {}),
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}) }
}

/** A past candidate is only a suggestion. Identity is confirmed by the reviewer. */
export function reviewedInstagramProfile(value: string): string | null {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const account = url.pathname.split('/').filter(Boolean)
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(hostname)
      || account.length !== 1 || !/^[a-z0-9._]{1,30}$/i.test(account[0])
      || ['p', 'reel', 'stories', 'explore', 'accounts'].includes(account[0].toLowerCase())
      || url.username || url.password) return null
    return 'https://www.instagram.com/' + account[0].toLowerCase() + '/'
  } catch { return null }
}

export function findPriorInstagramCandidate(rows: Array<{
  status: string
  result: unknown
  created_at: string
}>): { profileUrl: string; evidenceUrl?: string; discoveredAt: string } | null {
  for (const row of rows) {
    if (row.status !== 'completed') continue
    const discovery = (row.result as AiSearchResult | null)?.instagramDiscovery
    if (!discovery || !['candidate', 'linked', 'provided'].includes(discovery.status)) continue
    const profileUrl = reviewedInstagramProfile(discovery.profileUrl || '')
    if (!profileUrl) continue
    return {
      profileUrl,
      ...(discovery.evidenceUrl ? { evidenceUrl: discovery.evidenceUrl } : {}),
      discoveredAt: row.created_at,
    }
  }
  return null
}

export async function recentLocalResearch(organizationId: string, company: string, city: string, instagram = '', prospectId = ''): Promise<{
  id: string; status: string; result: AiSearchResult | null; progress: LocalResearchProgress | null; createdAt: string; errorCode: string
  priorInstagramCandidate: { profileUrl: string; evidenceUrl?: string; discoveredAt: string } | null
  recoverable: boolean
} | null> {
  const client = effectiveDataMode === 'local' ? null : getSupabaseClient()
  if (!client) return null
  const scopedQuery = () => client.from('prospecting_ai_jobs')
    .select('id,status,result,error_code,created_at,completed_at,input,expires_at')
    .eq('organization_id', organizationId).eq('input->>source', 'manual')
  let query = scopedQuery()
  query = prospectId ? query.eq('input->>prospectId', prospectId)
    : query.eq('input->>segment', company).eq('input->>city', city)
  let { data, error } = await query.order('created_at', { ascending: false }).limit(30)
  // Older connectors did not attach prospectId. Scope their fallback by company
  // before limiting, so other companies cannot evict this company's history.
  if (!error && !data?.length && prospectId) {
    const legacy = await scopedQuery().eq('input->>segment', company).eq('input->>city', city)
      .order('created_at', { ascending: false }).limit(30)
    data = legacy.data; error = legacy.error
  }
  if (error || !data) return null
  const normalizeLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const normalizedProfile = (raw: string) => reviewedInstagramProfile(
    raw.startsWith('@') ? 'https://www.instagram.com/' + raw.slice(1) + '/' : raw,
  )
  const activeProfile = normalizedProfile(instagram.trim())
  const jobProfile = (input: Partial<AiSearchInput> | null) => {
    const hint = input?.query?.match(/(?:^|\s)INSTAGRAM=([^\s]+)/)?.[1]
    let raw = input?.instagram || ''
    if (!raw && hint) {
      try { raw = decodeURIComponent(hint) } catch { /* malformed legacy hint */ }
    }
    return normalizedProfile(raw)
  }
  // A corrected profile must not inherit sources or post counts from a job
  // previously executed for a different Instagram account.
  const matchingJobs = data.filter((row) => {
    const input = row.input as Partial<AiSearchInput> | null
    return input?.source === 'manual' && (prospectId && input.prospectId ? input.prospectId === prospectId :
        normalizeLabel(input?.segment || '') === normalizeLabel(company) && normalizeLabel(input?.city || '') === normalizeLabel(city))
      && (!activeProfile || jobProfile(input) === activeProfile)
  })
  const match = matchingJobs[0]
  if (!match) return null
  const priorInstagramCandidate = findPriorInstagramCandidate(matchingJobs)
  const recoverable = ['queued', 'processing'].includes(match.status) && Number.isFinite(Date.parse(match.expires_at)) && Date.parse(match.expires_at) <= Date.now()
  const result = match.status === 'completed' && match.result
    ? validateAiResponse(match.result) as AiSearchResult & { progress?: LocalResearchProgress }
    : match.result as { progress?: LocalResearchProgress; stages?: LocalResearchProgress[] } | null
  const completeResult = match.status === 'completed' ? result as AiSearchResult | null : null
  const stages = completeResult?.stages ?? []
  const finalStage = stages.at(-1)
  const partiallyCompleted = stages.length
    ? researchCompletionStatus(stages, Boolean(completeResult?.leads.some((lead) => lead.aiResearch.sources.length))) === 'partial'
    : completeResult?.researchStatus === 'partial'
  // Completed jobs store their final trace in "stages", not "progress".
  // Do not keep showing a stale "Ollama em andamento" after completion.
  const safeProgress = localResearchProgress(result?.progress)
  const terminalProgress: LocalResearchProgress | null = match.status === 'completed'
    ? {
      stage: 'completed', phaseStatus: partiallyCompleted ? 'failed' : 'completed',
      sourceCount: finalStage?.sourceCount ?? completeResult?.leads?.[0]?.aiResearch?.sources?.length ?? 0,
      leadCount: completeResult?.leads?.length ?? 0,
      updatedAt: finalStage?.at ?? match.created_at,
    }
    : recoverable || ['failed', 'cancelled'].includes(match.status)
      ? { stage: 'completed', phaseStatus: 'failed', sourceCount: safeProgress?.sourceCount || 0, leadCount: safeProgress?.leadCount || 0 }
      : null
  return {
    id: match.id as string, status: match.status as string,
    result: completeResult,
    progress: terminalProgress ?? safeProgress, createdAt: match.created_at as string,
    errorCode: match.error_code || '',
    priorInstagramCandidate,
    recoverable,
  }
}

export async function searchProspectsWithAi(input: AiSearchInput, signal?: AbortSignal, options: LocalSearchOptions = {}): Promise<AiSearchResult> {
  if (!input.segment.trim() || !input.city.trim()) throw new Error(messages.search_criteria_required)
  const client = effectiveDataMode === 'local' ? null : getSupabaseClient()
  if (!client) throw new Error('A busca com IA requer o CRM conectado ao Supabase. O modo local permite importação e revisão manual.')
  const { data, error } = await client.functions.invoke('prospecting-ai-search', { body: input, signal })
  if (signal?.aborted) throw new DOMException('Pesquisa cancelada', 'AbortError')
  if (error) {
    let code = ''
    try { code = (await error.context?.json())?.error ?? '' } catch { /* Network/gateway failures have no JSON body. */ }
    throw new Error(messages[code] ?? 'Não foi possível acessar a busca com IA. Verifique a conexão e se a função prospecting-ai-search está publicada.')
  }
  if (typeof data?.jobId === 'string') {
    const deadline = Date.now() + 9 * 60_000
    try {
      while (Date.now() < deadline) {
        await waitForPoll(signal)
        const job = await client.from('prospecting_ai_jobs').select('status,result,error_code').eq('id', data.jobId).eq('organization_id', input.organizationId).maybeSingle()
        if (job.error || !job.data) throw new Error('Não foi possível acompanhar a pesquisa local.')
        if (job.data.status === 'completed') return { ...validateAiResponse(job.data.result), executionId: data.jobId }
        const progress = localResearchProgress((job.data.result as { progress?: unknown } | null)?.progress)
        if (progress && options.onProgress) options.onProgress(progress)
        if (job.data.status === 'failed') throw new Error(messages[job.data.error_code ?? ''] ?? messages.local_research_failed)
        if (job.data.status === 'cancelled') throw new DOMException('Pesquisa cancelada', 'AbortError')
      }
      throw new Error(messages.local_job_expired)
    } finally {
      // Stop queued or processing work when the page closes, the user cancels or polling times out.
      if (!options.keepRunningOnClose) void connectorAction(input.organizationId, 'cancel', data.jobId).catch(() => {})
    }
  }
  return validateAiResponse(data)
}

function validateAiResponse(data: unknown): AiSearchResult {
  try { return parseAiSearchResult(data) }
  catch (error) { throw new Error(messages[(error as { code?: string }).code || ''] || messages.invalid_ai_response) }
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
const phoneKey = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits }
export function prospectIdentityKeys(prospect: Pick<ProspectRecord, 'company' | 'city' | 'phone' | 'cnpj' | 'instagram' | 'website'>) {
  const keys: string[] = []
  if (prospect.company.trim()) keys.push(`company:${normalize(prospect.company)}:${normalize(prospect.city)}`)
  if (phoneKey(prospect.phone).length >= 10) keys.push(`phone:${phoneKey(prospect.phone)}`)
  if (prospect.cnpj.replace(/\D/g, '').length === 14) keys.push(`cnpj:${prospect.cnpj.replace(/\D/g, '')}`)
  if (prospect.instagram) keys.push(`instagram:${prospect.instagram.replace(/^https?:\/\/(www\.)?instagram.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0].toLowerCase()}`)
  // Domains shared by booking platforms and social networks do not identify a business.
  return keys
}

export function applyAiDiscovery(state: ProspectingState, result: AiSearchResult, workspaceId: string, source: ProspectSource, leads: Lead[], createdBy: string | null = null) {
  const keys = new Set(state.prospects.flatMap(prospectIdentityKeys))
  const added: ProspectRecord[] = []
  let skipped = 0
  for (const draft of result.leads) {
    const prospect = refreshProspectAnalysis(createProspect(workspaceId, { ...draft, source, sourceDetail: 'Pesquisa web com IA' }, source, leads, createdBy), leads)
    const identities = prospectIdentityKeys(prospect)
    if (identities.some((key) => keys.has(key))) { skipped += 1; continue }
    identities.forEach((key) => keys.add(key))
    added.push(prospect)
  }
  return appendHistory({ ...state, prospects: [...added, ...state.prospects] }, workspaceId, {
    action: 'search', title: 'Pesquisa com IA concluída',
    description: `${result.leads.length} encontrado(s) · ${added.length} novo(s) · ${skipped} repetido(s) ignorado(s). ${result.warnings.join(' ')}`, count: added.length,
  })
}

export function applyAiEnrichment(prospect: ProspectRecord, result: AiSearchResult, leads: Lead[], researchOnly = false): ProspectRecord {
  result = validateAiResponse(result)
  const keys = new Set(prospectIdentityKeys(prospect))
  const match = result.leads.find((lead) => prospectIdentityKeys(lead).some((key) => keys.has(key)))
  if (!match) throw new Error('A pesquisa não encontrou uma empresa com identidade compatível. Os dados atuais foram preservados.')
  const patch: Record<string, string> = {}
  for (const field of Object.keys(aiFieldLabels)) {
    if (!researchOnly && !prospect[field] && match[field as AiField]) patch[field] = match[field as AiField]
  }
  const saved = { ...result, leads: [match] }
  const previous = savedResearchVersions(prospect)
  const id = result.executionId || result.researchedAt
  const version: SavedResearchVersion = { id, researchedAt: result.researchedAt,
    summary: (result.leadIntelligence?.businessSummary || result.commercialBrief?.summary || 'Investigação da empresa').slice(0, 500),
    sourceCount: match.aiResearch.sources.length, status: result.researchStatus || 'completed' }
  // Keep compact references in browser storage; full versions remain in the
  // company-scoped jobs table. Only the current complete result is duplicated.
  const researchHistory = [...previous.filter((run) => run.id !== id), version].slice(-20)
  return refreshProspectAnalysis({
    ...prospect, ...patch,
    rawData: { ...prospect.rawData, aiResearch: match.aiResearch, aiResearchResult: saved, researchHistory,
      leadIntelligence: result.leadIntelligence, commercialBrief: result.commercialBrief,
      instagramDiscovery: result.instagramDiscovery, researchPlan: result.researchPlan,
      whatsappUrl: prospect.rawData.whatsappUrl || match.whatsappUrl },
  }, leads)
}

export function savedResearchResult(prospect: ProspectRecord): AiSearchResult | null {
  const saved = prospect.rawData.aiResearchResult
  if (!saved) return null
  try { return validateAiResponse(saved) } catch { return null }
}

export interface SavedResearchVersion { id: string; researchedAt: string; summary: string; sourceCount: number; status: string }
export function savedResearchVersions(prospect: ProspectRecord): SavedResearchVersion[] {
  if (!Array.isArray(prospect.rawData.researchHistory)) return []
  return (prospect.rawData.researchHistory as SavedResearchVersion[]).slice(-20).filter((version) => version
    && typeof version.id === 'string' && typeof version.summary === 'string'
    && typeof version.status === 'string' && typeof version.researchedAt === 'string'
    && Number.isFinite(Date.parse(version.researchedAt)) && Number.isFinite(version.sourceCount) && version.sourceCount >= 0)
}
export async function localResearchVersion(prospect: ProspectRecord, id: string, signal?: AbortSignal): Promise<AiSearchResult | null> {
  const current = savedResearchResult(prospect)
  if (current && (current.executionId || current.researchedAt) === id) return current
  const client = effectiveDataMode === 'local' ? null : getSupabaseClient()
  if (!client || !/^[a-f\d-]{36}$/i.test(id)) return null
  let query = client.from('prospecting_ai_jobs').select('input,result').eq('id', id)
    .eq('organization_id', prospect.workspaceId).eq('status', 'completed')
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error || !data) return null
  const input = data.input as Partial<AiSearchInput> | null
  const label = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  if (input?.source !== 'manual' || (input.prospectId ? input.prospectId !== prospect.id
    : label(input.segment || '') !== label(prospect.company) || label(input.city || '') !== label(prospect.city))) return null
  return { ...validateAiResponse(data.result), executionId: id }
}

export function researchForProspect(prospect: ProspectRecord): AiResearch | null {
  try { return parseAiResearch(prospect.rawData.aiResearch) } catch { return null }
}

export function safeResearchUrl(value: string) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '' } catch { return '' }
}

export function aiResearchNotes(prospect: ProspectRecord) {
  const research = researchForProspect(prospect)
  if (!research) return ''
  return [
    `Pesquisa com IA: ${research.researchedAt}`,
    research.opportunity ? `Hipótese comercial (IA): ${research.opportunity}` : '',
    research.suggestedApproach ? `Sugestão de abordagem (IA): ${research.suggestedApproach}` : '',
    ...research.sources.map((source) => `Fonte: ${safeResearchUrl(source.url)}`).filter((line) => line !== 'Fonte: '),
    ...research.evidence.map((fact) => `${aiFieldLabels[fact.field] || fact.field}: ${fact.value} · ${safeResearchUrl(fact.sourceUrl)}`),
  ].filter(Boolean).join('\n')
}
