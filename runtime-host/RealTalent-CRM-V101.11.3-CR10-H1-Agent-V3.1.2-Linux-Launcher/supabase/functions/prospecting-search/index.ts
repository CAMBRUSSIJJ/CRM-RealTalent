import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : value == null ? '' : String(value).trim().slice(0, max)
const digits = (value: unknown) => text(value).replace(/\D/g, '')
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const placeCity = (place: Record<string, unknown>, fallback: string) => {
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : []
  for (const preferred of ['administrative_area_level_2', 'locality', 'sublocality']) {
    const component = components.find((entry) => isRecord(entry) && Array.isArray(entry.types) && entry.types.includes(preferred))
    if (isRecord(component)) return text(component.longText || component.shortText, 120) || fallback
  }
  return fallback
}

const googlePlaceDraft = (place: Record<string, unknown>, requestedCity: string) => {
  const displayName = isRecord(place.displayName) ? text(place.displayName.text, 180) : ''
  const links = isRecord(place.googleMapsLinks) ? place.googleMapsLinks : {}
  const location = isRecord(place.location) ? place.location : {}
  const rating = Number(place.rating)
  const ratings = Number(place.userRatingCount)
  return {
    name: displayName,
    company: displayName,
    phone: text(place.internationalPhoneNumber || place.nationalPhoneNumber, 40),
    city: placeCity(place, requestedCity),
    address: text(place.formattedAddress, 300),
    website: text(place.websiteUri, 300),
    description: text(place.primaryType, 180),
    source: 'maps',
    sourceDetail: 'Google Places API (New)',
    notes: Number.isFinite(rating) ? `Google Places: nota ${rating.toFixed(1)}${Number.isFinite(ratings) ? ` · ${ratings} avaliações` : ''}` : '',
    provider: 'google_places',
    placeId: text(place.id, 180),
    googleMapsUrl: text(links.placeUri, 500),
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    businessStatus: text(place.businessStatus, 80),
    rating: Number.isFinite(rating) ? rating : null,
    userRatingCount: Number.isFinite(ratings) ? ratings : null,
    fetchedAt: new Date().toISOString(),
  }
}

const brasilApiDraft = (company: Record<string, unknown>) => {
  const phone = [text(company.ddd_telefone_1, 40), text(company.ddd_telefone_2, 40)].find((value) => digits(value).length >= 10) ?? ''
  const address = [text(company.descricao_tipo_de_logradouro, 80), text(company.logradouro, 160), text(company.numero, 40), text(company.complemento, 100), text(company.bairro, 100)].filter(Boolean).join(' ')
  const status = text(company.descricao_situacao_cadastral || company.situacao_cadastral, 120)
  return {
    name: text(company.nome_fantasia || company.razao_social, 180),
    company: text(company.nome_fantasia || company.razao_social, 180),
    phone,
    email: text(company.email, 180),
    city: [text(company.municipio, 100), text(company.uf, 2)].filter(Boolean).join(', '),
    address,
    cnpj: digits(company.cnpj).slice(0, 14),
    description: text(company.cnae_fiscal_descricao, 500),
    source: 'cnpj',
    sourceDetail: 'BrasilAPI · consulta individual por CNPJ',
    notes: status ? `Situação cadastral: ${status}` : '',
    provider: 'brasilapi',
    legalName: text(company.razao_social, 180),
    tradeName: text(company.nome_fantasia, 180),
    cep: digits(company.cep).slice(0, 8),
    status,
    fetchedAt: new Date().toISOString(),
  }
}

