import { env } from '../lib/env'
import { createUuid } from '../lib/id'
import { getSupabaseClient } from '../lib/supabase'
import { safeStorage } from '../lib/storage'
import type { Database, Json } from '../lib/supabase.types'

export type OAuthProvider = 'google' | 'microsoft' | 'meta' | 'whatsapp_cloud'
export type ConnectedAccountStatus = 'connected' | 'attention' | 'expired' | 'paused' | 'revoked' | 'error'
export type SyncJobStatus = 'queued' | 'processing' | 'retry' | 'succeeded' | 'failed' | 'dead_letter' | 'cancelled'
export type SyncAttemptStatus = 'succeeded' | 'failed' | 'retry_scheduled'
export type ExtensionProductKey = 'realtalent_capture' | 'realtalent_social' | 'realtalent_linkedin_assistant' | 'realtalent_maps_capture'
export type ExtensionInstallationStatus = 'connected' | 'paused' | 'revoked' | 'error' | 'outdated'
export type ExtensionCaptureJobStatus = 'captured' | 'queued' | 'processing' | 'review' | 'duplicate' | 'approved' | 'sent' | 'discarded' | 'retry' | 'failed' | 'dead_letter' | 'cancelled'
export type ExtensionEventStatus = 'processed' | 'attention' | 'failed' | 'skipped'

