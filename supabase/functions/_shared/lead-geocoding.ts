import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''

type LeadRow = {
  id: string
  organization_id: string
  name?: string | null
  postal_code?: string | null
  street?: string | null
  address_number?: string | null
  complement?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
}

export type GeocodeOutcome = {
  status: 'exact' | 'approximate' | 'incomplete' | 'not_found'
  precision: 'rooftop' | 'range_interpolated' | 'street' | 'district' | 'city' | 'unknown'
  latitude: number | null
  longitude: number | null
  formattedAddress: string
  placeId: string | null
  providerStatus: string
  error: string | null
}

const text = (value: unknown, maximum = 500) => typeof value === 'string' ? value.trim().slice(0, maximum) : value == null ? '' : String(value).trim().slice(0, maximum)
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const buildAddress = (lead: LeadRow) => {
  const street = [text(lead.street), text(lead.address_number)].filter(Boolean).join(', ')
  return [street, text(lead.complement), text(lead.district), text(lead.city), text(lead.state), text(lead.postal_code), text(lead.country) || 'Brasil'].filter(Boolean).join(', ')
}

const precisionFor = (locationType: string) => {
  if (locationType === 'ROOFTOP') return 'rooftop' as const
  if (locationType === 'RANGE_INTERPOLATED') return 'range_interpolated' as const
  if (locationType === 'GEOMETRIC_CENTER') return 'street' as const
  if (locationType === 'APPROXIMATE') return 'city' as const
  return 'unknown' as const
}

export async function geocodeLeadRecord(lead: LeadRow): Promise<GeocodeOutcome> {
  const address = buildAddress(lead)
  if (!text(lead.city)) {
    return { status: 'incomplete', precision: 'unknown', latitude: null, longitude: null, formattedAddress: address, placeId: null, providerStatus: 'INCOMPLETE', error: 'Informe pelo menos a cidade.' }
  }
  if (!GOOGLE_MAPS_API_KEY) throw new Error('GOOGLE_MAPS_API_KEY não configurada.')

  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  endpoint.searchParams.set('address', address)
  endpoint.searchParams.set('region', 'br')
  endpoint.searchParams.set('language', 'pt-BR')
  endpoint.searchParams.set('key', GOOGLE_MAPS_API_KEY)
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Google Geocoding respondeu HTTP ${response.status}.`)
  const payload = await response.json() as Record<string, unknown>
  const providerStatus = text(payload.status, 80) || 'UNKNOWN'
  const results = Array.isArray(payload.results) ? payload.results : []
  const first = isRecord(results[0]) ? results[0] : null
  const geometry = first && isRecord(first.geometry) ? first.geometry : null
  const location = geometry && isRecord(geometry.location) ? geometry.location : null
  const latitude = Number(location?.lat)
  const longitude = Number(location?.lng)
  if (!first || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { status: 'not_found', precision: 'unknown', latitude: null, longitude: null, formattedAddress: address, placeId: null, providerStatus, error: `Google Geocoding: ${providerStatus}` }
  }
  const precision = precisionFor(text(geometry?.location_type, 80))
  const status = precision === 'rooftop' || precision === 'range_interpolated' ? 'exact' : 'approximate'
  return {
    status,
    precision,
    latitude,
    longitude,
    formattedAddress: text(first.formatted_address, 500) || address,
    placeId: text(first.place_id, 220) || null,
    providerStatus,
    error: null,
  }
}

export async function persistGeocodeOutcome(admin: SupabaseClient, lead: LeadRow, outcome: GeocodeOutcome) {
  const { error } = await admin.from('leads').update({
    latitude: outcome.latitude,
    longitude: outcome.longitude,
    formatted_address: outcome.formattedAddress,
    geocode_status: outcome.status,
    geocode_precision: outcome.precision,
    geocode_provider: 'google',
    geocode_place_id: outcome.placeId,
    geocoded_at: new Date().toISOString(),
    geocode_error: outcome.error,
  }).eq('id', lead.id).eq('organization_id', lead.organization_id)
  if (error) throw error
}

export async function finishGeocodeJob(admin: SupabaseClient, jobId: string, outcome: GeocodeOutcome | null, errorMessage: string | null, attempts: number, maxAttempts: number) {
  const now = new Date()
  if (!errorMessage && outcome) {
    await admin.from('lead_geocode_jobs').update({
      status: 'completed', result_status: outcome.status, last_error: outcome.error, completed_at: now.toISOString(), locked_at: null, locked_by: null,
      metadata: { providerStatus: outcome.providerStatus, precision: outcome.precision },
    }).eq('id', jobId)
    return
  }
  const terminal = attempts >= maxAttempts
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attempts - 1)))
  await admin.from('lead_geocode_jobs').update({
    status: terminal ? 'failed' : 'retry',
    result_status: 'error',
    last_error: text(errorMessage || 'Falha desconhecida na geocodificação.', 1000),
    scheduled_at: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
    completed_at: terminal ? now.toISOString() : null,
    locked_at: null,
    locked_by: null,
  }).eq('id', jobId)
}
