import type { Lead } from '../domain/types'
import { safeStorage } from '../lib/storage'
import { getSupabaseClient } from '../lib/supabase'
import type { Database, Json } from '../lib/supabase.types'
import { createUuid } from '../lib/id'

export type ProspectSource = 'maps' | 'instagram' | 'cnpj' | 'extension' | 'manual'
export type ProspectStatus = 'new' | 'analyzing' | 'review' | 'approved' | 'discarded' | 'sent'
export type DuplicateLevel = 'none' | 'possible' | 'confirmed'

export interface ProspectRecord {
  [key: string]: unknown
  id: string
  workspaceId: string
  createdBy: string | null
  name: string
  company: string
  phone: string
  email: string
  city: string
  address: string
  cnpj: string
  instagram: string
  website: string
  bookingUrl: string
  systemName: string
  description: string
  followers: number | null
  source: ProspectSource
  sourceDetail: string
  status: ProspectStatus
  confidence: number
  duplicateLevel: DuplicateLevel
  duplicateLeadId: string | null
  duplicateReasons: string[]
  notes: string
  rawData: Record<string, unknown>
  createdAt: string
  updatedAt: string
  analyzedAt: string | null
  sentAt: string | null
}

export interface ProspectingHistoryItem {
  id: string
  workspaceId: string
  action: 'search' | 'capture' | 'import' | 'analyze' | 'approve' | 'discard' | 'send' | 'merge' | 'delete'
  title: string
  description: string
  count: number
  createdAt: string
}

export interface ProspectingState {
  prospects: ProspectRecord[]
  history: ProspectingHistoryItem[]
  lastExtensionSyncAt: string | null
  /** Decisões da triagem bruta neste navegador (não sincronizadas entre dispositivos). */
  rawSourceDecisions?: Record<string, 'ignored' | 'promoted'>
}

export interface DuplicateResult {
  level: DuplicateLevel
  leadId: string | null
  score: number
  reasons: string[]
}

export interface CaptureDraft {
  name?: string
  company?: string
  phone?: string
  email?: string
  city?: string
  address?: string
  cnpj?: string
  instagram?: string
  website?: string
  bookingUrl?: string
  systemName?: string
  description?: string
  followers?: number | string | null
  source?: ProspectSource | string
  sourceDetail?: string
  notes?: string
  [key: string]: unknown
}

const STORAGE_PREFIX = 'realtalent-crm-v100-prospecting'
export const EXTENSION_INBOX_KEY = 'realtalent-extension-inbox-v1'
export const EXTENSION_MESSAGE_TYPE = 'REALTALENT_PROSPECTS'

export const prospectSourceLabels: Record<ProspectSource, string> = {
  maps: 'Google Maps',
  instagram: 'Instagram',
  cnpj: 'CNPJ',
  extension: 'RT Capture Browser',
  manual: 'Manual',
}

export const prospectStatusLabels: Record<ProspectStatus, string> = {
  new: 'Novo',
  analyzing: 'Analisando',
  review: 'Revisar',
  approved: 'Aprovado',
  discarded: 'Descartado',
  sent: 'Enviado',
}

