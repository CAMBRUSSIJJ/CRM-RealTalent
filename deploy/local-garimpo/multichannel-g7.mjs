// G7.1: bounded multi-channel public discovery. Search index results are
// clues, not verified claims; downstream identity matching is mandatory.
const trim = (value, max = 160) => String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max)
const distinct = (values) => [...new Set(values.filter(Boolean))]
export function sourceChannel(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (/(^|\.)instagram\.com$/.test(host)) return 'instagram'
    if (/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)tiktok\.com$/.test(host)) return 'social'
    if (/(^|\.)(?:maps\.google\.[a-z.]+|google\.[a-z.]+)$/.test(host) && /\/maps\b/.test(u.pathname)) return 'maps'
    if (/(appbarber|booksy|trinks|agendamento|calendly|agenda\.com|simplybook|setmore)/.test(host)) return 'booking'
    if (/(indeed|linkedin|gupy|catho|vagas\.com|glassdoor)/.test(host)) return 'jobs'
    if (/(reclameaqui|tripadvisor|yelp)/.test(host)) return 'reputation'
    if (/(cnpj|receita\.fazenda|econodata|empresascnpj|consultasocio)/.test(host)) return 'registry'
    return 'web'
  } catch { return 'web' }
}
export function buildMultiChannelQueries(input, segment = 'geral') {
  const company = trim(input.segment, 95).replace(/["'\\]/g, '')
  const city = trim(input.city, 65).replace(/["'\\]/g, '')
  if (!company || !city) return []
  const base = '"' + company + '" "' + city + '"'
  let domain = ''
  try {
    const u = new URL(input.website)
    if (u.protocol === 'https:' && !u.username && !u.password && !u.port)
      domain = u.hostname.toLowerCase()
  } catch { /* optional known website */ }
  const isBooking = domain && sourceChannel('https://' + domain + '/') === 'booking'
  const sector = segment === 'beleza' ? 'barbearia corte barba'
    : segment === 'educacao' ? 'curso matrícula mensalidade'
    : segment === 'saude' ? 'consulta especialidades atendimento'
    : segment === 'comercio' ? 'loja catálogo produtos'
    : 'serviços produtos'
  // First: the business's own published catalog or booking/price page.
  // Following queries target independent public evidence, never login data.
  const queries = [
    domain ? 'site:' + domain + ' "' + company + '" ' +
      (isBooking ? 'serviços preços agendamento' : 'serviços produtos preços') : '',
    base + ' ' + sector + ' serviços preços tabela agendamento',
    base + ' avaliações clientes Google Maps Facebook reputação',
    base + ' novidades contratações expansão vagas notícia',
  ]
  return distinct(queries.map((q) => trim(q, 190)))
}
export function multiChannelCoverage(sources, instagramDiscovery) {
  const names = {
    booking: 'Agendamento / catálogo', web: 'Sites e notícias', instagram: 'Instagram',
    social: 'Outras redes', maps: 'Mapas / avaliações', jobs: 'Vagas',
    reputation: 'Reputação', registry: 'Dados empresariais',
  }
  const channels = new Map()
  for (const item of sources) {
    if (!item?.url || !String(item.content || '').trim()) continue
    const channel = sourceChannel(item.url)
    channels.set(channel, (channels.get(channel) || 0) + 1)
  }
  // Only count genuinely read posts as Instagram commercial evidence.
  if (instagramDiscovery && !instagramDiscovery.postCount) channels.delete('instagram')
  const rows = [...channels.entries()].map(([channel, pages]) => ({
    channel, label: names[channel] || 'Fonte pública', pages, status: 'read' ,
  }))
  if (!channels.has('instagram') && instagramDiscovery?.profileUrl) rows.push({
    channel: 'instagram', label: 'Instagram', pages: 0,
    status: instagramDiscovery.profileAccess === 'blocked' ? 'restricted' : 'unavailable',
  })
  return rows
}