export interface ConnectedAccount {
  id: string
  workspaceId: string
  provider: OAuthProvider
  externalAccountId: string
  displayName: string
  status: ConnectedAccountStatus
  scopes: string[]
  hasCredential: boolean
  tokenExpiresAt: string | null
  lastSyncAt: string | null
  nextSyncAt: string | null
  syncCursor: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface IntegrationSyncJob {
  id: string
  workspaceId: string
  accountId: string | null
  provider: OAuthProvider
  jobType: string
  status: SyncJobStatus
  priority: number
  attempts: number
  maxAttempts: number
  availableAt: string
  lockedAt: string | null
  completedAt: string | null
  idempotencyKey: string
  payload: Record<string, unknown>
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface IntegrationSyncAttempt {
  id: string
  workspaceId: string
  jobId: string
  attemptNumber: number
  status: SyncAttemptStatus
  responseCode: number | null
  durationMs: number | null
  errorMessage: string | null
  createdAt: string
}

export interface ConnectDevice {
  id: string
  workspaceId: string
  userId: string
  deviceName: string
  platform: string
  appVersion: string
  status: 'connected' | 'paused' | 'revoked' | 'error'
  lastSeenAt: string
  lastSyncAt: string | null
  pendingItems: number
  lastError: string | null
}

export interface ExtensionInstallation {
  id: string
  workspaceId: string
  userId: string | null
  productKey: ExtensionProductKey
  installationKey: string
  displayName: string
  browser: string
  browserVersion: string
  platform: string
  appVersion: string
  manifestVersion: number
  status: ExtensionInstallationStatus
  permissions: string[]
  capabilities: string[]
  lastSeenAt: string
  lastSyncAt: string | null
  pendingItems: number
  capturedToday: number
  totalCaptured: number
  lastError: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ExtensionProductSettings {
  workspaceId: string
  productKey: ExtensionProductKey
  enabled: boolean
  destination: 'garimpo' | 'crm'
  requireConfirmation: boolean
  duplicatePolicy: 'skip' | 'update' | 'create'
  minimumVersion: string
  recommendedVersion: string
  maxBatchSize: number
  processIntervalMs: number
  closeTabAfterAnalysis: boolean
  allowedSources: string[]
  settings: Record<string, unknown>
  configVersion: number
  updatedBy: string | null
  updatedAt: string
}

export interface ExtensionCaptureJob {
  id: string
  workspaceId: string
  installationId: string | null
  userId: string | null
  productKey: ExtensionProductKey
  source: string
  sourceUrl: string | null
  externalId: string | null
  status: ExtensionCaptureJobStatus
  attempts: number
  maxAttempts: number
  availableAt: string
  idempotencyKey: string
  itemCount: number
  payload: Record<string, unknown>
  result: Record<string, unknown>
  lastError: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ExtensionEvent {
  id: string
  workspaceId: string
  installationId: string | null
  jobId: string | null
  eventType: string
  status: ExtensionEventStatus
  correlationId: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface IntegrationFrameworkState {
  accounts: ConnectedAccount[]
  jobs: IntegrationSyncJob[]
  attempts: IntegrationSyncAttempt[]
  devices: ConnectDevice[]
  extensions: ExtensionInstallation[]
  extensionSettings: ExtensionProductSettings[]
  extensionJobs: ExtensionCaptureJob[]
  extensionEvents: ExtensionEvent[]
}

const STORAGE_PREFIX = 'realtalent-v10040-integrations:'
const now = () => new Date().toISOString()
const key = (workspaceId: string) => `${STORAGE_PREFIX}${workspaceId}`
export const defaultExtensionProductSettings = (workspaceId: string, productKey: ExtensionProductKey = 'realtalent_capture'): ExtensionProductSettings => ({
  workspaceId,
  productKey,
  enabled: true,
  destination: 'garimpo',
  requireConfirmation: true,
  duplicatePolicy: 'skip',
  minimumVersion: '',
  recommendedVersion: '',
  maxBatchSize: 50,
  processIntervalMs: 1200,
  closeTabAfterAnalysis: true,
  allowedSources: ['google_maps', 'google_search', 'instagram', 'cnpj'],
  settings: {},
  configVersion: 1,
  updatedBy: null,
  updatedAt: now(),
})
const blank = (): IntegrationFrameworkState => ({
  accounts: [], jobs: [], attempts: [], devices: [], extensions: [], extensionSettings: [], extensionJobs: [], extensionEvents: [],
})

const readLocal = (workspaceId: string): IntegrationFrameworkState => {
  const raw = safeStorage.getItem(key(workspaceId))
  if (!raw) return blank()
  try {
    const value = JSON.parse(raw) as Partial<IntegrationFrameworkState>
    return {
      accounts: Array.isArray(value.accounts) ? value.accounts : [],
      jobs: Array.isArray(value.jobs) ? value.jobs.slice(0, 250) : [],
      attempts: Array.isArray(value.attempts) ? value.attempts.slice(0, 500) : [],
      devices: Array.isArray(value.devices) ? value.devices : [],
      extensions: Array.isArray(value.extensions) ? value.extensions : [],
      extensionSettings: Array.isArray(value.extensionSettings) ? value.extensionSettings : [],
      extensionJobs: Array.isArray(value.extensionJobs) ? value.extensionJobs.slice(0, 300) : [],
      extensionEvents: Array.isArray(value.extensionEvents) ? value.extensionEvents.slice(0, 500) : [],
    }
  } catch { return blank() }
}
const writeLocal = (workspaceId: string, state: IntegrationFrameworkState) => safeStorage.setItem(key(workspaceId), JSON.stringify({
  accounts: state.accounts,
  jobs: state.jobs.slice(0, 250),
  attempts: state.attempts.slice(0, 500),
  devices: state.devices,
  extensions: state.extensions,
  extensionSettings: state.extensionSettings,
  extensionJobs: state.extensionJobs.slice(0, 300),
  extensionEvents: state.extensionEvents.slice(0, 500),
}))

const objectValue = (value: Json): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
type AccountRow = Database['public']['Tables']['integration_connected_accounts']['Row']
type JobRow = Database['public']['Tables']['integration_sync_jobs']['Row']
type AttemptRow = Database['public']['Tables']['integration_sync_attempts']['Row']
type DeviceRow = Database['public']['Tables']['realtalent_connect_devices']['Row']
type ExtensionInstallationRow = Database['public']['Tables']['extension_installations']['Row']
type ExtensionSettingsRow = Database['public']['Tables']['extension_product_settings']['Row']
type ExtensionJobRow = Database['public']['Tables']['extension_capture_jobs']['Row']
type ExtensionEventRow = Database['public']['Tables']['extension_events']['Row']

const mapAccount = (row: AccountRow): ConnectedAccount => ({
  id: row.id, workspaceId: row.organization_id, provider: row.provider as OAuthProvider,
  externalAccountId: row.external_account_id, displayName: row.display_name, status: row.status as ConnectedAccountStatus,
  scopes: row.scopes, hasCredential: row.has_credential, tokenExpiresAt: row.token_expires_at,
  lastSyncAt: row.last_sync_at, nextSyncAt: row.next_sync_at, syncCursor: row.sync_cursor,
  lastError: row.last_error, createdAt: row.created_at, updatedAt: row.updated_at,
})
const mapJob = (row: JobRow): IntegrationSyncJob => ({
  id: row.id, workspaceId: row.organization_id, accountId: row.account_id, provider: row.provider as OAuthProvider,
  jobType: row.job_type, status: row.status as SyncJobStatus, priority: row.priority, attempts: row.attempts,
  maxAttempts: row.max_attempts, availableAt: row.available_at, lockedAt: row.locked_at, completedAt: row.completed_at,
  idempotencyKey: row.idempotency_key, payload: objectValue(row.payload), lastError: row.last_error,
  createdAt: row.created_at, updatedAt: row.updated_at,
})
const mapAttempt = (row: AttemptRow): IntegrationSyncAttempt => ({
  id: row.id, workspaceId: row.organization_id, jobId: row.job_id, attemptNumber: row.attempt_number,
  status: row.status as SyncAttemptStatus, responseCode: row.response_code, durationMs: row.duration_ms,
  errorMessage: row.error_message, createdAt: row.created_at,
})
const mapDevice = (row: DeviceRow): ConnectDevice => ({
  id: row.id, workspaceId: row.organization_id, userId: row.user_id, deviceName: row.device_name,
  platform: row.platform, appVersion: row.app_version, status: row.status, lastSeenAt: row.last_seen_at,
  lastSyncAt: row.last_sync_at, pendingItems: row.pending_items, lastError: row.last_error,
})
const mapExtension = (row: ExtensionInstallationRow): ExtensionInstallation => ({
  id: row.id, workspaceId: row.organization_id, userId: row.user_id, productKey: row.product_key as ExtensionProductKey,
  installationKey: row.installation_key, displayName: row.display_name, browser: row.browser, browserVersion: row.browser_version,
  platform: row.platform, appVersion: row.app_version, manifestVersion: row.manifest_version,
  status: row.status as ExtensionInstallationStatus, permissions: row.permissions, capabilities: row.capabilities,
  lastSeenAt: row.last_seen_at, lastSyncAt: row.last_sync_at, pendingItems: row.pending_items,
  capturedToday: row.captured_today, totalCaptured: Number(row.total_captured), lastError: row.last_error,
  metadata: objectValue(row.metadata), createdAt: row.created_at, updatedAt: row.updated_at,
})
const mapExtensionSettings = (row: ExtensionSettingsRow): ExtensionProductSettings => ({
  workspaceId: row.organization_id, productKey: row.product_key as ExtensionProductKey, enabled: row.enabled,
  destination: row.destination as 'garimpo' | 'crm', requireConfirmation: row.require_confirmation,
  duplicatePolicy: row.duplicate_policy as 'skip' | 'update' | 'create', minimumVersion: row.minimum_version,
  recommendedVersion: row.recommended_version, maxBatchSize: row.max_batch_size, processIntervalMs: row.process_interval_ms,
  closeTabAfterAnalysis: row.close_tab_after_analysis, allowedSources: row.allowed_sources,
  settings: objectValue(row.settings), configVersion: row.config_version, updatedBy: row.updated_by, updatedAt: row.updated_at,
})
const mapExtensionJob = (row: ExtensionJobRow): ExtensionCaptureJob => ({
  id: row.id, workspaceId: row.organization_id, installationId: row.installation_id, userId: row.user_id,
  productKey: row.product_key as ExtensionProductKey, source: row.source, sourceUrl: row.source_url,
  externalId: row.external_id, status: row.status as ExtensionCaptureJobStatus, attempts: row.attempts,
  maxAttempts: row.max_attempts, availableAt: row.available_at, idempotencyKey: row.idempotency_key,
  itemCount: row.item_count, payload: objectValue(row.payload), result: objectValue(row.result), lastError: row.last_error,
  startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at,
})
const mapExtensionEvent = (row: ExtensionEventRow): ExtensionEvent => ({
  id: row.id, workspaceId: row.organization_id, installationId: row.installation_id, jobId: row.job_id,
  eventType: row.event_type, status: row.status as ExtensionEventStatus, correlationId: row.correlation_id,
  payload: objectValue(row.payload), createdAt: row.created_at,
})

export async function loadIntegrationFramework(workspaceId: string): Promise<IntegrationFrameworkState> {
  const local = readLocal(workspaceId)
  const client = getSupabaseClient()
  if (!client) {
    if (!local.extensionSettings.some((item) => item.productKey === 'realtalent_capture')) {
      local.extensionSettings.push(defaultExtensionProductSettings(workspaceId))
      writeLocal(workspaceId, local)
    }
    return local
  }
  const [accountsResult, jobsResult, attemptsResult, devicesResult, extensionsResult, settingsResult, extensionJobsResult, extensionEventsResult] = await Promise.all([
    client.from('integration_connected_accounts').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }),
    client.from('integration_sync_jobs').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(250),
    client.from('integration_sync_attempts').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(500),
    client.from('realtalent_connect_devices').select('*').eq('organization_id', workspaceId).order('last_seen_at', { ascending: false }),
    client.from('extension_installations').select('*').eq('organization_id', workspaceId).order('last_seen_at', { ascending: false }),
    client.from('extension_product_settings').select('*').eq('organization_id', workspaceId).order('updated_at', { ascending: false }),
    client.from('extension_capture_jobs').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(300),
    client.from('extension_events').select('*').eq('organization_id', workspaceId).order('created_at', { ascending: false }).limit(500),
  ])
  if (accountsResult.error || jobsResult.error || attemptsResult.error || devicesResult.error || extensionsResult.error || settingsResult.error || extensionJobsResult.error || extensionEventsResult.error) return local
  const settings = (settingsResult.data ?? []).map(mapExtensionSettings)
  if (!settings.some((item) => item.productKey === 'realtalent_capture')) settings.push(defaultExtensionProductSettings(workspaceId))
  const state: IntegrationFrameworkState = {
    accounts: (accountsResult.data ?? []).map(mapAccount),
    jobs: (jobsResult.data ?? []).map(mapJob),
    attempts: (attemptsResult.data ?? []).map(mapAttempt),
    devices: (devicesResult.data ?? []).map(mapDevice),
    extensions: (extensionsResult.data ?? []).map(mapExtension),
    extensionSettings: settings,
    extensionJobs: (extensionJobsResult.data ?? []).map(mapExtensionJob),
    extensionEvents: (extensionEventsResult.data ?? []).map(mapExtensionEvent),
  }
  writeLocal(workspaceId, state)
  return state
}

export async function beginOAuthConnection(workspaceId: string, provider: OAuthProvider) {
  const client = getSupabaseClient()
  if (!client || !env.supabaseUrl) {
    const state = readLocal(workspaceId)
    const date = now()
    const existing = state.accounts.find((item) => item.provider === provider)
    const account: ConnectedAccount = existing ? { ...existing, status: 'connected', lastError: null, updatedAt: date } : {
      id: createUuid(), workspaceId, provider, externalAccountId: `demo-${provider}`,
      displayName: `${providerLabel(provider)} — demonstração local`, status: 'connected', scopes: defaultScopes(provider),
      hasCredential: false, tokenExpiresAt: null, lastSyncAt: null, nextSyncAt: null, syncCursor: null,
      lastError: null, createdAt: date, updatedAt: date,
    }
    writeLocal(workspaceId, { ...state, accounts: [account, ...state.accounts.filter((item) => item.id !== account.id)] })
    return { mode: 'local' as const, url: null, message: 'Conexão demonstrativa criada somente neste navegador. Nenhum token externo foi armazenado.' }
  }
  const { data: sessionData } = await client.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sua sessão expirou. Entre novamente antes de conectar uma conta.')
  const response = await fetch(`${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/integration-oauth-start`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ organizationId: workspaceId, provider }),
  })
  const payload = await response.json().catch(() => ({})) as { authorizationUrl?: string; error?: string }
  if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || 'Não foi possível iniciar o OAuth.')
  return { mode: 'oauth' as const, url: payload.authorizationUrl, message: 'Autorização iniciada.' }
}

