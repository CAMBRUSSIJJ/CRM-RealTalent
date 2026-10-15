import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const jsonResponse = (res: { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void }, body: unknown, status = 200) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

const readBody = async (req: AsyncIterable<Uint8Array | string>) => {
  let raw = ''
  for await (const chunk of req) raw += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
  if (!raw.trim()) return {}
  try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
const digits = (value: unknown) => text(value).replace(/\D/g, '')

const placeCity = (place: Record<string, unknown>, fallback: string) => {
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : []
  const preferredTypes = ['administrative_area_level_2', 'locality', 'sublocality']
  for (const type of preferredTypes) {
    const component = components.find((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
      const types = Array.isArray((entry as Record<string, unknown>).types) ? (entry as Record<string, unknown>).types : []
      return types.includes(type)
    }) as Record<string, unknown> | undefined
    if (component) return text(component.longText || component.shortText) || fallback
  }
  return fallback
}

const googlePlaceDraft = (place: Record<string, unknown>, requestedCity: string) => {
  const displayName = place.displayName && typeof place.displayName === 'object' && !Array.isArray(place.displayName)
    ? text((place.displayName as Record<string, unknown>).text)
    : ''
  const links = place.googleMapsLinks && typeof place.googleMapsLinks === 'object' && !Array.isArray(place.googleMapsLinks)
    ? place.googleMapsLinks as Record<string, unknown>
    : {}
  const location = place.location && typeof place.location === 'object' && !Array.isArray(place.location)
    ? place.location as Record<string, unknown>
    : {}
  const rating = Number(place.rating)
  const ratings = Number(place.userRatingCount)
  return {
    name: displayName,
    company: displayName,
    phone: text(place.internationalPhoneNumber || place.nationalPhoneNumber),
    city: placeCity(place, requestedCity),
    address: text(place.formattedAddress),
    website: text(place.websiteUri),
    description: text(place.primaryTypeDisplayName && typeof place.primaryTypeDisplayName === 'object' && !Array.isArray(place.primaryTypeDisplayName)
      ? (place.primaryTypeDisplayName as Record<string, unknown>).text
      : place.primaryType),
    source: 'maps',
    sourceDetail: 'Google Places API (New)',
    notes: Number.isFinite(rating) ? `Google Places: nota ${rating.toFixed(1)}${Number.isFinite(ratings) ? ` · ${ratings} avaliações` : ''}` : '',
    provider: 'google_places',
    placeId: text(place.id),
    googleMapsUrl: text(links.placeUri),
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    businessStatus: text(place.businessStatus),
    rating: Number.isFinite(rating) ? rating : null,
    userRatingCount: Number.isFinite(ratings) ? ratings : null,
    fetchedAt: new Date().toISOString(),
  }
}

const brasilApiDraft = (company: Record<string, unknown>) => {
  const phone = [text(company.ddd_telefone_1), text(company.ddd_telefone_2)].find((value) => digits(value).length >= 10) ?? ''
  const address = [text(company.descricao_tipo_de_logradouro), text(company.logradouro), text(company.numero), text(company.complemento), text(company.bairro)].filter(Boolean).join(' ')
  const status = text(company.descricao_situacao_cadastral || company.situacao_cadastral)
  return {
    name: text(company.nome_fantasia || company.razao_social),
    company: text(company.nome_fantasia || company.razao_social),
    phone,
    email: text(company.email),
    city: [text(company.municipio), text(company.uf)].filter(Boolean).join(', '),
    address,
    cnpj: digits(company.cnpj).slice(0, 14),
    description: text(company.cnae_fiscal_descricao),
    source: 'cnpj',
    sourceDetail: 'BrasilAPI · consulta individual por CNPJ',
    notes: status ? `Situação cadastral: ${status}` : '',
    provider: 'brasilapi',
    legalName: text(company.razao_social),
    tradeName: text(company.nome_fantasia),
    cep: digits(company.cep),
    status,
    fetchedAt: new Date().toISOString(),
  }
}

const prospectingLocalApi = (env: Record<string, string>): Plugin => ({
  name: 'realtalent-prospecting-local-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = (req.url ?? '').split('?')[0]
      const prospectingPath = pathname === '/api/prospecting/diagnostics' || pathname === '/api/prospecting/search'
      const mapsPath = pathname === '/api/maps/diagnostics' || pathname === '/api/maps/geocode'
      if (!prospectingPath && !mapsPath) return next()

      if (pathname === '/api/maps/diagnostics') {
        const configured = Boolean(text(env.GOOGLE_MAPS_SERVER_KEY || env.GOOGLE_MAPS_API_KEY))
        return jsonResponse(res, {
          runtime: 'local-vite',
          configured,
          renderer: 'OpenStreetMap / Leaflet',
          provider: configured ? 'Google Geocoding API + OpenStreetMap' : 'OpenStreetMap + estimativa local',
          geocoding: configured ? 'google-geocoding' : 'local-estimate',
          places: configured ? 'google-places-new' : 'assisted',
          message: configured ? 'Território pronto para geocodificação real e busca Places.' : 'Mapa funciona sem chave. Configure GOOGLE_MAPS_SERVER_KEY para coordenadas reais por endereço.',
          checkedAt: new Date().toISOString(),
        })
      }

      if (pathname === '/api/maps/geocode') {
        if (req.method !== 'POST') return jsonResponse(res, { error: 'method_not_allowed', message: 'Use POST para geocodificar.' }, 405)
        const apiKey = text(env.GOOGLE_MAPS_SERVER_KEY || env.GOOGLE_MAPS_API_KEY)
        if (!apiKey) return jsonResponse(res, { error: 'maps_api_key_missing', code: 'maps_api_key_missing', message: 'Google Geocoding ainda não está configurado. Execute ./configure-google-maps.sh e reinicie o CRM.' }, 503)
        const body = await readBody(req)
        const items = Array.isArray(body.items) ? body.items.slice(0, 100) : []
        const outcomes = [] as Array<Record<string, unknown>>
        for (const rawItem of items) {
          if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue
          const item = rawItem as Record<string, unknown>
          const id = text(item.id)
          const address = text(item.address)
          if (!id || !address) { outcomes.push({ id, ok: false, code: 'address_required', message: 'Endereço ausente.' }); continue }
          try {
            const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json')
            endpoint.searchParams.set('address', address)
            endpoint.searchParams.set('key', apiKey)
            endpoint.searchParams.set('language', 'pt-BR')
            endpoint.searchParams.set('region', 'br')
            const response = await fetch(endpoint, { headers: { accept: 'application/json', 'user-agent': 'RealTalent-CRM/101.0' } })
            const data = await response.json().catch(() => ({})) as Record<string, unknown>
            const status = text(data.status)
            const results = Array.isArray(data.results) ? data.results : []
            const first = results[0] && typeof results[0] === 'object' && !Array.isArray(results[0]) ? results[0] as Record<string, unknown> : null
            const geometry = first?.geometry && typeof first.geometry === 'object' && !Array.isArray(first.geometry) ? first.geometry as Record<string, unknown> : null
            const location = geometry?.location && typeof geometry.location === 'object' && !Array.isArray(geometry.location) ? geometry.location as Record<string, unknown> : null
            const locationType = text(geometry?.location_type)
            const latitude = Number(location?.lat)
            const longitude = Number(location?.lng)
            if (!response.ok || status !== 'OK' || !first || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              outcomes.push({ id, ok: false, code: status || `HTTP_${response.status}`, message: status === 'ZERO_RESULTS' ? 'Endereço não encontrado pelo Google.' : `Google Geocoding respondeu ${status || response.status}.` })
              continue
            }
            const precision = locationType === 'ROOFTOP' ? 'rooftop' : locationType === 'RANGE_INTERPOLATED' ? 'range_interpolated' : locationType === 'GEOMETRIC_CENTER' ? 'street' : 'city'
            const exact = locationType === 'ROOFTOP' || locationType === 'RANGE_INTERPOLATED'
            outcomes.push({
              id, ok: true, status: exact ? 'exact' : 'approximate', precision, latitude, longitude,
              formattedAddress: text(first.formatted_address) || address, placeId: text(first.place_id) || null, providerStatus: status, locationType,
            })
          } catch (error) {
            outcomes.push({ id, ok: false, code: 'provider_unreachable', message: error instanceof Error ? error.message : 'Google Geocoding indisponível.' })
          }
        }
        return jsonResponse(res, { provider: 'google-geocoding', outcomes, count: outcomes.length, checkedAt: new Date().toISOString() })
      }

      if (pathname === '/api/prospecting/diagnostics') {
        const mapsConfigured = Boolean(text(env.GOOGLE_MAPS_SERVER_KEY || env.GOOGLE_MAPS_API_KEY))
        return jsonResponse(res, {
          runtime: 'local-vite',
          maps: {
            available: mapsConfigured,
            configured: mapsConfigured,
            mode: mapsConfigured ? 'direct' : 'assisted',
            provider: 'Google Places API (New)',
            message: mapsConfigured ? 'Busca direta pronta no gateway local.' : 'Adicione GOOGLE_MAPS_SERVER_KEY ao .env.local para ativar busca direta.',
            maxResults: 20,
          },
          cnpj: {
            available: true,
            configured: true,
            mode: 'direct',
            provider: 'BrasilAPI',
            message: 'Consulta individual por CNPJ disponível no gateway local.',
            maxResults: 1,
          },
          instagram: {
            available: false,
            configured: true,
            mode: 'assisted',
            provider: 'Instagram',
            message: 'Descoberta de perfis permanece assistida; o CRM não automatiza busca de perfis fora das APIs oficiais.',
            maxResults: 0,
          },
          checkedAt: new Date().toISOString(),
        })
      }

      if (req.method !== 'POST') return jsonResponse(res, { error: 'method_not_allowed', message: 'Use POST para pesquisar.' }, 405)
      const body = await readBody(req)
      const source = text(body.source)
      const city = text(body.city)
      const segment = text(body.segment)
      const query = text(body.query)
      const quantity = Math.min(20, Math.max(1, Math.round(Number(body.quantity) || 1)))
      const pageToken = text(body.pageToken)

      try {
        if (source === 'maps') {
          const apiKey = text(env.GOOGLE_MAPS_SERVER_KEY || env.GOOGLE_MAPS_API_KEY)
          if (!apiKey) return jsonResponse(res, { error: 'maps_api_key_missing', code: 'maps_api_key_missing', message: 'Google Places ainda não está configurado. Adicione GOOGLE_MAPS_SERVER_KEY ao .env.local e reinicie o CRM.' }, 503)
          const textQuery = [query || segment, city].filter(Boolean).join(' ').trim()
          if (!textQuery) return jsonResponse(res, { error: 'search_query_required', code: 'search_query_required', message: 'Informe segmento, nome da empresa ou região para pesquisar.' }, 400)
          const pageSize = Math.min(20, quantity)
          const requestBody: Record<string, unknown> = { textQuery, pageSize, languageCode: 'pt-BR', regionCode: 'BR' }
          if (pageToken) requestBody.pageToken = pageToken
          const google = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-goog-api-key': apiKey,
              'x-goog-fieldmask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsLinks,places.location,places.primaryType,places.businessStatus,places.rating,places.userRatingCount,nextPageToken',
            },
            body: JSON.stringify(requestBody),
          })
          const data = await google.json().catch(() => ({})) as Record<string, unknown>
          if (!google.ok) return jsonResponse(res, { error: 'google_places_error', code: 'google_places_error', message: text((data.error as Record<string, unknown> | undefined)?.message) || `Google Places respondeu ${google.status}.`, details: data }, google.status)
          const places = Array.isArray(data.places) ? data.places.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
          const drafts = places.map((place) => googlePlaceDraft(place, city))
          return jsonResponse(res, {
            source: 'maps', provider: 'google_places', drafts, count: drafts.length, batchId: null,
            warnings: [],
            nextPageToken: text(data.nextPageToken) || null, fetchedAt: new Date().toISOString(),
          })
        }

        if (source === 'cnpj') {
          const cnpj = digits(query || segment)
          if (cnpj.length !== 14) return jsonResponse(res, { error: 'invalid_cnpj', code: 'invalid_cnpj', message: 'Informe um CNPJ completo com 14 dígitos para consulta cadastral.' }, 400)
          const base = text(env.CNPJ_PROVIDER_BASE_URL) || 'https://brasilapi.com.br/api/cnpj/v1'
          const response = await fetch(`${base.replace(/\/$/, '')}/${cnpj}`, { headers: { accept: 'application/json', 'user-agent': 'RealTalent-CRM/100.98' } })
          const data = await response.json().catch(() => ({})) as Record<string, unknown>
          if (!response.ok) return jsonResponse(res, { error: 'cnpj_provider_error', code: 'cnpj_provider_error', message: response.status === 404 ? 'CNPJ não encontrado no provedor cadastral.' : `Consulta CNPJ falhou (${response.status}).`, details: data }, response.status)
          const draft = brasilApiDraft(data)
          return jsonResponse(res, { source: 'cnpj', provider: 'brasilapi', drafts: [draft], count: 1, batchId: null, warnings: [], nextPageToken: null, fetchedAt: new Date().toISOString() })
        }

        return jsonResponse(res, { error: 'unsupported_source', code: 'unsupported_source', message: 'Esta fonte usa fluxo assistido ou integração própria.' }, 400)
      } catch (error) {
        return jsonResponse(res, { error: 'provider_unreachable', code: 'provider_unreachable', message: error instanceof Error ? error.message : 'Não foi possível acessar o provedor.' }, 502)
      }
    })
  },
})

