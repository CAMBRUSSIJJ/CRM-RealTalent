// Garimpo — busca real de empresas com enriquecimento automático.
// maps:   Google Places (Text Search New) por segmento + cidade → site → contatos, redes, CNPJ → Receita Federal (BrasilAPI)
// cnpj:   lista de CNPJs → Receita Federal (razão social, situação, CNAE, porte, sócios, telefones e e-mail)
// enrich: reprocessa itens já capturados (site e/ou CNPJ)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  GOOGLE_PLACES_FIELD_MASK, applyWebsiteSignals, buildSearchQuery, emptyDraft, extractCnpjs, extractWebsiteSignals, formatCnpj, isPublicHttpUrl, isValidCnpj,
  mapBrasilApiCompany, mapGooglePlace, mergeDraft, type ProspectDraft,
} from '../_shared/prospecting-sources.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''
const MAX_RESULTS = 60
const MAX_CNPJS = 50
const USER_AGENT = 'Mozilla/5.0 (compatible; RealTalentCRM-Garimpo/1.0)'

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
const text = (value: unknown, maximum = 200) => typeof value === 'string' ? value.trim().slice(0, maximum) : ''
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '')

type Mode = 'maps' | 'cnpj' | 'enrich'
interface RequestBody {
  organizationId?: string
  mode?: Mode
  segment?: string
  city?: string
  query?: string
  limit?: number
  enrich?: boolean
  cnpjs?: string[] | string
  items?: Array<Partial<ProspectDraft>>
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await worker(items[index], index) }
  }))
  return results
}

// ------------------------------------------------------------- Google Places

async function searchGooglePlaces(textQuery: string, limit: number) {
  const places: unknown[] = []
  let pageToken = ''
  while (places.length < limit) {
    const body: Record<string, unknown> = { textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: Math.min(20, limit - places.length) }
    if (pageToken) body.pageToken = pageToken
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
    const payload = await response.json().catch(() => ({})) as { places?: unknown[]; nextPageToken?: string; error?: { message?: string; status?: string } }
    if (!response.ok) throw new Error(`Google Places: ${payload.error?.status ?? response.status} ${payload.error?.message ?? ''}`.trim())
    places.push(...(payload.places ?? []))
    pageToken = payload.nextPageToken ?? ''
    if (!pageToken || !(payload.places ?? []).length) break
  }
  return places.slice(0, limit)
}

// ------------------------------------------------------------- Receita Federal

const cnpjCache = new Map<string, Partial<ProspectDraft> | null>()
async function lookupCnpj(cnpj: string): Promise<Partial<ProspectDraft> | null> {
  const key = cnpj.replace(/\D/g, '')
  if (cnpjCache.has(key)) return cnpjCache.get(key) ?? null
  const providers = [`https://brasilapi.com.br/api/cnpj/v1/${key}`, `https://minhareceita.org/${key}`]
  let lastError = ''
  for (const url of providers) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(12000) })
      if (response.status === 404) { cnpjCache.set(key, null); return null }
      if (!response.ok) { lastError = `HTTP ${response.status}`; continue }
      const mapped = mapBrasilApiCompany(await response.json())
      cnpjCache.set(key, mapped)
      return mapped
    } catch (error) { lastError = error instanceof Error ? error.message : String(error) }
  }
  throw new Error(`Consulta de CNPJ indisponível (${lastError}).`)
}

// ------------------------------------------------------------- Site

async function fetchHtml(initialUrl: string) {
  let url = initialUrl
  for (let hop = 0; hop < 4; hop += 1) {
    if (!isPublicHttpUrl(url)) throw new Error('endereço não permitido')
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }, redirect: 'manual', signal: AbortSignal.timeout(8000) })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error(`HTTP ${response.status}`)
      url = new URL(location, url).toString()
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const type = response.headers.get('content-type') ?? ''
    if (type && !/html|xml|text/i.test(type)) throw new Error('conteúdo não é HTML')
    const body = await response.text()
    return { html: body.slice(0, 1_500_000), finalUrl: url }
  }
  throw new Error('redirecionamentos demais')
}