export async function enqueueIntegrationSync(workspaceId: string, account: ConnectedAccount, jobType = 'full_sync', payload: Record<string, unknown> = {}) {
  const client = getSupabaseClient()
  const idempotencyKey = `${account.provider}:${account.id}:${jobType}:${new Date().toISOString().slice(0, 13)}`
  if (client) {
    const { data, error } = await client.rpc('enqueue_integration_sync_job', {
      p_organization_id: workspaceId, p_account_id: account.id, p_job_type: jobType,
      p_idempotency_key: idempotencyKey, p_payload: { requested_by: 'crm', requested_at: now(), ...payload },
    })
    if (error) throw new Error(`Não foi possível colocar a sincronização na fila: ${error.message}`)
    return String(data)
  }
  const state = readLocal(workspaceId)
  const date = now()
  const job: IntegrationSyncJob = {
    id: createUuid(), workspaceId, accountId: account.id, provider: account.provider, jobType,
    status: 'queued', priority: 100, attempts: 0, maxAttempts: 5, availableAt: date, lockedAt: null,
    completedAt: null, idempotencyKey, payload: { mode: 'local', ...payload }, lastError: null, createdAt: date, updatedAt: date,
  }
  writeLocal(workspaceId, { ...state, jobs: [job, ...state.jobs] })
  return job.id
}

