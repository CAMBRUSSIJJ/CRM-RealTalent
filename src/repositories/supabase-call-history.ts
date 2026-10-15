import type { CallRecord } from '../domain/types'
import { fetchAllRows } from './supabase-pagination'
import type { CallRow } from './supabase-repository-mappers'
import { mapCall } from './supabase-repository-mappers'

type SupabaseClientLike = any

const normalizeCallLimit = (limit: number, fallback: number) => Math.max(1, Math.min(500, Math.floor(limit || fallback)))

export const listSupabaseCalls = async (client: SupabaseClientLike, workspaceId: string): Promise<CallRecord[]> => {
  const { data, error } = await client.from('calls').select('*').eq('organization_id', workspaceId).order('started_at', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []).map((row: CallRow) => mapCall(row))
}

export const listSupabaseCallsPage = async (
  client: SupabaseClientLike,
  workspaceId: string,
  beforeStartedAt: string | null = null,
  limit = 200,
): Promise<CallRecord[]> => {
  const max = normalizeCallLimit(limit, 200)
  let query = client.from('calls').select('*').eq('organization_id', workspaceId).order('started_at', { ascending: false }).limit(max)
  if (beforeStartedAt) query = query.lt('started_at', beforeStartedAt)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row: CallRow) => mapCall(row))
}

export const getSupabaseCallRecordingUrl = async (client: SupabaseClientLike, callId: string): Promise<string | null> => {
  const { data: call, error } = await client.from('calls').select('recording_path').eq('id', callId).single()
  if (error) throw error
  if (!call?.recording_path) return null
  const { data: signed, error: signedError } = await client.storage.from('crm-recordings').createSignedUrl(call.recording_path, 3600)
  if (signedError) throw signedError
  return signed?.signedUrl ?? null
}

export const listAllSupabaseCalls = async (client: SupabaseClientLike, workspaceId: string): Promise<CallRecord[]> => {
  const rows = await fetchAllRows<CallRow>((from, to) => client.from('calls').select('*').eq('organization_id', workspaceId).order('started_at', { ascending: false }).order('id').range(from, to))
  return rows.map((row) => mapCall(row))
}
