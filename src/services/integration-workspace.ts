import type { LeadPriority, LeadTemperature } from '../domain/types'
import { env } from '../lib/env'
import { safeStorage } from '../lib/storage'
import { getSupabaseClient } from '../lib/supabase'
import type { Database, Json } from '../lib/supabase.types'
import { createUuid } from '../lib/id'

export type IntegrationProvider = 'extension' | 'supabase' | 'whatsapp' | 'instagram' | 'email' | 'google_calendar' | 'outlook' | 'telephony' | 'webhook'
export type IntegrationStatus = 'connected' | 'disconnected' | 'attention' | 'error' | 'assisted' | 'planned'
export type IntegrationEventStatus = 'processed' | 'partial' | 'failed' | 'skipped'
export type ExtensionDestination = 'garimpo' | 'crm'
export type ExtensionDuplicatePolicy = 'skip' | 'update' | 'create'

export interface ExtensionIntegrationConfig {
  enabled: boolean
  destination: ExtensionDestination
  defaultStageId: string
  defaultOwnerId: string | null
  defaultOwnerName: string
  priority: LeadPriority
  temperature: LeadTemperature
  tags: string[]
  duplicatePolicy: ExtensionDuplicatePolicy
  createNextAction: boolean
  nextActionDelayHours: number
  startCadence: boolean
  cadenceName: string
  notifySeller: boolean
  prepareWhatsApp: boolean
  prepareEmail: boolean
}

export interface IntegrationConnection {
  id: string
  workspaceId: string
  provider: IntegrationProvider
  status: IntegrationStatus
  enabled: boolean
  settings: Record<string, unknown>
  hasCredential: boolean
  lastReceivedAt: string | null
  lastTestedAt: string | null
  lastError: string | null
  receivedCount: number
  errorCount: number
  clientVersion: string | null
  connectionName: string | null
  lastBatchId: string | null
  lastLatencyMs: number | null
  updatedAt: string
}

export interface IntegrationEvent {
  id: string
  workspaceId: string
  provider: IntegrationProvider
  direction: 'inbound' | 'outbound'
  eventType: string
  status: IntegrationEventStatus
  itemCount: number
  externalId: string | null
  errorMessage: string | null
  metadata: Record<string, unknown>
  createdAt: string
  processedAt: string | null
}

export interface IntegrationWorkspaceState {
  connections: IntegrationConnection[]
  events: IntegrationEvent[]
}

const STORAGE_PREFIX = 'realtalent-crm-v100-integrations:'
const recordId = createUuid
const now = () => new Date().toISOString()
const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, Math.round(numeric))) : fallback
}
const cleanText = (value: unknown, maximum: number) => typeof value === 'string' ? value.trim().slice(0, maximum) : ''
const cleanTags = (value: unknown) => Array.isArray(value)
  ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))).slice(0, 20).map((item) => item.slice(0, 40))
  : []

export const defaultExtensionConfig = (defaultStageId = '', owner?: { id: string; name: string } | null): ExtensionIntegrationConfig => ({
  enabled: true,
  destination: 'garimpo',
  defaultStageId,
  defaultOwnerId: owner?.id ?? null,
  defaultOwnerName: owner?.name ?? '',
  priority: 'medium',
  temperature: 'warm',
  tags: ['Extensão RealTalent'],
  duplicatePolicy: 'skip',
  createNextAction: true,
  nextActionDelayHours: 2,
  startCadence: true,
  cadenceName: 'Primeiro contato',
  notifySeller: true,
  prepareWhatsApp: true,
  prepareEmail: false,
})

export function normalizeExtensionConfig(value: unknown, fallback = defaultExtensionConfig()): ExtensionIntegrationConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const input = value as Partial<ExtensionIntegrationConfig>
  return {
    enabled: input.enabled !== false,
    destination: input.destination === 'crm' ? 'crm' : 'garimpo',
    defaultStageId: cleanText(input.defaultStageId, 120) || fallback.defaultStageId,
    defaultOwnerId: cleanText(input.defaultOwnerId, 120) || null,
    defaultOwnerName: cleanText(input.defaultOwnerName, 120),
    priority: ['low', 'medium', 'high', 'urgent'].includes(String(input.priority)) ? input.priority! : fallback.priority,
    temperature: ['cold', 'warm', 'hot'].includes(String(input.temperature)) ? input.temperature! : fallback.temperature,
    tags: cleanTags(input.tags).length ? cleanTags(input.tags) : fallback.tags,
    duplicatePolicy: ['skip', 'update', 'create'].includes(String(input.duplicatePolicy)) ? input.duplicatePolicy! : fallback.duplicatePolicy,
    createNextAction: input.createNextAction !== false,
    nextActionDelayHours: clampInteger(input.nextActionDelayHours, 1, 720, fallback.nextActionDelayHours),
    startCadence: Boolean(input.startCadence),
    cadenceName: cleanText(input.cadenceName, 120) || fallback.cadenceName,
    notifySeller: input.notifySeller !== false,
    prepareWhatsApp: input.prepareWhatsApp !== false,
    prepareEmail: Boolean(input.prepareEmail),
  }
}

