import { isRecord, ProspectingError, publicWebUrl, type AiSearchInput, type AiSource } from './prospecting-ai.ts'

export function createFirecrawlResearch(baseUrl: string, apiKey = '', fetcher: typeof fetch = fetch, allowLocal = false) {
  const base = new URL(baseUrl)
  const localHttp = allowLocal && base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  if ((!localHttp && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash) throw new Error('firecrawl_requires_https')
  const endpoint = new URL(`${base.href.replace(/\/$/, '').replace(/\/v2$/, '')}/v2/search`)
  return async (input: AiSearchInput, signal: AbortSignal): Promise<{ report: string; sources: AiSource[]; warnings: string[] }> => {
    const review = input.source === 'manual'
    const focus = input.source === 'instagram' ? 'site:instagram.com' : input.source === 'cnpj' ? 'CNPJ empresa' : ''
    // Use concise search terms: long instructions and a long list of desired
    // fields make SearXNG return zero results, even for genuine businesses.
    const searchPhrase = review
      ? [input.segment, input.city, 'telefone agendamento'].filter(Boolean).join(' ')
      : [input.segment, input.city, input.query, focus].filter(Boolean).join(' ').slice(0, 300)
    const request = async (query: string, limit: number) => {
      const response = await fetcher(endpoint, {
        method: 'POST', redirect: 'error', signal,
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          query, limit, sources: ['web'],
          scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
        }),
      })
      if (!response.ok) throw new ProspectingError('firecrawl_search_failed', 502)
      const payload: unknown = await response.json()
      if (!isRecord(payload) || payload.success === false || !isRecord(payload.data) || !Array.isArray(payload.data.web)) {
        throw new ProspectingError('firecrawl_response_invalid', 502)
      }
      return payload.data.web as unknown[]
    }
    const sources: AiSource[] = []
    const documents: Array<{ url: string; title: string; content: string }> = []
    const warnings: string[] = []
    let remaining = 60_000
    const addResults = (items: unknown[]) => {
      for (const item of items.slice(0, 15)) {
        if (!isRecord(item) || remaining <= 0) continue
        const url = publicWebUrl(item.url)
        if (!url || sources.some((source) => source.url === url)) continue
        const title = typeof item.title === 'string' ? item.title.slice(0, 300) : new URL(url).hostname
        const content = [item.description, item.markdown].filter((value): value is string => typeof value === 'string')
          .join('\n').slice(0, Math.min(9000, remaining))
        if (!content) continue
        remaining -= content.length
        sources.push({ url, title, content })
        documents.push({ url, title, content })
      }
    }
    if (review && input.website) {
      // The saved booking/site URL can contain contacts even when no search
      // engine indexes it. Read only a validated public HTTPS URL.
      try {
        const scrapeEndpoint = new URL(base.href.replace(/\/$/, '').replace(/\/v2$/, '') + '/v2/scrape')
        const response = await fetcher(scrapeEndpoint, {
          method: 'POST', redirect: 'error', signal,
          headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: 'Bearer ' + apiKey } : {}) },
          body: JSON.stringify({ url: input.website, formats: ['markdown'], onlyMainContent: true }),
        })
        if (response.ok) {
          const payload: unknown = await response.json()
          const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null
          if (data) addResults([{ url: input.website,
            title: isRecord(data.metadata) ? data.metadata.title : '',
            description: '', markdown: data.markdown }])
          else warnings.push('O site cadastrado não retornou conteúdo utilizável.')
        } else warnings.push('O site cadastrado não pôde ser lido automaticamente.')
      } catch (error) {
        if (signal.aborted) throw error
        warnings.push('Não foi possível ler o site cadastrado. A pesquisa em outras fontes continua.')
      }
    }
    addResults(await request(searchPhrase, review ? 5 : Math.min(input.limit * 2, 20)))
    if (review && !signal.aborted) {
      // A second, focused web-index search may expose public posts/reels. It
      // does not bypass Instagram login, private accounts or rate limits.
      try {
        const account = input.instagram
          ? input.instagram.replace(/^https:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/$/, '')
          : ''
        const instagramQuery = 'site:instagram.com/p OR site:instagram.com/reel ' +
          (account ? account + ' ' + input.segment.slice(0, 70) : input.segment.slice(0, 70) + ' ' + input.city.slice(0, 70))
        addResults(await request(instagramQuery, 5))
      } catch (error) {
        if (signal.aborted) throw error
        warnings.push('A pesquisa de publicações públicas do Instagram não respondeu. A pesquisa nos demais sites foi preservada.')
      }
      if (!sources.some((source) => /(^|\.)instagram\.com$/i.test(new URL(source.url).hostname))) {
        warnings.push('Nenhum post público do Instagram ficou acessível pelas fontes pesquisadas. Conteúdo privado, Stories e perfis bloqueados não foram analisados.')
      }
    }
    return { report: JSON.stringify(documents), sources, warnings }
  }
}
