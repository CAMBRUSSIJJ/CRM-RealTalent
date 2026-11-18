// Garimpo — funções puras de mapeamento e extração usadas pela Edge Function prospecting-search.
// Sem dependências de Deno: também são testadas pelo Vitest em src/services/prospecting-sources.test.ts.

export interface ProspectPartner { name: string; role: string; since: string }

export interface ProspectDraft {
  name: string
  company: string
  phone: string
  email: string
  city: string
  state: string
  address: string
  cnpj: string
  instagram: string
  website: string
  bookingUrl: string
  systemName: string
  description: string
  source: 'maps' | 'cnpj'
  sourceDetail: string
  whatsapp: string
  phones: string[]
  emails: string[]
  socials: Record<string, string>
  placeId: string
  mapsUrl: string
  category: string
  rating: number | null
  reviewsCount: number | null
  businessStatus: string
  legalName: string
  tradeName: string
  registrationStatus: string
  cnae: string
  cnaeDescription: string
  companySize: string
  legalNature: string
  shareCapital: number | null
  openedAt: string
  simplesNacional: boolean | null
  mei: boolean | null
  partners: ProspectPartner[]
  enrichment: { website: 'ok' | 'failed' | 'skipped'; cnpj: 'ok' | 'not_found' | 'failed' | 'skipped'; checkedAt: string; notes: string[] }
}

type AnyRecord = Record<string, unknown>
const isRecord = (value: unknown): value is AnyRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, maximum = 500) => typeof value === 'string' ? value.trim().slice(0, maximum) : typeof value === 'number' ? String(value) : ''
const digits = (value: string) => value.replace(/\D/g, '')
const num = (value: unknown) => { const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : null }
const unique = <T,>(items: T[]) => Array.from(new Set(items))

export function emptyDraft(source: ProspectDraft['source']): ProspectDraft {
  return {
    name: '', company: '', phone: '', email: '', city: '', state: '', address: '', cnpj: '', instagram: '', website: '', bookingUrl: '', systemName: '',
    description: '', source, sourceDetail: '', whatsapp: '', phones: [], emails: [], socials: {}, placeId: '', mapsUrl: '', category: '', rating: null,
    reviewsCount: null, businessStatus: '', legalName: '', tradeName: '', registrationStatus: '', cnae: '', cnaeDescription: '', companySize: '', legalNature: '',
    shareCapital: null, openedAt: '', simplesNacional: null, mei: null, partners: [],
    enrichment: { website: 'skipped', cnpj: 'skipped', checkedAt: '', notes: [] },
  }
}

// ---------------------------------------------------------------- CNPJ