const blankState = (): IntegrationWorkspaceState => ({ connections: [], events: [] })
const storageKey = (workspaceId: string) => `${STORAGE_PREFIX}${workspaceId}`

function readLocalState(workspaceId: string): IntegrationWorkspaceState {
  const raw = safeStorage.getItem(storageKey(workspaceId))
  if (!raw) return blankState()
  try {
    const parsed = JSON.parse(raw) as Partial<IntegrationWorkspaceState>
    return {
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      events: Array.isArray(parsed.events) ? parsed.events.slice(0, 100) : [],
    }
  } catch { return blankState() }
}

function writeLocalState(workspaceId: string, state: IntegrationWorkspaceState) {
  safeStorage.setItem(storageKey(workspaceId), JSON.stringify({ ...state, events: state.events.slice(0, 100) }))
}

type ConnectionRow = Database['public']['Tables']['integration_connections']['Row']
type EventRow = Database['public']['Tables']['integration_events']['Row']

const objectValue = (value: Json): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const mapConnection = (row: ConnectionRow): IntegrationConnection => ({
  id: row.id,
  workspaceId: row.organization_id,
  provider: row.provider as IntegrationProvider,
  status: row.status as IntegrationStatus,
  enabled: row.enabled,
  settings: objectValue(row.settings),
  hasCredential: row.has_credential,
  lastReceivedAt: row.last_received_at,
  lastTestedAt: row.last_tested_at,
  lastError: row.last_error,
  receivedCount: row.received_count,
  errorCount: row.error_count,
  clientVersion: row.client_version,
  connectionName: row.connection_name,
  lastBatchId: row.last_batch_id,
  lastLatencyMs: row.last_latency_ms,
  updatedAt: row.updated_at,
})
const mapEvent = (row: EventRow): IntegrationEvent => ({
  id: row.id,
  workspaceId: row.organization_id,
  provider: row.provider as IntegrationProvider,
  direction: row.direction as IntegrationEvent['direction'],
  eventType: row.event_type,
  status: row.status as IntegrationEventStatus,
  itemCount: row.item_count,
  externalId: row.external_id,
  errorMessage: row.error_message,
  metadata: objectValue(row.metadata),
  createdAt: row.created_at,
  processedAt: row.processed_at,
})

export async function loadIntegrationWorkspace(workspaceId: string): Promise<IntegrationWorkspaceState> {
  const local = readLocalState(workspaceId)
  const client = getSupabaseClient()
  if (!client) return local
  const [{ data: connections, error: connectionError }, { data: events, error: eventError }] = await Promise.all([
    client.from('integration_connections').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }),
    client.from('integration_events').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(100),
  ])
  if (connectionError || eventError) return local
  const state = { connections: (connections ?? []).map(mapConnection), events: (events ?? []).map(mapEvent) }
  writeLocalState(workspaceId, state)
  return state
}

export function findExtensionConfig(state: IntegrationWorkspaceState, fallback: ExtensionIntegrationConfig) {
  const connection = state.connections.find((item) => item.provider === 'extension')
  return normalizeExtensionConfig(connection?.settings, fallback)
}

export async function saveExtensionConnection(workspaceId: string, config: ExtensionIntegrationConfig) {
  const normalized = normalizeExtensionConfig(config)
  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client.from('integration_connections').upsert({
      organization_id: workspaceId,
      provider: 'extension',
      enabled: normalized.enabled,
      status: normalized.enabled ? 'attention' : 'disconnected',
      settings: JSON.parse(JSON.stringify(normalized)) as Json,
      updated_at: now(),
    }, { onConflict: 'organization_id,provider' }).select('*').single()
    if (error) throw new Error(`Não foi possível salvar a integração: ${error.message}`)
    const local = readLocalState(workspaceId)
    const mapped = mapConnection(data)
    const next = { ...local, connections: [mapped, ...local.connections.filter((item) => item.provider !== 'extension')] }
    writeLocalState(workspaceId, next)
    return mapped
  }
  const local = readLocalState(workspaceId)
  const previous = local.connections.find((item) => item.provider === 'extension')
  const connection: IntegrationConnection = {
    id: previous?.id ?? recordId(), workspaceId, provider: 'extension', enabled: normalized.enabled,
    status: normalized.enabled ? 'connected' : 'disconnected', settings: { ...normalized }, hasCredential: false,
    lastReceivedAt: previous?.lastReceivedAt ?? null, lastTestedAt: previous?.lastTestedAt ?? null,
    lastError: null, receivedCount: previous?.receivedCount ?? 0, errorCount: previous?.errorCount ?? 0,
    clientVersion: previous?.clientVersion ?? null, connectionName: previous?.connectionName ?? null,
    lastBatchId: previous?.lastBatchId ?? null, lastLatencyMs: previous?.lastLatencyMs ?? null, updatedAt: now(),
  }
  writeLocalState(workspaceId, { ...local, connections: [connection, ...local.connections.filter((item) => item.provider !== 'extension')] })
  return connection
}