const blankState = (): ProspectingState => ({ prospects: [], history: [], lastExtensionSyncAt: null, rawSourceDecisions: {} })
const storageKey = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`
const text = (value: unknown) => typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
const digits = (value: string) => value.replace(/\D/g, '')
const cleanUrl = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '').toLocaleLowerCase('pt-BR')
const cleanInstagram = (value: string) => value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLocaleLowerCase('pt-BR')
const cleanText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')
const normalizeCnpj = (value: string) => digits(value).slice(0, 14)

const isSource = (value: string): value is ProspectSource => ['maps', 'instagram', 'cnpj', 'extension', 'manual'].includes(value)
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const recordId = createUuid

export function readProspectingState(workspaceId: string): ProspectingState {
  const raw = safeStorage.getItem(storageKey(workspaceId))
  if (!raw) return blankState()
  try {
    const parsed = JSON.parse(raw) as Partial<ProspectingState>
    return {
      prospects: Array.isArray(parsed.prospects) ? parsed.prospects.map((prospect) => ({ ...prospect, createdBy: prospect.createdBy ?? null, id: uuidPattern.test(prospect.id) ? prospect.id : recordId() })) : [],
      history: Array.isArray(parsed.history) ? parsed.history.map((item) => ({ ...item, id: uuidPattern.test(item.id) ? item.id : recordId() })) : [],
      lastExtensionSyncAt: typeof parsed.lastExtensionSyncAt === 'string' ? parsed.lastExtensionSyncAt : null,
      rawSourceDecisions: parsed.rawSourceDecisions && typeof parsed.rawSourceDecisions === 'object' && !Array.isArray(parsed.rawSourceDecisions)
        ? Object.fromEntries(Object.entries(parsed.rawSourceDecisions).filter(([key, value]) => key.length <= 1000 && (value === 'ignored' || value === 'promoted')).slice(-1500)) : {},
    }
  } catch { return blankState() }
}

export function cacheProspectingStateLocally(workspaceId: string, state: ProspectingState) {
  safeStorage.setItem(storageKey(workspaceId), JSON.stringify(state))
}

export function writeProspectingState(workspaceId: string, state: ProspectingState) {
  // Never mirror a partial user-scoped snapshot as a full workspace replacement.
  const previous = readProspectingState(workspaceId)
  cacheProspectingStateLocally(workspaceId, state)
  scheduleRemoteSync(workspaceId, previous, state)
}

type ProspectRow = Database['public']['Tables']['prospecting_leads']['Row']
type ProspectEventRow = Database['public']['Tables']['prospecting_events']['Row']
const syncTimers = new Map<string, number>()
const pendingSync = new Map<string, ProspectingState>()
const remoteOperations = new Map<string, Promise<void>>()

const enqueueRemoteOperation = (workspaceId: string, action: () => Promise<void>): Promise<void> => {
  const previous = remoteOperations.get(workspaceId) ?? Promise.resolve()
  const queued = previous.catch(() => undefined).then(action)
  remoteOperations.set(workspaceId, queued)
  void queued.then(() => {
    if (remoteOperations.get(workspaceId) === queued) remoteOperations.delete(workspaceId)
  }, () => {
    if (remoteOperations.get(workspaceId) === queued) remoteOperations.delete(workspaceId)
  })
  return queued
}

const mapProspectRow = (row: ProspectRow): ProspectRecord => ({
  id: row.id, workspaceId: row.organization_id, createdBy: row.created_by ?? null, name: row.name, company: row.company, phone: row.phone, email: row.email, city: row.city,
  address: row.address, cnpj: row.cnpj, instagram: row.instagram, website: row.website, bookingUrl: row.booking_url, systemName: row.system_name,
  description: row.description, followers: row.followers, source: row.source, sourceDetail: row.source_detail, status: row.status, confidence: row.confidence,
  duplicateLevel: row.duplicate_level, duplicateLeadId: row.duplicate_lead_id, duplicateReasons: row.duplicate_reasons, notes: row.notes,
  rawData: row.raw_data && typeof row.raw_data === 'object' && !Array.isArray(row.raw_data) ? row.raw_data as Record<string, unknown> : {},
  createdAt: row.created_at, updatedAt: row.updated_at, analyzedAt: row.analyzed_at, sentAt: row.sent_at,
})
const mapHistoryRow = (row: ProspectEventRow): ProspectingHistoryItem => ({ id: row.id, workspaceId: row.organization_id, action: row.action as ProspectingHistoryItem['action'], title: row.title, description: row.description, count: row.item_count, createdAt: row.created_at })

export async function readRemoteProspectingState(workspaceId: string): Promise<ProspectingState | null> {
  const client = getSupabaseClient(); if (!client) return null
  const [{ data: prospects, error: prospectError }, { data: history, error: historyError }] = await Promise.all([
    client.from('prospecting_leads').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }),
    client.from('prospecting_events').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(300),
  ])
  if (prospectError || historyError) return null
  return { prospects: (prospects ?? []).map(mapProspectRow), history: (history ?? []).map(mapHistoryRow), lastExtensionSyncAt: null }
}

const syncRemote = async (workspaceId: string, state: ProspectingState) => {
  const client = getSupabaseClient(); if (!client) return
  const prospectRows: Database['public']['Tables']['prospecting_leads']['Insert'][] = state.prospects.map((item) => ({
    id: item.id, organization_id: workspaceId, created_by: item.createdBy, name: item.name, company: item.company, phone: item.phone, email: item.email, city: item.city,
    address: item.address, cnpj: item.cnpj, instagram: item.instagram, website: item.website, booking_url: item.bookingUrl, system_name: item.systemName,
    description: item.description, followers: item.followers, source: item.source, source_detail: item.sourceDetail, status: item.status, confidence: item.confidence,
    duplicate_level: item.duplicateLevel, duplicate_lead_id: item.duplicateLeadId, duplicate_reasons: item.duplicateReasons, notes: item.notes,
    raw_data: JSON.parse(JSON.stringify(item.rawData)) as Json, created_at: item.createdAt, updated_at: item.updatedAt, analyzed_at: item.analyzedAt, sent_at: item.sentAt,
  }))
  const historyRows: Database['public']['Tables']['prospecting_events']['Insert'][] = state.history.map((item) => ({ id: item.id, organization_id: workspaceId, action: item.action, title: item.title, description: item.description, item_count: item.count, created_at: item.createdAt }))
  if (prospectRows.length) {
    const { error } = await client.from('prospecting_leads').upsert(prospectRows)
    if (error) throw error
  }
  if (historyRows.length) {
    const { error } = await client.from('prospecting_events').upsert(historyRows)
    if (error) throw error
  }
  // No workspace-wide DELETE here. Other users' records and unloaded pages are not missing data.
}

const uniqueById = <T extends { id: string }>(items: T[]): T[] => [...new Map(items.map((item) => [item.id, item])).values()]

const scheduleRemoteSync = (workspaceId: string, previous: ProspectingState, state: ProspectingState) => {
  if (!getSupabaseClient()) return
  const before = new Map(previous.prospects.map((item) => [item.id, item]))
  const beforeHistory = new Map(previous.history.map((item) => [item.id, item]))
  const changed = state.prospects.filter((item) => JSON.stringify(before.get(item.id)) !== JSON.stringify(item))
  const newEvents = state.history.filter((item) => JSON.stringify(beforeHistory.get(item.id)) !== JSON.stringify(item))
  if (!changed.length && !newEvents.length) return
  const pending = pendingSync.get(workspaceId)
  pendingSync.set(workspaceId, {
    ...state,
    prospects: uniqueById([...(pending?.prospects ?? []), ...changed]),
    history: uniqueById([...(pending?.history ?? []), ...newEvents]),
  })
  const existing = syncTimers.get(workspaceId)
  if (existing) window.clearTimeout(existing)
  syncTimers.set(workspaceId, window.setTimeout(() => {
    syncTimers.delete(workspaceId)
    const next = pendingSync.get(workspaceId)
    pendingSync.delete(workspaceId)
    if (next) void enqueueRemoteOperation(workspaceId, () => syncRemote(workspaceId, next))
      .catch((error) => console.error('[Garimpo] Falha ao sincronizar registros alterados:', error))
  }, 350))
}

/**
 * Explicit record deletion. Never infer deletions from a filtered snapshot.
 * Database row-level policies remain authoritative for the current user.
 */
export async function deleteProspectingRecords(workspaceId: string, selectedIds: string[]): Promise<void> {
  const ids = [...new Set(selectedIds)].filter((id) => uuidPattern.test(id))
  if (!workspaceId || !ids.length || ids.length !== new Set(selectedIds).size) throw new Error('Seleção de exclusão inválida.')
  const client = getSupabaseClient()
  if (!client) return // Local/demo workspaces are stored only in the browser.
  const timer = syncTimers.get(workspaceId)
  if (timer) window.clearTimeout(timer)
  syncTimers.delete(workspaceId)
  const pending = pendingSync.get(workspaceId)
  pendingSync.delete(workspaceId)
  if (pending) await enqueueRemoteOperation(workspaceId, () => syncRemote(workspaceId, pending))
  await enqueueRemoteOperation(workspaceId, async () => {
    const { data, error } = await client.from('prospecting_leads')
      .delete().eq('organization_id', workspaceId).in('id', ids).select('id')
    if (error) throw error
    const deleted = new Set((data ?? []).map((item) => item.id))
    if (ids.some((id) => !deleted.has(id))) {
      throw new Error('A exclusão não foi confirmada para todos os registros. Verifique suas permissões e atualize a página.')
    }
  })
}

export function appendHistory(state: ProspectingState, workspaceId: string, item: Omit<ProspectingHistoryItem, 'id' | 'workspaceId' | 'createdAt'>): ProspectingState {
  return {
    ...state,
    history: [{ id: recordId(), workspaceId, createdAt: new Date().toISOString(), ...item }, ...state.history].slice(0, 300),
  }
}

export function calculateProspectConfidence(input: CaptureDraft) {
  let score = 12
  if (text(input.name) || text(input.company)) score += 18
  if (digits(text(input.phone)).length >= 10) score += 20
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(input.email))) score += 10
  if (text(input.city)) score += 8
  if (normalizeCnpj(text(input.cnpj)).length === 14) score += 16
  if (cleanInstagram(text(input.instagram))) score += 8
  if (cleanUrl(text(input.website))) score += 8
  if (text(input.address)) score += 5
  if (text(input.description)) score += 3
  return Math.min(100, score)
}

export function detectProspectDuplicate(input: CaptureDraft, leads: Lead[]): DuplicateResult {
  const phone = digits(text(input.phone))
  const cnpj = normalizeCnpj(text(input.cnpj))
  const instagram = cleanInstagram(text(input.instagram))
  const website = cleanUrl(text(input.website)).split('/')[0]
  const name = cleanText(text(input.company) || text(input.name))
  const city = cleanText(text(input.city))

  let best: DuplicateResult = { level: 'none', leadId: null, score: 0, reasons: [] }
  for (const lead of leads) {
    let score = 0
    const reasons: string[] = []
    const leadPhone = digits(lead.phone)
    const notes = `${lead.notes} ${lead.tags.join(' ')}`
    const leadCnpj = normalizeCnpj(notes.match(/\b\d{2}\.?\d{3}\.?\d{3}[/\-]?\d{4}-?\d{2}\b/)?.[0] ?? '')
    const leadInstagram = cleanInstagram(notes.match(/(?:instagram\.com\/|@)([a-zA-Z0-9._]+)/)?.[0] ?? '')
    const leadWebsite = cleanUrl(notes.match(/https?:\/\/[^\s]+/)?.[0] ?? '').split('/')[0]
    const leadName = cleanText(lead.company || lead.name)
    const leadCity = cleanText(lead.city)

    if (phone.length >= 10 && phone === leadPhone) { score += 100; reasons.push('Mesmo telefone') }
    if (cnpj.length === 14 && cnpj === leadCnpj) { score += 100; reasons.push('Mesmo CNPJ') }
    if (instagram && instagram === leadInstagram) { score += 80; reasons.push('Mesmo Instagram') }
    if (website && website === leadWebsite) { score += 75; reasons.push('Mesmo domínio') }
    if (name && name === leadName) { score += city && city === leadCity ? 65 : 42; reasons.push(city && city === leadCity ? 'Mesmo nome e cidade' : 'Mesmo nome') }

    if (score > best.score) best = { level: score >= 80 ? 'confirmed' : score >= 42 ? 'possible' : 'none', leadId: lead.id, score, reasons }
  }
  return best
}


function normalizeCaptureDraft(draft: CaptureDraft): CaptureDraft {
  const get = (...keys: string[]): string => {
    for (const key of keys) {
      const value = text(draft[key])
      if (value) return value
    }
    return ''
  }
  const sourceRaw = text(get('source', 'origem')).toLocaleLowerCase('pt-BR')
  const sourceMap: Record<string, ProspectSource> = {
    maps: 'maps', 'google maps': 'maps', googlemaps: 'maps', instagram: 'instagram', cnpj: 'cnpj',
    extension: 'extension', extensao: 'extension', 'extensão': 'extension', chrome: 'extension', manual: 'manual',
  }
  return {
    ...draft,
    name: get('name', 'nome', 'contactName', 'nome_contato'),
    company: get('company', 'empresa', 'nome_fantasia', 'businessName', 'razao_social'),
    phone: get('phone', 'telefone', 'whatsapp', 'celular'),
    email: get('email', 'e_mail'),
    city: get('city', 'cidade', 'municipio'),
    address: get('address', 'endereco', 'logradouro'),
    cnpj: get('cnpj', 'document', 'documento'),
    instagram: get('instagram', 'perfil', 'instagram_url'),
    website: get('website', 'site', 'url'),
    bookingUrl: get('bookingUrl', 'booking_url', 'agendamento', 'link_agendamento'),
    systemName: get('systemName', 'system_name', 'sistema', 'sistema_identificado'),
    description: get('description', 'descricao', 'bio'),
    followers: get('followers', 'seguidores'),
    source: sourceMap[sourceRaw] ?? draft.source,
    sourceDetail: get('sourceDetail', 'source_detail', 'detalhe_origem'),
    notes: get('notes', 'observacoes', 'observação'),
  }
}
export function createProspect(workspaceId: string, draft: CaptureDraft, fallbackSource: ProspectSource = 'manual', leads: Lead[] = [], createdBy: string | null = null): ProspectRecord {
  draft = normalizeCaptureDraft(draft)
  const now = new Date().toISOString()
  const sourceText = text(draft.source).toLocaleLowerCase('pt-BR')
  const source = isSource(sourceText) ? sourceText : fallbackSource
  const duplicate = detectProspectDuplicate(draft, leads)
  const followersRaw = draft.followers
  const followers = followersRaw == null || followersRaw === '' ? null : Number(String(followersRaw).replace(/\D/g, ''))
  const name = text(draft.name) || text(draft.company) || 'Lead sem nome'
  return {
    id: recordId(), workspaceId, createdBy, name, company: text(draft.company) || name,
    phone: text(draft.phone), email: text(draft.email), city: text(draft.city), address: text(draft.address),
    cnpj: text(draft.cnpj), instagram: text(draft.instagram), website: text(draft.website), bookingUrl: text(draft.bookingUrl),
    systemName: text(draft.systemName), description: text(draft.description), followers: Number.isFinite(followers) ? followers : null,
    source, sourceDetail: text(draft.sourceDetail), status: 'new', confidence: calculateProspectConfidence(draft),
    duplicateLevel: duplicate.level, duplicateLeadId: duplicate.leadId, duplicateReasons: duplicate.reasons,
    notes: text(draft.notes), rawData: { ...draft }, createdAt: now, updatedAt: now, analyzedAt: null, sentAt: null,
  }
}

export function refreshProspectAnalysis(prospect: ProspectRecord, leads: Lead[]): ProspectRecord {
  const duplicate = detectProspectDuplicate(prospect, leads)
  return {
    ...prospect,
    confidence: calculateProspectConfidence(prospect),
    duplicateLevel: duplicate.level,
    duplicateLeadId: duplicate.leadId,
    duplicateReasons: duplicate.reasons,
    status: prospect.status === 'new' || prospect.status === 'analyzing' ? 'review' : prospect.status,
    analyzedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export interface BrowserCapturePayload {
  url?: string
  title?: string
  selection?: string
}

const decodeUrlLabel = (value: string) => {
  try { return decodeURIComponent(value.replace(/\+/g, ' ')).replace(/[-_]+/g, ' ').trim() } catch { return value.replace(/[-_]+/g, ' ').trim() }
}

export function captureDraftFromBrowserPayload(payload: BrowserCapturePayload): CaptureDraft | null {
  const url = text(payload.url)
  const title = text(payload.title).replace(/\s+[|·-]\s+(Google Maps|Instagram|Google).*$/i, '').trim()
  const selection = text(payload.selection).slice(0, 4000)
  if (!url && !title && !selection) return null

  let parsed: URL | null = null
  try { parsed = url ? new URL(url) : null } catch { parsed = null }
  const host = parsed?.hostname.replace(/^www\./i, '').toLocaleLowerCase('pt-BR') ?? ''
  const rawPath = parsed?.pathname ?? ''
  const base: CaptureDraft = { source: 'manual', sourceDetail: 'Captura universal do navegador', browserCaptureUrl: url, browserCaptureTitle: title, browserCaptureSelection: selection }

  if (/google\.[^/]+$/.test(host) && rawPath.includes('/maps')) {
    const placeMatch = rawPath.match(/\/place\/([^/]+)/i)
    const mapName = placeMatch ? decodeUrlLabel(placeMatch[1]) : title
    return { ...base, source: 'maps', name: mapName || title, company: mapName || title, sourceDetail: 'Captura universal · Google Maps' }
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    const username = rawPath.split('/').filter(Boolean)[0] ?? ''
    const label = title || username.replace(/[._]+/g, ' ')
    return { ...base, source: 'instagram', name: label, company: label, instagram: url || username, sourceDetail: 'Captura universal · Instagram' }
  }
  const cnpjMatch = `${url} ${title} ${selection}`.match(/\b\d{2}\.?\d{3}\.?\d{3}[\/-]?\d{4}-?\d{2}\b/)
  if (cnpjMatch) return { ...base, source: 'cnpj', name: title, company: title, cnpj: cnpjMatch[0], sourceDetail: 'Captura universal · CNPJ' }
  if (parsed) {
    const label = title || host.split('.')[0].replace(/[-_]+/g, ' ')
    return { ...base, source: 'manual', name: label, company: label, website: url, sourceDetail: `Captura universal · ${host || 'URL'}` }
  }
  if (selection.includes('|')) return { ...parseQuickCaptureLines(selection)[0], ...base, sourceDetail: 'Captura universal · texto selecionado' }
  return { ...base, name: title || selection.split(/\r?\n/)[0]?.slice(0, 120), company: title || selection.split(/\r?\n/)[0]?.slice(0, 120), notes: selection, sourceDetail: 'Captura universal · texto' }
}

export function parseUniversalCaptureInput(value: string): CaptureDraft[] {
  const trimmed = value.trim()
  if (!trimmed) return []
  if (/^https?:\/\//i.test(trimmed)) {
    const draft = captureDraftFromBrowserPayload({ url: trimmed })
    return draft ? [draft] : []
  }
  if (trimmed.startsWith('{')) {
    try {
      const payload = JSON.parse(trimmed) as BrowserCapturePayload
      const draft = captureDraftFromBrowserPayload(payload)
      return draft ? [draft] : []
    } catch { /* use text parser below */ }
  }
  return parseQuickCaptureLines(trimmed)
}

export function buildBrowserCaptureBookmarklet(crmOrigin: string) {
  const target = `${crmOrigin.replace(/\/$/, '')}/#/prospecting?action=browser-capture&capture=`
  return `javascript:(()=>{const p={url:location.href,title:document.title,selection:String(getSelection()||'').trim().slice(0,4000)};open(${JSON.stringify(target)}+encodeURIComponent(JSON.stringify(p)),'_blank')})()`
}

