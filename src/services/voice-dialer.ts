import { assertExtensionCommand, extensionLifecycle, requireProviderManifest } from '../platform/extensions'
import { env } from '../lib/env'
export const REALTALENT_VOICE_CAPABILITIES_SCHEMA = 'realtalent.voice.capabilities.v1' as const
export const REALTALENT_VOICE_CALL_SCHEMA = 'realtalent.voice.call.v1' as const
export const REALTALENT_VOICE_EVENT_SCHEMA = 'realtalent.voice.event.v1' as const
export const REALTALENT_VOICE_SETTINGS_SCHEMA = 'realtalent.voice.settings.v1' as const

export type VoiceProviderId = 'realtalent_connect' | 'external_tel' | 'browser_webrtc' | 'sip'
export type VoiceProviderState = 'available' | 'reachable_incompatible' | 'not_configured' | 'unavailable'
export type VoiceCallState = 'ready' | 'connecting' | 'ringing' | 'connected' | 'held' | 'ended' | 'failed'
export type VoiceDirection = 'outbound' | 'inbound'
export type VoiceCommand = 'answer' | 'hangup' | 'mute' | 'unmute' | 'hold' | 'resume' | 'dtmf' | 'transfer' | 'voicemail_drop'

export interface VoiceCapabilities {
  outbound: boolean
  inbound: boolean
  callerId: boolean
  mute: boolean
  hold: boolean
  keypad: boolean
  transfer: boolean
  voicemailDrop: boolean
  recording: boolean
}

export interface VoiceProviderStatus {
  id: VoiceProviderId
  label: string
  state: VoiceProviderState
  detail: string
  capabilities: VoiceCapabilities
  checkedAt: string
  defaultDeviceAvailable?: boolean
}

export interface VoiceDevice {
  id: string
  providerId: VoiceProviderId
  label: string
  detail: string
  available: boolean
}

export interface RealTalentPhoneLanInterface {
  name: string
  address: string
  kind: 'wifi' | 'ethernet' | 'other'
  label: string
  preferred: boolean
}

export interface RealTalentPhoneNetworkAccess {
  mode: 'local-only' | 'lan-enabled'
  enabled: boolean
  host: string | null
}

export interface RealTalentPhonePairingInfo {
  code: string
  phoneUrl: string
  qrUrl: string
  expiresAt: string
  workspaceId: string | null
  lanAddresses: string[]
  lanInterfaces?: RealTalentPhoneLanInterface[]
  selectedLanHost?: string
  lanReady: boolean
  networkAccess?: RealTalentPhoneNetworkAccess
}

export interface RealTalentConnectDiagnostics {
  service: string
  releaseVersion?: string
  bridge: { ok: boolean; port: number; host: string }
  pairingApi: boolean
  realtime: boolean
  networkAccess?: RealTalentPhoneNetworkAccess
  lan: { ready: boolean; selectedHost: string; interfaces: RealTalentPhoneLanInterface[] }
  phone: { pairedCount: number; onlineCount: number; oneTapReadyCount?: number }
  dialer: { ready: boolean; mode: string }
  firewall: { status: 'unknown' | 'ok' | 'blocked'; port: number; hint: string }
}

export interface RealTalentConnectHealth {
  ok: boolean
  service: string
  version: string
  releaseVersion?: string
  configured: boolean
  mode: string
  realtime?: boolean
  pairedPhones: number
  activeCalls: number
  networkAccess?: RealTalentPhoneNetworkAccess
  setupState?: 'bridge_ready' | 'ready'
  now: string
}

export interface RealTalentPhoneDevice {
  id: string
  workspaceId?: string | null
  label: string
  platform: string
  pairedAt?: string
  lastSeenAt: string
  available: boolean
  realtime?: boolean
  oneTapEnabled?: boolean
  oneTapReady?: boolean
  visibility?: 'visible' | 'hidden'
  standalone?: boolean
  platformKind?: 'ios' | 'android' | 'other'
  lastInteractionAt?: string
}

export interface VoiceOutboundIdentity {
  id: string
  providerId: VoiceProviderId
  label: string
  number: string
  active: boolean
}