export default defineConfig(({ mode }) => {
  const runtimeEnv = loadEnv(mode, process.cwd(), '')
  const runtimeToken = String(process.env.REALTALENT_RUNTIME_TOKEN || runtimeEnv.REALTALENT_RUNTIME_TOKEN || '').trim()
  const connectPort = Number(process.env.REALTALENT_CONNECT_PORT || runtimeEnv.REALTALENT_CONNECT_PORT || 3001)
  const communicationsPort = Number(process.env.REALTALENT_COMMUNICATIONS_PORT || runtimeEnv.REALTALENT_COMMUNICATIONS_PORT || 3002)
  const runtimeControlPort = Number(process.env.REALTALENT_RUNTIME_CONTROL_PORT || runtimeEnv.REALTALENT_RUNTIME_CONTROL_PORT || 3003)
  const serviceHeaders = runtimeToken ? { 'x-realtalent-runtime-token': runtimeToken } : undefined
  const localServiceProxy = {
    '/__rt/connect': {
      target: `http://127.0.0.1:${connectPort}`,
      changeOrigin: true,
      ws: true,
      headers: serviceHeaders,
      rewrite: (path: string) => path.replace(/^\/__rt\/connect/, ''),
    },
    '/__rt/communications': {
      target: `http://127.0.0.1:${communicationsPort}`,
      changeOrigin: true,
      ws: true,
      headers: serviceHeaders,
      rewrite: (path: string) => path.replace(/^\/__rt\/communications/, ''),
    },
    '/__rt/runtime': {
      target: `http://127.0.0.1:${runtimeControlPort}`,
      changeOrigin: true,
      headers: serviceHeaders,
      rewrite: (path: string) => path.replace(/^\/__rt\/runtime/, ''),
    },
  }
  return {
    base: mode === 'standalone' ? './' : '/',
    plugins: [react(), prospectingLocalApi(runtimeEnv)],
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: mode === 'standalone' ? 1100 : 800,
      rolldownOptions: mode === 'standalone' ? { output: { codeSplitting: false } } : undefined,
    },
    server: { port: 4173, strictPort: true, proxy: localServiceProxy },
    preview: { port: 4174, strictPort: true, proxy: localServiceProxy },
  }
})
