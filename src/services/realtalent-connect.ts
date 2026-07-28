import { createUuid } from '../lib/id'
import { getSupabaseClient } from '../lib/supabase'
import { safeStorage } from '../lib/storage'
import type { Json } from '../lib/supabase.types'

export type ConnectCallStatus = 'queued' | 'claimed' | 'dialing' | 'connected' | 'completed' | 'failed' | 'cancelled' | 'expired'

export interface RealTalentConnectDevice {
  id: string
  workspaceId: string
  userId: string
  deviceName: string
  platform: string
  appVersion: string
  status: 'connected' | 'paused' | 'revoked' | 'error'
  lastSeenAt: string
  pendingItems: number
  lastError: string | null
  live: boolean
}

export interface ConnectCallCommand {
  id: string
  deviceId: string
  status: ConnectCallStatus
  requestedAt: string
  expiresAt: string
  startedAt?: string | null
  endedAt?: string | null
  failureReason?: string | null
}

const LOCAL_PREFIX = 'realtalent-connect-v100465:'
const DEFAULT_DEVICE_KEY = 'realtalent-crm-v100465-default-device:'
const now = () => new Date().toISOString()
const isLive = (lastSeenAt: string, status: RealTalentConnectDevice['status']) => status === 'connected' && Date.now() - new Date(lastSeenAt).getTime() <= 180_000

export function connectStatusLabel(status: ConnectCallStatus) {
  return ({ queued: 'Enviada ao dispositivo', claimed: 'Recebida pelo Connect', dialing: 'Discando', connected: 'Chamada conectada', completed: 'Chamada encerrada', failed: 'Falha no dispositivo', cancelled: 'Cancelada', expired: 'Expirada' } as Record<ConnectCallStatus, string>)[status]
}

export async function listRealTalentConnectDevices(workspaceId: string): Promise<RealTalentConnectDevice[]> {
  const client = getSupabaseClient()
  if (!client) {
    const stored = safeStorage.getItem(`${LOCAL_PREFIX}${workspaceId}`)
    if (!stored) return []
    try {
      const items = JSON.parse(stored) as RealTalentConnectDevice[]
      return Array.isArray(items) ? items.map((item) => ({ ...item, live: isLive(item.lastSeenAt, item.status) })) : []
    } catch { return [] }
  }
  const { data, error } = await client.from('realtalent_connect_devices').select('*').eq('organization_id', workspaceId).order('last_seen_at', { ascending: false })
  if (error) throw new Error(`Não foi possível consultar o RealTalent Connect: ${error.message}`)
  return (data ?? []).map((item) => ({
    id: item.id,
    workspaceId: item.organization_id,
    userId: item.user_id,
    deviceName: item.device_name,
    platform: item.platform,
    appVersion: item.app_version,
    status: item.status,
    lastSeenAt: item.last_seen_at,
    pendingItems: item.pending_items,
    lastError: item.last_error,
    live: isLive(item.last_seen_at, item.status),
  }))
}

export function readDefaultConnectDevice(workspaceId: string) {
  return safeStorage.getItem(`${DEFAULT_DEVICE_KEY}${workspaceId}`) ?? ''
}

export function saveDefaultConnectDevice(workspaceId: string, deviceId: string) {
  if (deviceId) safeStorage.setItem(`${DEFAULT_DEVICE_KEY}${workspaceId}`, deviceId)
  else safeStorage.removeItem(`${DEFAULT_DEVICE_KEY}${workspaceId}`)
}

export function buildRealTalentConnectProtocolUrl(input: { commandId: string; workspaceId: string; deviceId: string; leadId: string | null; phone: string; leadName: string }) {
  const query = new URLSearchParams({
    command: input.commandId,
    workspace: input.workspaceId,
    device: input.deviceId,
    lead: input.leadId ?? '',
    phone: input.phone.replace(/[^0-9+]/g, ''),
    name: input.leadName,
  })
  return `realtalent-connect://call?${query.toString()}`
}

export async function enqueueRealTalentConnectCall(input: {
  workspaceId: string
  deviceId: string
  leadId: string | null
  phone: string
  leadName: string
  metadata?: Record<string, unknown>
}): Promise<ConnectCallCommand> {
  const client = getSupabaseClient()
  if (!client) {
    const date = now()
    return { id: createUuid(), deviceId: input.deviceId, status: 'queued', requestedAt: date, expiresAt: new Date(Date.now() + 600_000).toISOString() }
  }
  const { data, error } = await client.rpc('enqueue_realtalent_connect_call', {
    p_organization_id: input.workspaceId,
    p_device_id: input.deviceId,
    p_lead_id: input.leadId,
    p_phone: input.phone,
    p_lead_name: input.leadName,
    p_metadata: (input.metadata ?? {}) as Json,
  })
  if (error) throw new Error(error.message)
  const payload = data as Record<string, unknown>
  return {
    id: String(payload.id),
    deviceId: String(payload.device_id ?? input.deviceId),
    status: String(payload.status ?? 'queued') as ConnectCallStatus,
    requestedAt: String(payload.requested_at ?? now()),
    expiresAt: String(payload.expires_at ?? new Date(Date.now() + 600_000).toISOString()),
  }
}

export async function getRealTalentConnectCallCommand(workspaceId: string, commandId: string): Promise<ConnectCallCommand | null> {
  const client = getSupabaseClient()
  if (!client) return null
  const { data, error } = await client.from('realtalent_connect_call_commands').select('*').eq('organization_id', workspaceId).eq('id', commandId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    deviceId: data.device_id,
    status: data.status,
    requestedAt: data.requested_at,
    expiresAt: data.expires_at,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    failureReason: data.failure_reason,
  }
}

export async function cancelRealTalentConnectCall(workspaceId: string, deviceId: string, commandId: string) {
  const client = getSupabaseClient()
  if (!client) return
  const { error } = await client.rpc('update_realtalent_connect_call_command', {
    p_organization_id: workspaceId,
    p_device_id: deviceId,
    p_command_id: commandId,
    p_status: 'cancelled',
    p_failure_reason: null,
    p_metadata: { cancelled_by: 'crm' },
  })
  if (error) throw new Error(error.message)
}