export interface VoiceSettings {
  schema: typeof REALTALENT_VOICE_SETTINGS_SCHEMA
  defaultProviderId: VoiceProviderId
  connectBaseUrl: string
  selectedDeviceId: string
  selectedCallerId: string
  outboundIdentities: VoiceOutboundIdentity[]
}

export interface VoiceCallRuntime {
  providerId: VoiceProviderId
  externalCallId: string | null
  state: VoiceCallState
  direction: VoiceDirection
  phone: string
  callerId: string | null
  startedAt: string
}

export type VoiceTransportState = 'healthy' | 'degraded' | 'recovered'

export interface VoiceEvent {
  schema: typeof REALTALENT_VOICE_EVENT_SCHEMA
  providerId: VoiceProviderId
  callId: string
  state: VoiceCallState
  direction: VoiceDirection
  phone: string
  callerId: string | null
  leadId: string | null
  occurredAt: string
  transport?: VoiceTransportState
  detail?: string | null
}

const emptyCapabilities = (): VoiceCapabilities => ({ outbound: false, inbound: false, callerId: false, mute: false, hold: false, keypad: false, transfer: false, voicemailDrop: false, recording: false })
const externalCapabilities = (): VoiceCapabilities => ({ outbound: true, inbound: false, callerId: false, mute: false, hold: false, keypad: false, transfer: false, voicemailDrop: false, recording: false })
const storageKey = (workspaceId: string) => `realtalent:${workspaceId}:voice-settings:v1`
const cleanBaseUrl = (value: string) => value.trim().replace(/\/+$/, '')
const CONNECT_PROXY_BASE = '/__rt/connect'
const configuredConnectTransport = () => env.hosted ? env.connectGatewayUrl : CONNECT_PROXY_BASE
const connectTransportBase = (value: string) => {
  const cleaned = cleanBaseUrl(value)
  if (!cleaned) return ''
  if (cleaned.startsWith('/')) return cleaned
  try {
    const url = new URL(cleaned)
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '3001') return configuredConnectTransport()
  } catch { /* endpoint customizado pode ser relativo */ }
  return cleaned
}
const websocketBase = (baseUrl: string) => {
  if (baseUrl.startsWith('/')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}${baseUrl}`
  }
  return baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
}
const pairingForTransport = (payload: RealTalentPhonePairingInfo, transportBase: string): RealTalentPhonePairingInfo => {
  if (transportBase !== CONNECT_PROXY_BASE || !payload.qrUrl) return payload
  try {
    const qr = new URL(payload.qrUrl)
    return { ...payload, qrUrl: `${CONNECT_PROXY_BASE}${qr.pathname}${qr.search}` }
  } catch { return payload }
}
const normalizeNumber = (value: string) => value.trim().replace(/[^\d+]/g, '')

export function defaultVoiceSettings(): VoiceSettings {
  return {
    schema: REALTALENT_VOICE_SETTINGS_SCHEMA,
    defaultProviderId: 'external_tel',
    connectBaseUrl: env.connectGatewayUrl || 'http://localhost:3001',
    selectedDeviceId: 'external:system-dialer',
    selectedCallerId: '',
    outboundIdentities: [],
  }
}

export function normalizeVoiceSettings(value: unknown): VoiceSettings {
  const fallback = defaultVoiceSettings()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const raw = value as Partial<VoiceSettings>
  const providerIds = new Set<VoiceProviderId>(['realtalent_connect', 'external_tel', 'browser_webrtc', 'sip'])
  const outboundIdentities = Array.isArray(raw.outboundIdentities)
    ? raw.outboundIdentities.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const identity = item as VoiceOutboundIdentity
        if (!identity.id || !identity.label || !identity.number || !providerIds.has(identity.providerId)) return []
        return [{ id: String(identity.id).slice(0, 120), providerId: identity.providerId, label: String(identity.label).slice(0, 120), number: String(identity.number).slice(0, 80), active: identity.active !== false }]
      }).slice(0, 30)
    : []
  return {
    schema: REALTALENT_VOICE_SETTINGS_SCHEMA,
    defaultProviderId: providerIds.has(raw.defaultProviderId as VoiceProviderId) ? raw.defaultProviderId as VoiceProviderId : fallback.defaultProviderId,
    connectBaseUrl: typeof raw.connectBaseUrl === 'string' && raw.connectBaseUrl.trim() ? cleanBaseUrl(raw.connectBaseUrl) : fallback.connectBaseUrl,
    selectedDeviceId: typeof raw.selectedDeviceId === 'string' ? raw.selectedDeviceId.slice(0, 160) : fallback.selectedDeviceId,
    selectedCallerId: typeof raw.selectedCallerId === 'string' ? raw.selectedCallerId.slice(0, 160) : '',
    outboundIdentities,
  }
}

export function readVoiceSettings(workspaceId: string): VoiceSettings {
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId))
    return raw ? normalizeVoiceSettings(JSON.parse(raw)) : defaultVoiceSettings()
  } catch {
    return defaultVoiceSettings()
  }
}

export function saveVoiceSettings(workspaceId: string, settings: VoiceSettings) {
  const normalized = normalizeVoiceSettings(settings)
  try { window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(normalized)) } catch { /* storage indisponível */ }
  return normalized
}

export function providerLabel(providerId: VoiceProviderId) {
  return providerId === 'realtalent_connect' ? requireProviderManifest('realtalent_connect').label : providerId === 'external_tel' ? 'Discador do dispositivo' : providerId === 'browser_webrtc' ? 'Browser Voice' : 'SIP'
}

const timeoutSignal = (ms: number) => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, cancel: () => window.clearTimeout(timer) }
}

export async function probeVoiceProviders(settings: VoiceSettings): Promise<VoiceProviderStatus[]> {
  const now = new Date().toISOString()
  const result: VoiceProviderStatus[] = [
    { id: 'external_tel', label: providerLabel('external_tel'), state: 'available', detail: 'Fallback seguro: abre o discador do sistema. O CRM não controla áudio nem eventos da operadora.', capabilities: externalCapabilities(), checkedAt: now },
    { id: 'browser_webrtc', label: providerLabel('browser_webrtc'), state: 'not_configured', detail: 'WebRTC preparado, mas nenhum provedor de telefonia foi configurado.', capabilities: emptyCapabilities(), checkedAt: now },
    { id: 'sip', label: providerLabel('sip'), state: 'not_configured', detail: 'Camada SIP preparada para integração futura. Nenhum trunk/servidor está configurado.', capabilities: emptyCapabilities(), checkedAt: now },
  ]

  const baseUrl = connectTransportBase(settings.connectBaseUrl)
  if (!baseUrl) return [{ id: 'realtalent_connect', label: providerLabel('realtalent_connect'), state: 'not_configured', detail: 'Informe o endpoint local do RealTalent Connect.', capabilities: emptyCapabilities(), checkedAt: now }, ...result]
  const timeout = timeoutSignal(1400)
  try {
    const response = await fetch(`${baseUrl}/api/voice/v1/capabilities`, { signal: timeout.signal, headers: { accept: 'application/json' } })
    const payload = await response.json().catch(() => null) as null | { schema?: string; configured?: boolean; detail?: string; provider?: string; defaultDeviceAvailable?: boolean; capabilities?: Partial<VoiceCapabilities> }
    if (response.ok && payload?.schema === REALTALENT_VOICE_CAPABILITIES_SCHEMA) {
      const caps = payload.capabilities ?? {}
      const configured = payload.configured !== false && Boolean(caps.outbound)
      result.unshift({
        id: 'realtalent_connect', label: providerLabel('realtalent_connect'), state: configured ? 'available' : 'not_configured', detail: payload.detail || (configured ? 'RealTalent Connect pronto para chamadas.' : 'Bridge ativo — falta parear um celular ou configurar PSTN.'),
        capabilities: { outbound: Boolean(caps.outbound), inbound: Boolean(caps.inbound), callerId: Boolean(caps.callerId), mute: Boolean(caps.mute), hold: Boolean(caps.hold), keypad: Boolean(caps.keypad), transfer: Boolean(caps.transfer), voicemailDrop: Boolean(caps.voicemailDrop), recording: Boolean(caps.recording) }, checkedAt: now, defaultDeviceAvailable: payload.defaultDeviceAvailable !== false,
      })
    } else {
      result.unshift({ id: 'realtalent_connect', label: providerLabel('realtalent_connect'), state: 'reachable_incompatible', detail: 'O serviço respondeu, mas ainda não expõe o contrato RealTalent Voice API v1. O CRM não simulará controles inexistentes.', capabilities: emptyCapabilities(), checkedAt: now })
    }
  } catch {
    result.unshift({ id: 'realtalent_connect', label: providerLabel('realtalent_connect'), state: 'unavailable', detail: `Nenhum RealTalent Voice API v1 respondeu em ${baseUrl}. O fallback externo continua disponível.`, capabilities: emptyCapabilities(), checkedAt: now })
  } finally { timeout.cancel() }
  return result
}

export async function discoverVoiceDevices(statuses: VoiceProviderStatus[], settings?: VoiceSettings, workspaceId = ''): Promise<VoiceDevice[]> {
  const devices: VoiceDevice[] = [{ id: 'external:system-dialer', providerId: 'external_tel', label: 'Discador do sistema', detail: 'Celular, aplicativo padrão ou integração do sistema operacional', available: true }]
  const connect = statuses.find((item) => item.id === 'realtalent_connect')
  devices.push({ id: 'connect:default', providerId: 'realtalent_connect', label: 'RealTalent Connect Voice', detail: connect?.defaultDeviceAvailable ? 'Provider PSTN conectado' : 'Provider PSTN não configurado; use um RealTalent Phone pareado', available: connect?.state === 'available' && connect.defaultDeviceAvailable !== false })
  if (settings?.connectBaseUrl) {
    const timeout = timeoutSignal(1600)
    try {
      const suffix = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
      const response = await fetch(`${connectTransportBase(settings.connectBaseUrl)}/api/phone/v1/devices${suffix}`, { signal: timeout.signal, headers: { accept: 'application/json' } })
      const payload = await response.json().catch(() => null) as null | { devices?: RealTalentPhoneDevice[] }
      if (response.ok && Array.isArray(payload?.devices)) payload.devices.slice(0, 8).forEach((device) => devices.push({ id: `connect:phone:${device.id}`, providerId: 'realtalent_connect', label: device.label || 'RealTalent Phone', detail: `${device.platformKind === 'ios' ? 'iPhone' : device.platformKind === 'android' ? 'Android' : (device.platform || 'Celular')} · ${device.oneTapReady ? 'One-Tap pronto' : device.available ? 'conectado agora' : 'offline'}`, available: Boolean(device.available) }))
    } catch { /* companion opcional */ }
    finally { timeout.cancel() }
  }
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
    try {
      const local = await navigator.mediaDevices.enumerateDevices()
      local.filter((item) => item.kind === 'audioinput').slice(0, 8).forEach((item, index) => devices.push({ id: `browser:${item.deviceId || index}`, providerId: 'browser_webrtc', label: item.label || `Microfone ${index + 1}`, detail: 'Dispositivo de áudio detectado; exige provedor WebRTC para telefonia.', available: false }))
    } catch { /* permissão não concedida */ }
  }
  return devices
}

export async function fetchRealTalentPhonePairing(settings: VoiceSettings, workspaceId = '', host = ''): Promise<RealTalentPhonePairingInfo | null> {
  const baseUrl = connectTransportBase(settings.connectBaseUrl)
  if (!baseUrl) return null
  const timeout = timeoutSignal(1800)
  try {
    const params = new URLSearchParams(); if (workspaceId) params.set('workspaceId', workspaceId); if (host) params.set('host', host)
    const suffix = params.size ? `?${params.toString()}` : ''
    const response = await fetch(`${baseUrl}/api/phone/v1/pairing${suffix}`, { signal: timeout.signal, headers: { accept: 'application/json' } })
    const payload = await response.json().catch(() => null) as RealTalentPhonePairingInfo | null
    return response.ok && payload?.code && payload.phoneUrl ? pairingForTransport(payload, baseUrl) : null
  } catch { return null }
  finally { timeout.cancel() }
}

export async function fetchRealTalentConnectHealth(settings: VoiceSettings): Promise<RealTalentConnectHealth | null> {
  const baseUrl = connectTransportBase(settings.connectBaseUrl)
  if (!baseUrl) return null
  const timeout = timeoutSignal(1800)
  try {
    const response = await fetch(`${baseUrl}/api/voice/v1/health`, { signal: timeout.signal, headers: { accept: 'application/json' } })
    const payload = await response.json().catch(() => null) as RealTalentConnectHealth | null
    return response.ok && payload?.service === 'RealTalent Connect' ? payload : null
  } catch { return null }
  finally { timeout.cancel() }
}

export async function fetchRealTalentConnectDiagnostics(settings: VoiceSettings, workspaceId = ''): Promise<RealTalentConnectDiagnostics | null> {
  const baseUrl = connectTransportBase(settings.connectBaseUrl)
  if (!baseUrl) return null
  const timeout = timeoutSignal(1800)
  try {
    const suffix = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
    const response = await fetch(`${baseUrl}/api/phone/v1/diagnostics${suffix}`, { signal: timeout.signal, headers: { accept: 'application/json' } })
    const payload = await response.json().catch(() => null) as RealTalentConnectDiagnostics | null
    return response.ok && payload?.service === 'RealTalent Connect' ? payload : null
  } catch { return null }
  finally { timeout.cancel() }
}

export async function fetchRealTalentPhoneDevices(settings: VoiceSettings, workspaceId = ''): Promise<RealTalentPhoneDevice[]> {
  const baseUrl = connectTransportBase(settings.connectBaseUrl)
  if (!baseUrl) return []
  const timeout = timeoutSignal(1800)
  try {
    const suffix = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
    const response = await fetch(`${baseUrl}/api/phone/v1/devices${suffix}`, { signal: timeout.signal, headers: { accept: 'application/json' } })
    const payload = await response.json().catch(() => null) as null | { devices?: RealTalentPhoneDevice[] }
    return response.ok && Array.isArray(payload?.devices) ? payload.devices : []
  } catch { return [] }
  finally { timeout.cancel() }
}

export async function regenerateRealTalentPhonePairing(settings: VoiceSettings, workspaceId: string, host = ''): Promise<RealTalentPhonePairingInfo | null> {
  const baseUrl = connectTransportBase(settings.connectBaseUrl)
  if (!baseUrl) return null
  const timeout = timeoutSignal(2200)
  try {
    const response = await fetch(`${baseUrl}/api/phone/v1/pairing/regenerate`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, signal: timeout.signal, body: JSON.stringify({ workspaceId, host }) })
    const payload = await response.json().catch(() => null) as RealTalentPhonePairingInfo | null
    return response.ok && payload?.code && payload.phoneUrl ? pairingForTransport(payload, baseUrl) : null
  } catch { return null }
  finally { timeout.cancel() }
}

export async function setRealTalentPhoneNetworkAccess(settings: VoiceSettings, workspaceId: string, enabled: boolean, host = ''): Promise<RealTalentPhoneNetworkAccess | null> {
  const baseUrl = connectTransportBase(settings.connectBaseUrl)
  if (!baseUrl) return null
  const timeout = timeoutSignal(3000)
  try {
    const response = await fetch(`${baseUrl}/api/phone/v1/network-access`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, signal: timeout.signal,
      body: JSON.stringify({ workspaceId, enabled, host }),
    })
    const payload = await response.json().catch(() => null) as (RealTalentPhoneNetworkAccess & { error?: string }) | null
    if (!response.ok || !payload) return null
    return { mode: payload.mode, enabled: Boolean(payload.enabled), host: payload.host || null }
  } catch { return null }
  finally { timeout.cancel() }
}

export async function revokeRealTalentPhoneDevice(settings: VoiceSettings, deviceId: string): Promise<boolean> {
  const baseUrl = connectTransportBase(settings.connectBaseUrl)
  if (!baseUrl || !deviceId) return false
  const timeout = timeoutSignal(2200)
  try {
    const response = await fetch(`${baseUrl}/api/phone/v1/devices/${encodeURIComponent(deviceId)}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, signal: timeout.signal, body: '{}' })
    return response.ok
  } catch { return false }
  finally { timeout.cancel() }
}