export function isValidCnpj(value: string) {
  const cnpj = digits(value)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((total, weight, index) => total + Number(cnpj[index]) * weight, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

export const formatCnpj = (value: string) => {
  const cnpj = digits(value)
  return cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : value
}

export function extractCnpjs(value: string) {
  const matches = value.match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g) ?? []
  return unique(matches.map(digits).filter(isValidCnpj))
}

const formatBrazilPhone = (raw: string) => {
  let value = digits(raw)
  if (value.startsWith('55') && value.length >= 12) value = value.slice(2)
  if (value.length === 11) return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`
  if (value.length === 10) return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`
  return ''
}

const titleCase = (value: string) => value.toLocaleLowerCase('pt-BR').replace(/(^|[\s/(-])([a-zà-ú])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`)

/** Converte a resposta da BrasilAPI (/api/cnpj/v1/{cnpj}) — mesmo formato da minhareceita.org. */
export function mapBrasilApiCompany(payload: unknown): Partial<ProspectDraft> | null {
  if (!isRecord(payload) || !text(payload.cnpj)) return null
  const cnpj = digits(text(payload.cnpj))
  const phones = unique([text(payload.ddd_telefone_1), text(payload.ddd_telefone_2)].map(formatBrazilPhone).filter(Boolean))
  const email = text(payload.email).toLocaleLowerCase('pt-BR')
  const street = [text(payload.descricao_tipo_de_logradouro), text(payload.logradouro)].filter(Boolean).join(' ')
  const address = [
    [street, text(payload.numero)].filter(Boolean).join(', '), text(payload.complemento), text(payload.bairro),
    [text(payload.municipio), text(payload.uf)].filter(Boolean).join(' - '), text(payload.cep),
  ].filter(Boolean).join(', ')
  const qsa = Array.isArray(payload.qsa) ? payload.qsa.filter(isRecord) : []
  const legalName = titleCase(text(payload.razao_social))
  const tradeName = titleCase(text(payload.nome_fantasia))
  const cnaeCode = text(payload.cnae_fiscal)
  return {
    cnpj: formatCnpj(cnpj),
    legalName, tradeName,
    company: tradeName || legalName,
    name: tradeName || legalName,
    registrationStatus: text(payload.descricao_situacao_cadastral) || text(payload.situacao_cadastral),
    cnae: cnaeCode ? cnaeCode.padStart(7, '0').replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3') : '',
    cnaeDescription: text(payload.cnae_fiscal_descricao),
    companySize: text(payload.porte) || text(payload.descricao_porte),
    legalNature: text(payload.natureza_juridica),
    shareCapital: num(payload.capital_social),
    openedAt: text(payload.data_inicio_atividade),
    simplesNacional: typeof payload.opcao_pelo_simples === 'boolean' ? payload.opcao_pelo_simples : null,
    mei: typeof payload.opcao_pelo_mei === 'boolean' ? payload.opcao_pelo_mei : null,
    city: titleCase(text(payload.municipio)),
    state: text(payload.uf).toUpperCase(),
    address: titleCase(address),
    phone: phones[0] ?? '',
    phones,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    emails: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? [email] : [],
    partners: qsa.map((partner) => ({ name: titleCase(text(partner.nome_socio)), role: text(partner.qualificacao_socio), since: text(partner.data_entrada_sociedade) })).filter((partner) => partner.name),
  }
}

// ---------------------------------------------------------------- Google Places (API New)

export const GOOGLE_PLACES_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.rating', 'places.userRatingCount', 'places.primaryTypeDisplayName', 'places.businessStatus',
  'nextPageToken',
].join(',')

export function mapGooglePlace(place: unknown, searchLabel: string): ProspectDraft | null {
  if (!isRecord(place)) return null
  const display = isRecord(place.displayName) ? text(place.displayName.text) : ''
  if (!display) return null
  const components = Array.isArray(place.addressComponents) ? place.addressComponents.filter(isRecord) : []
  const component = (type: string, key: 'longText' | 'shortText' = 'longText') => {
    const found = components.find((item) => Array.isArray(item.types) && item.types.includes(type))
    return found ? text(found[key]) : ''
  }
  const draft = emptyDraft('maps')
  const phone = formatBrazilPhone(text(place.nationalPhoneNumber) || text(place.internationalPhoneNumber)) || text(place.nationalPhoneNumber)
  draft.name = display
  draft.company = display
  draft.phone = phone
  draft.phones = phone ? [phone] : []
  draft.address = text(place.formattedAddress)
  draft.city = component('administrative_area_level_2') || component('locality')
  draft.state = component('administrative_area_level_1', 'shortText')
  draft.website = text(place.websiteUri)
  draft.mapsUrl = text(place.googleMapsUri)
  draft.placeId = text(place.id)
  draft.rating = num(place.rating)
  draft.reviewsCount = num(place.userRatingCount)
  draft.category = isRecord(place.primaryTypeDisplayName) ? text(place.primaryTypeDisplayName.text) : ''
  draft.businessStatus = text(place.businessStatus)
  draft.sourceDetail = `Google Maps · ${searchLabel}`
  // Celular com 9 dígitos costuma ser WhatsApp comercial; confirmado depois pelo site quando houver link wa.me.
  if (/^\(\d{2}\) 9\d{4}-\d{4}$/.test(phone)) draft.whatsapp = phone
  draft.description = [draft.category, draft.rating != null ? `Nota ${draft.rating.toFixed(1)} (${draft.reviewsCount ?? 0} avaliações)` : ''].filter(Boolean).join(' · ')
  return draft
}

// ---------------------------------------------------------------- Site da empresa

const BOOKING_SYSTEMS: Array<[RegExp, string]> = [
  [/trinks\.com/i, 'Trinks'], [/booksy\.com/i, 'Booksy'], [/avec\.(app|beauty|com\.br)/i, 'Avec'], [/appbarber\.com\.br/i, 'AppBarber'],
  [/cashbarber\.com\.br/i, 'CashBarber'], [/inbarber\.com\.br/i, 'InBarber'], [/salaovip\.com\.br/i, 'Salão VIP'], [/simplesagenda\.com\.br/i, 'Simples Agenda'],
  [/agendapro\.com/i, 'AgendaPro'], [/belasis\.com\.br/i, 'Belasis'], [/gendo\.app/i, 'Gendo'], [/calendly\.com/i, 'Calendly'],
  [/doctoralia\.com\.br/i, 'Doctoralia'], [/agendor\.com\.br/i, 'Agendor'], [/beautydate\.com\.br/i, 'Beauty Date'], [/bestbarbers\.app/i, 'Best Barbers'],
  [/linktr\.ee/i, 'Linktree'], [/fresha\.com/i, 'Fresha'], [/setmore\.com/i, 'Setmore'], [/simplybook\.(me|it)/i, 'SimplyBook'],
]
const INSTAGRAM_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'about', 'developer', 'legal', 'direct', 'share', 'sharer'])
const EMAIL_BLOCKLIST = /(\.(png|jpe?g|gif|svg|webp|avif)$)|sentry|wixpress|example\.|seudominio|domain\.com|email@|nome@|@2x|u00/i

const decodeHtml = (value: string) => value
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/')

export interface WebsiteSignals {
  emails: string[]
  phones: string[]
  whatsapp: string
  instagram: string
  socials: Record<string, string>
  cnpjs: string[]
  bookingUrl: string
  systemName: string
  title: string
  description: string
  contactPages: string[]
}

export function extractWebsiteSignals(html: string, pageUrl: string): WebsiteSignals {
  const source = decodeHtml(html)
  const visibleText = source.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const hrefs = Array.from(source.matchAll(/href\s*=\s*["']([^"']+)["']/gi), (match) => match[1].trim())

  const emails = unique([
    ...hrefs.filter((href) => /^mailto:/i.test(href)).map((href) => href.replace(/^mailto:/i, '').split('?')[0]),
    ...(visibleText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []),
  ].map((email) => { try { return decodeURIComponent(email) } catch { return email } }).map((email) => email.trim().toLocaleLowerCase('pt-BR'))
    .filter((email) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) && !EMAIL_BLOCKLIST.test(email))).slice(0, 5)

  const whatsappLinks = unique(Array.from(source.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|web\.whatsapp\.com\/send\/?\?phone=)\+?(\d{10,13})/gi), (match) => formatBrazilPhone(match[1])).filter(Boolean))
  const phones = unique([
    ...hrefs.filter((href) => /^tel:/i.test(href)).map((href) => formatBrazilPhone(href.replace(/^tel:/i, ''))),
    ...whatsappLinks,
  ].filter(Boolean)).slice(0, 5)

  const instagram = Array.from(source.matchAll(/instagram\.com\/([a-z0-9._]{2,30})/gi), (match) => match[1].replace(/\.$/, '').toLocaleLowerCase('pt-BR'))
    .find((handle) => !INSTAGRAM_RESERVED.has(handle)) ?? ''
  const socials: Record<string, string> = {}
  const social = (key: string, pattern: RegExp) => { const match = source.match(pattern); if (match) socials[key] = `https://${match[0].replace(/^https?:\/\//i, '').replace(/["'<>\s].*$/, '')}` }
  social('facebook', /(?:www\.)?facebook\.com\/(?!sharer|share|plugins|tr\b|dialog)[a-z0-9.\-]{3,}/i)
  social('linkedin', /(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[a-z0-9\-_%]+/i)
  social('tiktok', /(?:www\.)?tiktok\.com\/@[a-z0-9._]+/i)
  social('youtube', /(?:www\.)?youtube\.com\/(?:@|c\/|channel\/)[a-z0-9._\-]+/i)

  let bookingUrl = ''; let systemName = ''
  for (const href of [...hrefs, ...(source.match(/https?:\/\/[^\s"'<>]+/gi) ?? [])]) {
    const found = BOOKING_SYSTEMS.find(([pattern]) => pattern.test(href))
    if (found) { bookingUrl = href.startsWith('http') ? href : `https://${href.replace(/^\/+/, '')}`; systemName = found[1]; break }
  }

  let origin = ''
  try { origin = new URL(pageUrl).origin } catch { /* url inválida */ }
  const contactPages = origin ? unique(hrefs.filter((href) => /contato|contact|fale-conosco|sobre|about|quem-somos/i.test(href)).map((href) => {
    try { const url = new URL(href, pageUrl); return url.origin === origin ? url.toString().split('#')[0] : '' } catch { return '' }
  }).filter(Boolean)).slice(0, 2) : []

  const title = decodeHtml(source.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? '').trim()
  const description = (source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i)?.[1]
    ?? source.match(/<meta[^>]+content=["']([^"']{1,400})["'][^>]+name=["']description["']/i)?.[1] ?? '').trim()

  return {
    emails, phones, whatsapp: whatsappLinks[0] ?? '', instagram: instagram ? `@${instagram}` : '', socials,
    cnpjs: extractCnpjs(visibleText), bookingUrl, systemName, title, description, contactPages,
  }
}

/** Preenche apenas campos vazios do rascunho, preservando o que já veio de uma fonte mais confiável. */
export function mergeDraft(base: ProspectDraft, patch: Partial<ProspectDraft>): ProspectDraft {
  const next: ProspectDraft = { ...base, socials: { ...base.socials }, enrichment: { ...base.enrichment, notes: [...base.enrichment.notes] } }
  for (const [key, value] of Object.entries(patch) as Array<[keyof ProspectDraft, unknown]>) {
    if (key === 'enrichment' || value == null) continue
    if (key === 'phones' || key === 'emails') { (next[key] as string[]) = unique([...(next[key] as string[]), ...(value as string[])]).slice(0, 6); continue }
    if (key === 'socials') { next.socials = { ...(value as Record<string, string>), ...next.socials }; continue }
    if (key === 'partners') { if (!next.partners.length) next.partners = value as ProspectPartner[]; continue }
    const current = next[key]
    if (current === '' || current == null) (next as unknown as AnyRecord)[key] = value
  }
  if (!next.phone && next.phones[0]) next.phone = next.phones[0]
  if (!next.email && next.emails[0]) next.email = next.emails[0]
  return next
}

export function applyWebsiteSignals(draft: ProspectDraft, signals: WebsiteSignals): ProspectDraft {
  const next = mergeDraft(draft, {
    emails: signals.emails, phones: signals.phones, instagram: signals.instagram, socials: signals.socials,
    bookingUrl: signals.bookingUrl, systemName: signals.systemName, cnpj: signals.cnpjs[0] ? formatCnpj(signals.cnpjs[0]) : '',
  })
  if (signals.whatsapp) next.whatsapp = signals.whatsapp
  if (!next.description && signals.description) next.description = signals.description
  return next
}

/** Bloqueia IPs literais, hosts internos e portas incomuns antes de buscar o site informado (proteção contra SSRF). */
export function isPublicHttpUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { return false }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return false
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return false
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp|svc|cluster\.local)$/.test(host)
}

export function buildSearchQuery(segment: string, city: string, query: string) {
  const subject = text(query, 160) || text(segment, 160)
  const place = text(city, 120)
  return [subject, place ? `em ${place}` : ''].filter(Boolean).join(' ')
}