export function parseQuickCaptureLines(value: string): CaptureDraft[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split('|').map((part) => part.trim())
    const [name = '', phone = '', city = '', contact = '', extra = ''] = parts
    const draft: CaptureDraft = { name, company: name, phone, city, sourceDetail: 'Captura assistida' }
    if (/instagram\.com|^@/i.test(contact)) draft.instagram = contact
    else if (/\d{2}\.?\d{3}\.?\d{3}/.test(contact) && digits(contact).length === 14) draft.cnpj = contact
    else if (/^https?:\/\//i.test(contact) || /\.[a-z]{2,}$/i.test(contact)) draft.website = contact
    else if (contact.includes('@')) draft.email = contact
    if (extra) draft.notes = extra
    return draft
  })
}

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = []
  let current = ''; let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index + 1] === '"' && quoted) { current += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) { values.push(current.trim()); current = '' }
    else current += char
  }
  values.push(current.trim()); return values
}

const normalizeHeader = (value: string) => cleanText(value).replace(/\s+/g, '_')
const aliases: Record<string, keyof CaptureDraft> = {
  nome: 'name', name: 'name', empresa: 'company', company: 'company', nome_fantasia: 'company', telefone: 'phone', phone: 'phone', whatsapp: 'phone',
  email: 'email', cidade: 'city', city: 'city', endereco: 'address', address: 'address', cnpj: 'cnpj', instagram: 'instagram', perfil: 'instagram',
  site: 'website', website: 'website', agendamento: 'bookingUrl', booking_url: 'bookingUrl', sistema: 'systemName', descricao: 'description', description: 'description',
  seguidores: 'followers', followers: 'followers', origem: 'source', source: 'source', observacoes: 'notes', notes: 'notes',
}