const googleMapsKey = () => text(Deno.env.get('GOOGLE_MAPS_SERVER_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY'), 500)
const cnpjBaseUrl = () => text(Deno.env.get('CNPJ_PROVIDER_BASE_URL'), 500) || 'https://brasilapi.com.br/api/cnpj/v1'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed', code: 'method_not_allowed', message: 'Use POST.' }, 405)

  const auth = request.headers.get('authorization') ?? ''
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return json({ error: 'invalid_session', code: 'invalid_session', message: 'Sessão inválida.' }, 401)

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const organizationId = text(body.organizationId, 80)
  if (!organizationId) return json({ error: 'organization_required', code: 'organization_required', message: 'Workspace não informado.' }, 400)

  const { data: canWrite, error: permissionError } = await client.rpc('can_write_organization', { p_organization_id: organizationId })
  if (permissionError || !canWrite) return json({ error: 'forbidden', code: 'forbidden', message: 'Sem permissão de escrita neste workspace.' }, 403)

  const action = text(body.action, 40) || 'search'
  const mapsConfigured = Boolean(googleMapsKey())
  if (action === 'diagnostics') {
    return json({
      runtime: 'supabase',
      maps: {
        available: mapsConfigured,
        configured: mapsConfigured,
        mode: mapsConfigured ? 'direct' : 'assisted',
        provider: 'Google Places API (New)',
        message: mapsConfigured ? 'Busca direta pronta no gateway Supabase.' : 'Configure GOOGLE_MAPS_SERVER_KEY nos secrets das Edge Functions.',
        maxResults: 20,
      },
      cnpj: {
        available: true,
        configured: true,
        mode: 'direct',
        provider: 'BrasilAPI',
        message: 'Consulta individual por CNPJ disponível no gateway Supabase.',
        maxResults: 1,
      },
      instagram: {
        available: false,
        configured: true,
        mode: 'assisted',
        provider: 'Instagram',
        message: 'Descoberta de perfis permanece assistida; o CRM não automatiza buscas não suportadas oficialmente.',
        maxResults: 0,
      },
      checkedAt: new Date().toISOString(),
    })
  }

  const source = text(body.source, 40)
  const segment = text(body.segment, 180)
  const city = text(body.city, 180)
  const query = text(body.query, 240)
  const quantity = Math.min(20, Math.max(1, Math.round(Number(body.quantity) || 1)))
  const pageToken = text(body.pageToken, 1000)
  const startedAt = new Date().toISOString()

  const { data: batch, error: batchError } = await client.from('prospecting_batches').insert({
    organization_id: organizationId,
    source,
    segment,
    city,
    query,
    requested_count: quantity,
    received_count: 0,
    status: 'running',
    metadata: { engine: 'v100.98', provider: source === 'maps' ? 'google_places' : source === 'cnpj' ? 'brasilapi' : 'assisted', startedAt },
  }).select('id').single()
  if (batchError) return json({ error: 'batch_create_failed', code: 'batch_create_failed', message: batchError.message }, 400)

  const finishBatch = async (status: 'completed' | 'failed', received: number, metadata: Record<string, unknown>) => {
    await client.from('prospecting_batches').update({ status, received_count: received, metadata: { ...metadata, completedAt: new Date().toISOString() } }).eq('id', batch.id)
  }

  try {
    if (source === 'maps') {
      const apiKey = googleMapsKey()
      if (!apiKey) {
        await finishBatch('failed', 0, { code: 'maps_api_key_missing' })
        return json({ error: 'maps_api_key_missing', code: 'maps_api_key_missing', message: 'Google Places ainda não está configurado. Configure GOOGLE_MAPS_SERVER_KEY nos secrets do Supabase.' }, 503)
      }
      const textQuery = [query || segment, city].filter(Boolean).join(' ').trim()
      if (!textQuery) {
        await finishBatch('failed', 0, { code: 'search_query_required' })
        return json({ error: 'search_query_required', code: 'search_query_required', message: 'Informe segmento, nome da empresa ou região para pesquisar.' }, 400)
      }
      const pageSize = Math.min(20, quantity)
      const requestBody: Record<string, unknown> = { textQuery, pageSize, languageCode: 'pt-BR', regionCode: 'BR' }
      if (pageToken) requestBody.pageToken = pageToken
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
          'x-goog-fieldmask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsLinks,places.location,places.primaryType,places.businessStatus,places.rating,places.userRatingCount,nextPageToken',
        },
        body: JSON.stringify(requestBody),
      })
      const data = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok) {
        const message = isRecord(data.error) ? text(data.error.message, 500) : `Google Places respondeu ${response.status}.`
        await finishBatch('failed', 0, { code: 'google_places_error', status: response.status, message })
        return json({ error: 'google_places_error', code: 'google_places_error', message, status: response.status }, response.status)
      }
      const places = Array.isArray(data.places) ? data.places.filter(isRecord) : []
      const drafts = places.map((place) => googlePlaceDraft(place, city))
      const warnings: string[] = []
      await finishBatch('completed', drafts.length, { provider: 'google_places', textQuery, nextPageToken: text(data.nextPageToken, 500) || null, warnings })
      await client.from('prospecting_events').insert({ organization_id: organizationId, batch_id: batch.id, action: 'search', title: 'Busca direta no Google Places', description: `${drafts.length} resultado(s) recebidos para ${textQuery}.`, item_count: drafts.length, metadata: { provider: 'google_places' } })
      return json({ source: 'maps', provider: 'google_places', drafts, count: drafts.length, batchId: batch.id, warnings, nextPageToken: text(data.nextPageToken, 500) || null, fetchedAt: new Date().toISOString() })
    }

    if (source === 'cnpj') {
      const cnpj = digits(query || segment).slice(0, 14)
      if (cnpj.length !== 14) {
        await finishBatch('failed', 0, { code: 'invalid_cnpj' })
        return json({ error: 'invalid_cnpj', code: 'invalid_cnpj', message: 'Informe um CNPJ completo com 14 dígitos.' }, 400)
      }
      const response = await fetch(`${cnpjBaseUrl().replace(/\/$/, '')}/${cnpj}`, { headers: { accept: 'application/json', 'user-agent': 'RealTalent-CRM/100.98' } })
      const data = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok) {
        const message = response.status === 404 ? 'CNPJ não encontrado no provedor cadastral.' : `Consulta CNPJ falhou (${response.status}).`
        await finishBatch('failed', 0, { code: 'cnpj_provider_error', status: response.status })
        return json({ error: 'cnpj_provider_error', code: 'cnpj_provider_error', message, status: response.status }, response.status)
      }
      const draft = brasilApiDraft(data)
      await finishBatch('completed', 1, { provider: 'brasilapi', cnpj })
      await client.from('prospecting_events').insert({ organization_id: organizationId, batch_id: batch.id, action: 'search', title: 'Consulta cadastral por CNPJ', description: `CNPJ ${cnpj} consultado individualmente.`, item_count: 1, metadata: { provider: 'brasilapi' } })
      return json({ source: 'cnpj', provider: 'brasilapi', drafts: [draft], count: 1, batchId: batch.id, warnings: [], nextPageToken: null, fetchedAt: new Date().toISOString() })
    }

    await finishBatch('failed', 0, { code: 'unsupported_source' })
    return json({ error: 'unsupported_source', code: 'unsupported_source', message: 'Esta fonte usa fluxo assistido ou integração própria.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao acessar o provedor.'
    await finishBatch('failed', 0, { code: 'provider_unreachable', message })
    return json({ error: 'provider_unreachable', code: 'provider_unreachable', message }, 502)
  }
})