export async function rotateExtensionToken(workspaceId: string) {
  const client = getSupabaseClient()
  if (!client) throw new Error('O token é necessário somente no modo hospedado com Supabase conectado.')
  const { data, error } = await client.rpc('rotate_extension_ingest_token', { p_organization_id: workspaceId })
  if (error) throw new Error(`Não foi possível gerar o token: ${error.message}`)
  if (typeof data !== 'string' || !data.startsWith('rt_live_')) throw new Error('O servidor não retornou um token válido.')
  return data
}

export async function revokeExtensionToken(workspaceId: string) {
  const client = getSupabaseClient()
  if (!client) return
  const { error } = await client.rpc('revoke_extension_ingest_token', { p_organization_id: workspaceId })
  if (error) throw new Error(`Não foi possível revogar o token: ${error.message}`)
}

export function extensionEndpoint() {
  return env.supabaseUrl ? `${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/extension-ingest` : ''
}

export async function testExtensionConnection(workspaceId: string, config: ExtensionIntegrationConfig) {
  const client = getSupabaseClient()
  if (!config.enabled) return { ok: false, message: 'A entrada da extensão está desativada.' }
  if (config.destination === 'crm' && !config.defaultStageId) return { ok: false, message: 'Escolha a etapa inicial antes de enviar direto ao CRM.' }
  if (!client) {
    const local = readLocalState(workspaceId)
    const previous = local.connections.find((item) => item.provider === 'extension')
    const updated = previous ? { ...previous, status: 'connected' as const, lastTestedAt: now(), lastError: null, updatedAt: now() } : null
    if (updated) writeLocalState(workspaceId, { ...local, connections: [updated, ...local.connections.filter((item) => item.provider !== 'extension')] })
    return { ok: true, message: 'Caixa local pronta para receber capturas neste navegador.' }
  }
  const { data, error } = await client.from('integration_connections').select('has_credential').eq('organization_id', workspaceId).eq('provider', 'extension').maybeSingle()
  if (error) return { ok: false, message: error.message }
  if (!data?.has_credential) return { ok: false, message: 'Gere um token para autenticar a extensão.' }
  await client.from('integration_connections').update({ status: 'connected', last_tested_at: now(), last_error: null }).eq('organization_id', workspaceId).eq('provider', 'extension')
  return { ok: true, message: 'Configuração válida. Endpoint e token estão prontos.' }
}

export function recordLocalIntegrationEvent(workspaceId: string, itemCount: number, eventType = 'extension_capture') {
  const state = readLocalState(workspaceId)
  const createdAt = now()
  const event: IntegrationEvent = {
    id: recordId(), workspaceId, provider: 'extension', direction: 'inbound', eventType, status: 'processed', itemCount,
    externalId: null, errorMessage: null, metadata: { mode: 'local' }, createdAt, processedAt: createdAt,
  }
  const previous = state.connections.find((item) => item.provider === 'extension')
  const connection: IntegrationConnection = previous ? {
    ...previous, status: 'connected', lastReceivedAt: createdAt, receivedCount: previous.receivedCount + itemCount, updatedAt: createdAt,
  } : {
    id: recordId(), workspaceId, provider: 'extension', status: 'connected', enabled: true,
    settings: { ...defaultExtensionConfig() }, hasCredential: false, lastReceivedAt: createdAt, lastTestedAt: null, lastError: null,
    receivedCount: itemCount, errorCount: 0, clientVersion: null, connectionName: 'Caixa local',
    lastBatchId: null, lastLatencyMs: null, updatedAt: createdAt,
  }
  writeLocalState(workspaceId, { connections: [connection, ...state.connections.filter((item) => item.provider !== 'extension')], events: [event, ...state.events] })
}