export function parseProspectCsv(raw: string): CaptureDraft[] {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const headers = splitCsvLine(lines[0], delimiter).map((header) => aliases[normalizeHeader(header)] ?? null)
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter); const draft: CaptureDraft = {}
    headers.forEach((header, index) => { if (header) draft[header] = values[index] ?? '' })
    return draft
  }).filter((draft) => text(draft.name) || text(draft.company) || text(draft.phone) || text(draft.instagram) || text(draft.cnpj))
}

export function parseProspectJson(raw: string): CaptureDraft[] {
  const parsed = JSON.parse(raw) as unknown
  if (Array.isArray(parsed)) return parsed.filter((item): item is CaptureDraft => Boolean(item && typeof item === 'object'))
  if (parsed && typeof parsed === 'object') {
    const object = parsed as Record<string, unknown>
    if (object.contract === 'realtalent-data-layer/2.5' && Array.isArray(object.records)) {
      return object.records.flatMap((record) => {
        if (!record || typeof record !== 'object') return []
        const entry = record as Record<string, unknown>
        const data = entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data) ? entry.data as CaptureDraft : {}
        const source = typeof entry.source === 'string' ? entry.source : data.source
        const sourceDetail = typeof entry.sourceDetail === 'string' ? entry.sourceDetail : data.sourceDetail
        return [{ ...data, source, sourceDetail, dataLayerIdentityKey: entry.identityKey, dataLayerQuality: entry.quality } satisfies CaptureDraft]
      })
    }
    const list = object.prospects ?? object.leads ?? object.results ?? object.data
    if (Array.isArray(list)) return list.filter((item): item is CaptureDraft => Boolean(item && typeof item === 'object'))
    return [object as CaptureDraft]
  }
  return []
}

