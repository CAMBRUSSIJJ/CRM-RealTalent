// Garimpo Essencial: bounded, deterministic discovery. No model or paid API.
// Every accepted company is backed by a named public search result from Firecrawl/SearXNG.
// This is a conservative first-pass discovery; final approval remains human.
import { sanitizeAiResult, publicWebUrl } from '../../supabase/functions/_shared/prospecting-ai.ts'

const trim = (value, max = 150) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
const fold = (value) => trim(value, 2000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim()
const blockedTitle = /^(?:\d+\s+(?:melhores?|principais?)|(?:os?\s+)?melhores?|lista\b|guia\b|diret[oó]rio\b|resultado(?:s)?\b|empresas?\s+(?:de|em)\b|encontre\b|pesquisa\b|busca\b|p[aá]gina\b|cat[aá]logo\s+de\b)/i
const categoryHeading = /^(?:barbearias?|sal[oõ]es?|cl[ií]nicas?|lojas?|restaurantes?|academias?|escolas?|empresas?|servi[çc]os?)\s+(?:em|na|no|de|da|do)\b/i
const listingHosts = /(?:^|\.)(?:google\.[a-z.]+|bing\.com|duckduckgo\.com|yelp\.[a-z.]+|guiamais\.com\.br|telelistas\.net|apontador\.com\.br|solutudo\.com\.br)$/

export function essentialDiscovery(input, sources, report = '') {
  const targetCity = fold(String(input.city || '').split(',')[0])
  const category = fold(input.segment)
  const singular = category.replace(/(?:ias|es|s)$/, '')
  const candidates = []
  const verifiedSources = []
  const limit = Math.max(1, Math.min(10, Number(input.limit) || 5))
  const seen = new Set()

  for (const item of Array.isArray(sources) ? sources.slice(0, 30) : []) {
    const url = publicWebUrl(item?.url)
    if (!url) continue
    const title = trim(item.title, 200)
    const original = trim(item.content, 8000)
    const contents = [title, original].filter(Boolean).join('\n')
    const normalized = fold(contents + ' ' + url)
    if (!title || !original || !targetCity || !normalized.includes(targetCity)) continue
    if (category && !normalized.includes(category) && !normalized.includes(singular)) continue
    const hostname = new URL(url).hostname.toLowerCase()
    if (listingHosts.test(hostname) && blockedTitle.test(title)) continue
    const company = trim(title.split(/\s+[|–—]\s+|\s+-\s+|\s+·\s+/)[0], 90)
      .replace(/\s+(?:em|na cidade de)\s+.+$/i, '').trim()
    if (company.length < 5 || company.length > 90 || blockedTitle.test(company) ||
        categoryHeading.test(company) || fold(company) === category || fold(company) === targetCity ||
        /^(?:https?:|www\.|instagram|facebook|google maps|in[ií]cio|home\b)/i.test(company)) continue
    // Reject a generic business category result as a company, even if the city
    // and sector appear in its snippet. Do not infer CNPJ or individual contacts.
    const identity = fold(company)
    if (seen.has(identity)) continue
    const facts = [{ field: 'company', value: company, sourceUrl: url }]
    if (fold(contents).includes(targetCity)) facts.push({ field: 'city', value: String(input.city).split(',')[0].trim(), sourceUrl: url })
    // Contacts are accepted only when the literal appears in this same source.
    const emails = [...original.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)]
    if (emails.length === 1) facts.push({ field: 'email', value: emails[0][0], sourceUrl: url })
    const phones = [...original.matchAll(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}\b/g)]
    if (phones.length === 1) facts.push({ field: 'phone', value: phones[0][0], sourceUrl: url })
    candidates.push({ facts, opportunity: '', suggestedApproach: '', signals: [] })
    verifiedSources.push({ url, title, content: contents })
    seen.add(identity)
    if (candidates.length >= limit) break
  }
  const result = sanitizeAiResult({ leads: candidates }, verifiedSources, report || JSON.stringify(verifiedSources), limit)
  return {
    ...result,
    researchMode: 'essential',
    warnings: [
      ...result.warnings,
      'Modo Essencial: identificação preliminar por fontes públicas, sem IA. Confirme cada empresa, contato e território antes de transferir ao CRM.',
    ],
  }
}