export async function updateConnectedAccount(workspaceId: string, accountId: string, action: 'pause' | 'resume' | 'disconnect') {
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.rpc('update_integration_account_status', { p_account_id: accountId, p_action: action })
    if (error) throw new Error(`Não foi possível atualizar a conta: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  const status: ConnectedAccountStatus = action === 'pause' ? 'paused' : action === 'resume' ? 'connected' : 'revoked'
  writeLocal(workspaceId, { ...state, accounts: state.accounts.map((item) => item.id === accountId ? { ...item, status, updatedAt: now() } : item) })
}

export async function updateConnectDevice(workspaceId: string, deviceId: string, action: 'pause' | 'resume' | 'revoke') {
  const client = getSupabaseClient()
  const status: ConnectDevice['status'] = action === 'pause' ? 'paused' : action === 'resume' ? 'connected' : 'revoked'
  if (client) {
    const { error } = await client.from('realtalent_connect_devices').update({ status, updated_at: now() }).eq('organization_id', workspaceId).eq('id', deviceId)
    if (error) throw new Error(`Não foi possível atualizar o dispositivo: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  writeLocal(workspaceId, { ...state, devices: state.devices.map((item) => item.id === deviceId ? { ...item, status } : item) })
}

export async function retryIntegrationJob(workspaceId: string, jobId: string) {
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.rpc('retry_integration_sync_job', { p_job_id: jobId })
    if (error) throw new Error(`Não foi possível reagendar: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  writeLocal(workspaceId, { ...state, jobs: state.jobs.map((item) => item.id === jobId ? { ...item, status: 'retry', availableAt: now(), lastError: null, updatedAt: now() } : item) })
}

export async function updateExtensionInstallation(workspaceId: string, installationId: string, action: 'pause' | 'resume' | 'revoke') {
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.rpc('update_extension_installation_status', { p_installation_id: installationId, p_action: action })
    if (error) throw new Error(`Não foi possível atualizar a extensão: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  const status: ExtensionInstallationStatus = action === 'pause' ? 'paused' : action === 'resume' ? 'connected' : 'revoked'
  writeLocal(workspaceId, { ...state, extensions: state.extensions.map((item) => item.id === installationId ? { ...item, status, lastError: action === 'revoke' ? 'Instalação revogada pelo administrador' : null, updatedAt: now() } : item) })
}

export async function retryExtensionCaptureJob(workspaceId: string, jobId: string) {
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.rpc('retry_extension_capture_job', { p_job_id: jobId })
    if (error) throw new Error(`Não foi possível reagendar a captura: ${error.message}`)
    return
  }
  const state = readLocal(workspaceId)
  writeLocal(workspaceId, { ...state, extensionJobs: state.extensionJobs.map((item) => item.id === jobId ? { ...item, status: 'retry', availableAt: now(), lastError: null, completedAt: null, updatedAt: now() } : item) })
}

export async function saveExtensionProductSettings(workspaceId: string, settings: ExtensionProductSettings) {
  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client.rpc('save_extension_product_settings', {
      p_organization_id: workspaceId,
      p_product_key: settings.productKey,
      p_enabled: settings.enabled,
      p_destination: settings.destination,
      p_require_confirmation: settings.requireConfirmation,
      p_duplicate_policy: settings.duplicatePolicy,
      p_minimum_version: settings.minimumVersion,
      p_recommended_version: settings.recommendedVersion,
      p_max_batch_size: settings.maxBatchSize,
      p_process_interval_ms: settings.processIntervalMs,
      p_close_tab_after_analysis: settings.closeTabAfterAnalysis,
      p_allowed_sources: settings.allowedSources,
      p_settings: settings.settings as Json,
    })
    if (error) throw new Error(`Não foi possível salvar a configuração da extensão: ${error.message}`)
    return mapExtensionSettings(data as unknown as ExtensionSettingsRow)
  }
  const state = readLocal(workspaceId)
  const next = { ...settings, configVersion: settings.configVersion + 1, updatedAt: now() }
  writeLocal(workspaceId, { ...state, extensionSettings: [next, ...state.extensionSettings.filter((item) => item.productKey !== settings.productKey)] })
  return next
}

export const providerLabel = (provider: OAuthProvider) => ({ google: 'Google', microsoft: 'Microsoft', meta: 'Meta', whatsapp_cloud: 'WhatsApp Cloud' }[provider])
export const extensionProductLabel = (product: ExtensionProductKey) => ({
  realtalent_capture: 'RealTalent Capture', realtalent_social: 'RealTalent Social',
  realtalent_linkedin_assistant: 'Assistente LinkedIn', realtalent_maps_capture: 'Captura Google Maps',
}[product])
export const defaultScopes = (provider: OAuthProvider) => ({
  google: ['openid', 'email', 'profile', 'calendar.events', 'calendar.readonly', 'gmail.send', 'gmail.readonly'],
  microsoft: ['openid', 'profile', 'email', 'offline_access', 'Calendars.ReadWrite', 'Mail.ReadWrite', 'Mail.Send'],
  meta: ['public_profile', 'pages_show_list', 'leads_retrieval'],
  whatsapp_cloud: ['whatsapp_business_management', 'whatsapp_business_messaging'],
}[provider])
