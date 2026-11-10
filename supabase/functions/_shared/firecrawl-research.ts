import { isRecord, ProspectingError, publicWebUrl, type AiSearchInput, type AiSource } from './prospecting-ai.ts'

export function createFirecrawlResearch(baseUrl: string, apiKey = '', fetcher: typeof fetch = fetch, allowLocal = false) {
  const base = new URL(baseUrl)
  const localHttp = allowLocal && base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  if ((!localHttp && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash) throw new Error('firecrawl_requires_https')
  const endpoint = new URL(`${base.href.replace(/\/$/, '').replace(/\/v2$/, '')}/v2/search`)
  return async (input: AiSearchInput, signal: AbortSignal): Promise<{ report: string; sources: AiSource[] }> => {
    const focus = input.source === 'instagram' ? 'Instagram' : input.source === 'cnpj' ? 'CNPJ empresa' : ''
    const response = await fetcher(endpoint, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ query: [input.segment, input.city, input.query, focus].filter(Boolean).join(' '), limit: Math.min(input.limit * 2, 20),
        sources: ['web'], scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
    })
    if (!response.ok) throw new ProspectingError('firecrawl_search_failed', 502)
    const payload: unknown = await response.json()
    if (!isRecord(payload) || payload.success === false || !isRecord(payload.data) || !Array.isArray(payload.data.web)) throw new ProspectingError('firecrawl_response_invalid', 502)
    const sources: AiSource[] = []
    const documents: Array<{ url: string; title: string; content: string }> = []
    let remaining = 100_000
    for (const item of payload.data.web.slice(0, 20)) {
      if (!isRecord(item) || remaining <= 0) continue
      const url = publicWebUrl(item.url)
      if (!url || sources.some((source) => source.url === url)) continue
      const title = typeof item.title === 'string' ? item.title.slice(0, 300) : new URL(url).hostname
      const content = [item.description, item.markdown].filter((value): value is string => typeof value === 'string').join('\n').slice(0, Math.min(12_000, remaining))
      if (!content) continue
      remaining -= content.length
      sources.push({ url, title, content })
      documents.push({ url, title, content })
    }
    return { report: JSON.stringify(documents), sources }
  }
}