export function parseProspectFile(name: string, raw: string): CaptureDraft[] {
  return name.toLocaleLowerCase('pt-BR').endsWith('.json') ? parseProspectJson(raw) : parseProspectCsv(raw)
}

export function buildProspectingSearchUrl(source: ProspectSource, segment: string, city: string, query = '') {
  const term = [query || segment, city].filter(Boolean).join(' ').trim()
  if (source === 'maps') return `https://www.google.com/maps/search/${encodeURIComponent(term)}`
  if (source === 'instagram') return `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${term}`)}`
  if (source === 'cnpj') return `https://www.google.com/search?q=${encodeURIComponent(`${term} CNPJ empresa`)}`
  return `https://www.google.com/search?q=${encodeURIComponent(term)}`
}

export function readExtensionInbox(key = EXTENSION_INBOX_KEY): CaptureDraft[] {
  const raw = safeStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed as CaptureDraft[]
    if (parsed && typeof parsed === 'object') {
      const object = parsed as Record<string, unknown>
      const payload = object.payload ?? object.leads ?? object.results
      return Array.isArray(payload) ? payload as CaptureDraft[] : []
    }
  } catch { return [] }
  return []
}

export function clearExtensionInbox(key = EXTENSION_INBOX_KEY) { safeStorage.removeItem(key) }

export function prospectCompleteness(prospect: ProspectRecord) {
  return [
    { label: 'Empresa identificada', ok: Boolean(prospect.name && prospect.name !== 'Lead sem nome') },
    { label: 'Telefone comercial', ok: digits(prospect.phone).length >= 10 },
    { label: 'Cidade ou endereço', ok: Boolean(prospect.city || prospect.address) },
    { label: 'Canal digital', ok: Boolean(prospect.instagram || prospect.website) },
    { label: 'CNPJ validado', ok: normalizeCnpj(prospect.cnpj).length === 14 },
  ]
}