const isSocialOnly = (url: string) => /instagram\.com|facebook\.com|linktr\.ee|wa\.me|whatsapp\.com/i.test(url)

async function enrichFromWebsite(draft: ProspectDraft): Promise<ProspectDraft> {
  let website = draft.website.trim()
  if (!website) return draft
  if (!/^https?:\/\//i.test(website)) website = `https://${website}`
  if (/instagram\.com\/([a-z0-9._]+)/i.test(website)) {
    const handle = website.match(/instagram\.com\/([a-z0-9._]+)/i)?.[1] ?? ''
    return mergeDraft({ ...draft, enrichment: { ...draft.enrichment, website: 'skipped', notes: [...draft.enrichment.notes, 'Site informado é o próprio Instagram'] } }, { instagram: handle ? `@${handle.toLowerCase()}` : '' })
  }
  try {
    const home = await fetchHtml(website)
    const homeSignals = extractWebsiteSignals(home.html, home.finalUrl)
    let next = applyWebsiteSignals(draft, homeSignals)
    // Sem e-mail ou CNPJ na página inicial: tenta a página de contato/sobre.
    if (!isSocialOnly(home.finalUrl) && (!next.email || !next.cnpj) && homeSignals.contactPages.length) {
      for (const page of homeSignals.contactPages) {
        try { const contact = await fetchHtml(page); next = applyWebsiteSignals(next, extractWebsiteSignals(contact.html, contact.finalUrl)) } catch { /* segue */ }
        if (next.email && next.cnpj) break
      }
    }
    next.enrichment = { ...next.enrichment, website: 'ok' }
    return next
  } catch (error) {
    return { ...draft, enrichment: { ...draft.enrichment, website: 'failed', notes: [...draft.enrichment.notes, `Site inacessível: ${error instanceof Error ? error.message : 'erro'}`] } }
  }
}

async function enrichFromCnpj(draft: ProspectDraft, requireSameCity: boolean): Promise<ProspectDraft> {
  const cnpj = draft.cnpj.replace(/\D/g, '')
  if (!isValidCnpj(cnpj)) return draft
  try {
    const company = await lookupCnpj(cnpj)
    if (!company) return { ...draft, enrichment: { ...draft.enrichment, cnpj: 'not_found' } }
    // CNPJ achado no site pode ser da agência que fez o site: confere a cidade antes de mesclar.
    if (requireSameCity && draft.city && company.city && normalize(draft.city) !== normalize(company.city)) {
      return { ...draft, cnpj: '', enrichment: { ...draft.enrichment, cnpj: 'not_found', notes: [...draft.enrichment.notes, `CNPJ ${company.cnpj} encontrado no site pertence a ${company.legalName} (${company.city}) — descartado`] } }
    }
    const next = mergeDraft(draft, company)
    next.legalName = company.legalName ?? next.legalName
    next.registrationStatus = company.registrationStatus ?? next.registrationStatus
    next.enrichment = { ...next.enrichment, cnpj: 'ok' }
    return next
  } catch (error) {
    return { ...draft, enrichment: { ...draft.enrichment, cnpj: 'failed', notes: [...draft.enrichment.notes, error instanceof Error ? error.message : 'Falha na consulta do CNPJ'] } }
  }
}

async function enrichDraft(draft: ProspectDraft, options: { website: boolean; cnpjFromSite: boolean }) {
  let next = draft
  const hadCnpj = Boolean(next.cnpj)
  if (options.website) next = await enrichFromWebsite(next)
  next = await enrichFromCnpj(next, options.cnpjFromSite && !hadCnpj)
  next.enrichment = { ...next.enrichment, checkedAt: new Date().toISOString() }
  return next
}

// ------------------------------------------------------------- HTTP

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: 'supabase_not_configured' }, 503)

  const authorization = request.headers.get('authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  let body: RequestBody = {}
  try { body = await request.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const organizationId = text(body.organizationId, 64)
  if (!organizationId) return json({ error: 'organization_required' }, 400)
  const { data: canWrite } = await userClient.rpc('can_write_organization', { p_organization_id: organizationId })
  if (!canWrite) return json({ error: 'forbidden' }, 403)

  const mode: Mode = body.mode === 'cnpj' || body.mode === 'enrich' ? body.mode : 'maps'
  const limit = Math.max(1, Math.min(MAX_RESULTS, Math.round(Number(body.limit) || 20)))
  const enrich = body.enrich !== false
  const warnings: string[] = []
  const startedAt = Date.now()
  let results: ProspectDraft[] = []
  let label = ''

  try {
    if (mode === 'maps') {
      if (!GOOGLE_PLACES_API_KEY) return json({ error: 'maps_not_configured', message: 'Configure o segredo GOOGLE_MAPS_API_KEY (com a Places API (New) ativada) no Supabase.' }, 503)
      const textQuery = buildSearchQuery(text(body.segment), text(body.city), text(body.query))
      if (!textQuery) return json({ error: 'query_required', message: 'Informe o segmento ou uma busca específica.' }, 400)
      label = textQuery
      const places = await searchGooglePlaces(textQuery, limit)
      results = places.map((place) => mapGooglePlace(place, textQuery)).filter((item): item is ProspectDraft => Boolean(item))
      const closed = results.filter((item) => item.businessStatus === 'CLOSED_PERMANENTLY').length
      results = results.filter((item) => item.businessStatus !== 'CLOSED_PERMANENTLY')
      if (closed) warnings.push(`${closed} empresa(s) fechada(s) definitivamente foram ignoradas.`)
      if (enrich) results = await mapLimit(results, 6, (draft) => enrichDraft(draft, { website: true, cnpjFromSite: true }))
    } else if (mode === 'cnpj') {
      const raw = Array.isArray(body.cnpjs) ? body.cnpjs.join('\n') : text(body.cnpjs, 20000) || text(body.query, 20000)
      const cnpjs = extractCnpjs(raw).slice(0, MAX_CNPJS)
      if (!cnpjs.length) return json({ error: 'cnpj_required', message: 'Informe pelo menos um CNPJ válido.' }, 400)
      label = `${cnpjs.length} CNPJ(s)`
      results = await mapLimit(cnpjs, 3, async (cnpj) => {
        const draft = { ...emptyDraft('cnpj'), cnpj: formatCnpj(cnpj), sourceDetail: 'Receita Federal' }
        return enrichDraft(draft, { website: false, cnpjFromSite: false })
      })
      const missing = results.filter((item) => item.enrichment.cnpj !== 'ok')
      if (missing.length) warnings.push(`${missing.length} CNPJ(s) não retornaram dados da Receita.`)
      results = results.filter((item) => item.enrichment.cnpj === 'ok')
    } else {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 25)
      if (!items.length) return json({ error: 'items_required' }, 400)
      label = `Enriquecimento de ${items.length} registro(s)`
      results = await mapLimit(items, 5, (item) => {
        const draft = mergeDraft(emptyDraft(item.source === 'cnpj' ? 'cnpj' : 'maps'), item)
        return enrichDraft(draft, { website: true, cnpjFromSite: true })
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na busca.'
    return json({ error: 'provider_error', message }, 502)
  }

  if (SERVICE_ROLE_KEY && mode !== 'enrich') {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    await admin.from('prospecting_batches').insert({
      organization_id: organizationId, source: mode, segment: text(body.segment), city: text(body.city), query: label,
      requested_count: limit, received_count: results.length, status: 'completed', created_by: userData.user.id,
      metadata: { enrich, warnings, durationMs: Date.now() - startedAt, provider: mode === 'maps' ? 'google-places' : 'receita-federal' },
    }).then(() => undefined, () => undefined)
  }

  const stats = {
    returned: results.length,
    withPhone: results.filter((item) => item.phone).length,
    withWhatsapp: results.filter((item) => item.whatsapp).length,
    withEmail: results.filter((item) => item.email).length,
    withInstagram: results.filter((item) => item.instagram).length,
    withCnpj: results.filter((item) => item.enrichment.cnpj === 'ok').length,
    withWebsite: results.filter((item) => item.website).length,
  }
  return json({ ok: true, mode, query: label, results, stats, warnings, durationMs: Date.now() - startedAt })
})
