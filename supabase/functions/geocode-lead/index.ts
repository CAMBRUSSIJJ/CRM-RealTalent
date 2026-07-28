import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const text = (value: unknown, maximum = 500) => typeof value === 'string' ? value.trim().slice(0, maximum) : value == null ? '' : String(value).trim().slice(0, maximum)
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const buildAddress = (lead: Record<string, unknown>) => {
  const street = [text(lead.street), text(lead.address_number)].filter(Boolean).join(', ')
  return [street, text(lead.complement), text(lead.district), text(lead.city), text(lead.state), text(lead.postal_code), text(lead.country) || 'Brasil'].filter(Boolean).join(', ')
}
const precisionFor = (locationType: string) => {
  if (locationType === 'ROOFTOP') return 'rooftop'
  if (locationType === 'RANGE_INTERPOLATED') return 'range_interpolated'
  if (locationType === 'GEOMETRIC_CENTER') return 'street'
  return 'city'
}
const statusFor = (precision: string) => precision === 'rooftop' || precision === 'range_interpolated' ? 'exact' : 'approximate'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: 'supabase_not_configured' }, 503)
  if (!GOOGLE_MAPS_API_KEY) return json({ error: 'google_maps_api_key_missing', message: 'Configure GOOGLE_MAPS_API_KEY nos secrets da Edge Function.' }, 503)

  const authorization = request.headers.get('authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const ids = isRecord(body) && Array.isArray(body.leadIds) ? body.leadIds.map((item) => text(item, 80)).filter(Boolean) : []
  if (!ids.length) return json({ error: 'empty_lead_ids' }, 400)
  if (ids.length > 100) return json({ error: 'batch_limit_exceeded', maximum: 100 }, 413)

  const { data: leads, error: leadsError } = await admin.from('leads').select('id,organization_id,name,postal_code,street,address_number,complement,district,city,state,country').in('id', ids)
  if (leadsError) return json({ error: 'leads_read_failed', message: leadsError.message }, 500)
  const organizationIds = [...new Set((leads ?? []).map((lead) => lead.organization_id))]
  const { data: memberships, error: membershipError } = await admin.from('organization_members').select('organization_id').eq('user_id', userData.user.id).in('organization_id', organizationIds)
  if (membershipError) return json({ error: 'membership_check_failed', message: membershipError.message }, 500)
  const allowedOrganizations = new Set((memberships ?? []).map((membership) => membership.organization_id))

  const result = { processed: 0, exact: 0, approximate: 0, incomplete: 0, notFound: 0, errors: [] as Array<{ leadId: string; message: string }> }
  for (const lead of leads ?? []) {
    if (!allowedOrganizations.has(lead.organization_id)) { result.errors.push({ leadId: lead.id, message: 'Sem acesso ao workspace deste lead.' }); continue }
    const address = buildAddress(lead)
    if (!text(lead.city)) {
      await admin.from('leads').update({ geocode_status: 'incomplete', geocode_precision: 'unknown', geocode_provider: 'google', geocode_error: 'Informe pelo menos a cidade.', geocoded_at: new Date().toISOString() }).eq('id', lead.id)
      result.processed += 1; result.incomplete += 1; continue
    }
    try {
      const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      endpoint.searchParams.set('address', address)
      endpoint.searchParams.set('region', 'br')
      endpoint.searchParams.set('language', 'pt-BR')
      endpoint.searchParams.set('key', GOOGLE_MAPS_API_KEY)
      const response = await fetch(endpoint)
      const payload = await response.json() as Record<string, unknown>
      const results = Array.isArray(payload.results) ? payload.results : []
      const first = isRecord(results[0]) ? results[0] : null
      const geometry = first && isRecord(first.geometry) ? first.geometry : null
      const location = geometry && isRecord(geometry.location) ? geometry.location : null
      const latitude = Number(location?.lat)
      const longitude = Number(location?.lng)
      if (!first || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const providerStatus = text(payload.status, 80) || 'ZERO_RESULTS'
        await admin.from('leads').update({ latitude: null, longitude: null, geocode_status: 'not_found', geocode_precision: 'unknown', geocode_provider: 'google', geocode_error: `Google Geocoding: ${providerStatus}`, geocoded_at: new Date().toISOString() }).eq('id', lead.id)
        result.processed += 1; result.notFound += 1; continue
      }
      const precision = precisionFor(text(geometry?.location_type, 80))
      const status = statusFor(precision)
      const { error: updateError } = await admin.from('leads').update({
        latitude, longitude, formatted_address: text(first.formatted_address, 500), geocode_status: status,
        geocode_precision: precision, geocode_provider: 'google', geocode_place_id: text(first.place_id, 220) || null,
        geocoded_at: new Date().toISOString(), geocode_error: null,
      }).eq('id', lead.id)
      if (updateError) throw updateError
      result.processed += 1
      if (status === 'exact') result.exact += 1; else result.approximate += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida na geocodificação.'
      result.errors.push({ leadId: lead.id, message })
      await admin.from('leads').update({ geocode_status: 'not_found', geocode_provider: 'google', geocode_error: message.slice(0, 500), geocoded_at: new Date().toISOString() }).eq('id', lead.id)
    }
  }
  return json(result)
})