const callPollers = new Map<string, number>()
const callSockets = new Map<string, WebSocket>()

export function stopVoiceCallMonitoring(callId: string) {
  const timer = callPollers.get(callId)
  if (timer) window.clearInterval(timer)
  callPollers.delete(callId)
  const socket = callSockets.get(callId)
  if (socket) { try { socket.close() } catch { /* noop */ } }
  callSockets.delete(callId)
}

function dispatchVoiceEvent(detail: VoiceEvent) {
  window.dispatchEvent(new CustomEvent('realtalent:voice-event', { detail }))
}

function beginConnectCallPolling(baseUrl: string, callId: string) {
  const previous = callPollers.get(callId)
  if (previous) window.clearInterval(previous)
  let lastState: VoiceCallState | null = null
  let consecutiveFailures = 0
  let transportDegraded = false
  const poll = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/voice/v1/calls/${encodeURIComponent(callId)}`, { headers: { accept: 'application/json' } })
      const data = await response.json().catch(() => null) as null | { state?: VoiceCallState; phone?: string; leadId?: string | null; error?: string }
      if (!response.ok || !data?.state) throw new Error(data?.error || `RealTalent Connect respondeu HTTP ${response.status}.`)
      consecutiveFailures = 0
      if (transportDegraded) {
        transportDegraded = false
        dispatchVoiceEvent({ schema: REALTALENT_VOICE_EVENT_SCHEMA, providerId: 'realtalent_connect', callId, state: data.state, direction: 'outbound', phone: data.phone ?? '', callerId: null, leadId: data.leadId ?? null, occurredAt: new Date().toISOString(), transport: 'recovered', detail: 'Conexão com o RealTalent Connect restabelecida.' })
      }
      if (data.state !== lastState) {
        lastState = data.state
        dispatchVoiceEvent({ schema: REALTALENT_VOICE_EVENT_SCHEMA, providerId: 'realtalent_connect', callId, state: data.state, direction: 'outbound', phone: data.phone ?? '', callerId: null, leadId: data.leadId ?? null, occurredAt: new Date().toISOString(), transport: 'healthy' })
      }
      if (data.state === 'ended' || data.state === 'failed') stopVoiceCallMonitoring(callId)
    } catch (error) {
      consecutiveFailures += 1
      if (consecutiveFailures >= 2 && !transportDegraded) {
        transportDegraded = true
        dispatchVoiceEvent({ schema: REALTALENT_VOICE_EVENT_SCHEMA, providerId: 'realtalent_connect', callId, state: lastState ?? 'connecting', direction: 'outbound', phone: '', callerId: null, leadId: null, occurredAt: new Date().toISOString(), transport: 'degraded', detail: error instanceof Error ? error.message : 'RealTalent Connect temporariamente indisponível.' })
      }
      if (consecutiveFailures >= 40) stopVoiceCallMonitoring(callId)
    }
  }
  void poll()
  const timer = window.setInterval(() => void poll(), 1800)
  callPollers.set(callId, timer)
}

function beginConnectCallRealtime(baseUrl: string, callId: string) {
  if (typeof WebSocket === 'undefined') { beginConnectCallPolling(baseUrl, callId); return }
  const previous = callSockets.get(callId)
  if (previous) { try { previous.close() } catch { /* noop */ } }
  const wsBase = websocketBase(baseUrl)
  let terminal = false
  let fallbackStarted = false
  const fallback = () => { if (!terminal && !fallbackStarted) { fallbackStarted = true; beginConnectCallPolling(baseUrl, callId) } }
  try {
    const socket = new WebSocket(`${wsBase}/api/voice/v1/ws?callId=${encodeURIComponent(callId)}`)
    callSockets.set(callId, socket)
    const timeout = window.setTimeout(fallback, 2800)
    socket.onopen = () => { window.clearTimeout(timeout) }
    socket.onmessage = (event) => {
      const timer = callPollers.get(callId); if (timer) { window.clearInterval(timer); callPollers.delete(callId); fallbackStarted = false }
      try {
        const data = JSON.parse(String(event.data)) as { state?: VoiceCallState; phone?: string; leadId?: string | null; updatedAt?: string }
        if (!data.state) return
        dispatchVoiceEvent({ schema: REALTALENT_VOICE_EVENT_SCHEMA, providerId: 'realtalent_connect', callId, state: data.state, direction: 'outbound', phone: data.phone ?? '', callerId: null, leadId: data.leadId ?? null, occurredAt: data.updatedAt ?? new Date().toISOString(), transport: 'healthy' })
        if (data.state === 'ended' || data.state === 'failed') { terminal = true; stopVoiceCallMonitoring(callId) }
      } catch { /* mensagem desconhecida */ }
    }
    socket.onerror = () => { fallback() }
    socket.onclose = () => { if (callSockets.get(callId) !== socket) return; callSockets.delete(callId); fallback() }
  } catch { fallback() }
}

export async function startOutboundVoiceCall(input: { settings: VoiceSettings; providerId: VoiceProviderId; deviceId?: string | null; phone: string; callerId?: string | null; workspaceId: string; leadId: string; contactId?: string | null; displayName: string; companyName?: string | null; playbookId?: string | null; playbookName?: string | null; sessionId?: string | null; objective?: string | null; requestId?: string | null; fastDial?: boolean }): Promise<VoiceCallRuntime> {
  const phone = normalizeNumber(input.phone)
  if (!phone) throw new Error('Telefone inválido para iniciar a chamada.')
  const startedAt = new Date().toISOString()
  if (input.providerId === 'external_tel') {
    window.location.href = `tel:${phone}`
    return { providerId: 'external_tel', externalCallId: null, state: 'ringing', direction: 'outbound', phone, callerId: null, startedAt }
  }
  if (input.providerId !== 'realtalent_connect') throw new Error(`${providerLabel(input.providerId)} ainda não possui um provedor de telefonia configurado.`)
  assertExtensionCommand('realtalent_connect.call')
  await extensionLifecycle.emit('realtalent-connect', 'beforeSync', { operation: 'startOutboundVoiceCall', phone }, { workspaceId: input.workspaceId })
  const timeout = timeoutSignal(6000)
  try {
    const response = await fetch(`${connectTransportBase(input.settings.connectBaseUrl)}/api/voice/v1/calls`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, signal: timeout.signal,
      body: JSON.stringify({ schema: REALTALENT_VOICE_CALL_SCHEMA, direction: 'outbound', requestId: input.requestId ?? null, workspaceId: input.workspaceId, leadId: input.leadId, contactId: input.contactId ?? null, phone, callerId: input.callerId ?? null, deviceId: input.deviceId ?? null, displayName: input.displayName, companyName: input.companyName ?? null, playbookId: input.playbookId ?? null, playbookName: input.playbookName ?? null, sessionId: input.sessionId ?? null, objective: input.objective ?? null, fastDial: input.fastDial === true }),
    })
    const payload = await response.json().catch(() => null) as null | { callId?: string; state?: VoiceCallState; error?: string }
    if (!response.ok || !payload?.callId) throw new Error(payload?.error || 'O RealTalent Connect não confirmou a criação da chamada. Revise o RealTalent Phone ou o provider PSTN.')
    beginConnectCallRealtime(connectTransportBase(input.settings.connectBaseUrl), payload.callId)
    await extensionLifecycle.emit('realtalent-connect', 'afterSync', { operation: 'startOutboundVoiceCall', callId: payload.callId, state: payload.state ?? 'connecting' }, { workspaceId: input.workspaceId })
    return { providerId: 'realtalent_connect' as const, externalCallId: payload.callId, state: payload.state ?? 'connecting', direction: 'outbound' as const, phone, callerId: input.callerId ?? null, startedAt }
  } catch (error) {
    await extensionLifecycle.emit('realtalent-connect', 'onError', { operation: 'startOutboundVoiceCall', message: error instanceof Error ? error.message : String(error) }, { workspaceId: input.workspaceId })
    throw error
  } finally { timeout.cancel() }
}

export async function sendVoiceCommand(settings: VoiceSettings, call: VoiceCallRuntime, command: VoiceCommand, payload: Record<string, unknown> = {}) {
  if (call.providerId !== 'realtalent_connect' || !call.externalCallId) throw new Error('Este canal não oferece controle remoto da chamada.')
  const timeout = timeoutSignal(5000)
  try {
    const response = await fetch(`${connectTransportBase(settings.connectBaseUrl)}/api/voice/v1/calls/${encodeURIComponent(call.externalCallId)}/commands`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, signal: timeout.signal, body: JSON.stringify({ command, payload }),
    })
    const data = await response.json().catch(() => ({})) as { state?: VoiceCallState; error?: string }
    if (!response.ok) throw new Error(data.error || 'O provedor recusou o comando de voz.')
    return data
  } finally { timeout.cancel() }
}

export function normalizeVoiceEvent(value: unknown): VoiceEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const providers = new Set<VoiceProviderId>(['realtalent_connect', 'external_tel', 'browser_webrtc', 'sip'])
  const states = new Set<VoiceCallState>(['ready', 'connecting', 'ringing', 'connected', 'held', 'ended', 'failed'])
  if (raw.schema !== REALTALENT_VOICE_EVENT_SCHEMA || !providers.has(raw.providerId as VoiceProviderId) || !states.has(raw.state as VoiceCallState)) return null
  const callId = typeof raw.callId === 'string' ? raw.callId.trim() : ''
  const phone = typeof raw.phone === 'string' ? raw.phone.trim() : ''
  const occurredAt = typeof raw.occurredAt === 'string' && Number.isFinite(new Date(raw.occurredAt).getTime()) ? raw.occurredAt : ''
  if (!callId || !occurredAt) return null
  const transports = new Set<VoiceTransportState>(['healthy', 'degraded', 'recovered'])
  return { schema: REALTALENT_VOICE_EVENT_SCHEMA, providerId: raw.providerId as VoiceProviderId, callId, state: raw.state as VoiceCallState, direction: raw.direction === 'inbound' ? 'inbound' : 'outbound', phone, callerId: typeof raw.callerId === 'string' ? raw.callerId : null, leadId: typeof raw.leadId === 'string' ? raw.leadId : null, occurredAt, transport: transports.has(raw.transport as VoiceTransportState) ? raw.transport as VoiceTransportState : undefined, detail: typeof raw.detail === 'string' ? raw.detail.slice(0, 500) : null }
}

export function resumeVoiceCallMonitoring(settings: VoiceSettings, call: VoiceCallRuntime | null) {
  if (!call || call.providerId !== 'realtalent_connect' || !call.externalCallId || ['ended', 'failed'].includes(call.state)) return false
  beginConnectCallRealtime(cleanBaseUrl(settings.connectBaseUrl), call.externalCallId)
  return true
}


export function subscribeVoiceEvents(listener: (event: VoiceEvent) => void) {
  const onCustom = (event: Event) => { const normalized = normalizeVoiceEvent((event as CustomEvent).detail); if (normalized) listener(normalized) }
  const onMessage = (event: MessageEvent) => { const trusted = event.origin === window.location.origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(event.origin); if (!trusted) return; const normalized = normalizeVoiceEvent(event.data); if (normalized) listener(normalized) }
  window.addEventListener('realtalent:voice-event', onCustom)
  window.addEventListener('message', onMessage)
  return () => { window.removeEventListener('realtalent:voice-event', onCustom); window.removeEventListener('message', onMessage) }
}

export function voiceProviderStateLabel(state: VoiceProviderState) {
  return state === 'available' ? 'Disponível' : state === 'reachable_incompatible' ? 'API incompatível' : state === 'not_configured' ? 'Não configurado' : 'Indisponível'
}
