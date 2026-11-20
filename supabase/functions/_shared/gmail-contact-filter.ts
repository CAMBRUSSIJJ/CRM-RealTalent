// Regras puras (sem Deno nem rede) que decidem quais e-mails do Gmail entram no CRM.
// A caixa de entrada de um vendedor tem e-mails pessoais e de outros assuntos: só entra
// o que foi trocado com um contato que já existe no CRM.

export type LeadEmailIndex = Map<string, string>

export const normalizeEmail = (value: string) => {
  const match = value.match(/<([^>]+)>/)
  return (match?.[1] || value).trim().toLowerCase()
}

export const parseAddressList = (value: string) => value
  .split(',')
  .map(normalizeEmail)
  .filter((item) => item.includes('@'))

export function buildLeadEmailIndex(rows: Array<{ id: string; email: string | null }>): LeadEmailIndex {
  const index: LeadEmailIndex = new Map()
  for (const row of rows) {
    const email = normalizeEmail(String(row.email || ''))
    if (email.includes('@') && !index.has(email)) index.set(email, row.id)
  }
  return index
}

export interface GmailHeaders { from: string; to: string[]; cc: string[] }

// Decide a direção pela conta conectada e acha o contato do outro lado da conversa.
export function matchLeadForMessage(headers: GmailHeaders, ownAddress: string, index: LeadEmailIndex) {
  const own = normalizeEmail(ownAddress)
  const from = normalizeEmail(headers.from)
  const outbound = Boolean(own) && from === own
  const counterparts = outbound ? [...headers.to, ...headers.cc] : [from]
  for (const address of counterparts) {
    const leadId = index.get(normalizeEmail(address))
    if (leadId) return { direction: outbound ? 'outbound' as const : 'inbound' as const, leadId, counterpart: normalizeEmail(address) }
  }
  return null
}

// Busca no Gmail só as conversas com contatos do CRM, em lotes para respeitar o limite da consulta.
export function buildContactSearchQueries(emails: string[], days = 90, chunkSize = 25) {
  const unique = [...new Set(emails.map(normalizeEmail).filter((item) => /^[^\s"()<>]+@[^\s"()<>]+$/.test(item)))]
  const queries: string[] = []
  for (let start = 0; start < unique.length; start += chunkSize) {
    // No Gmail, termos entre chaves são combinados com OU.
    const terms = unique.slice(start, start + chunkSize).map((email) => `from:${email} to:${email} cc:${email}`)
    queries.push(`newer_than:${days}d {${terms.join(' ')}}`)
  }
  return queries
}

// Caixa recente: o que entra na Comunicação mesmo antes de virar contato.
// Promoções, social, atualizações automáticas, fóruns, spam, lixeira, rascunhos e chat ficam de fora.
export const RECENT_INBOX_DAYS = 30
export const RECENT_INBOX_QUERY = `newer_than:${RECENT_INBOX_DAYS}d -in:spam -in:trash -in:drafts -in:chats -category:promotions -category:social -category:updates -category:forums`
const EXCLUDED_LABELS = new Set(['SPAM', 'TRASH', 'DRAFT', 'CHAT', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'])

export function isWorkMailLabelSet(labelIds: unknown): boolean {
  const labels = Array.isArray(labelIds) ? labelIds.map(String) : []
  return !labels.some((label) => EXCLUDED_LABELS.has(label))
}

// Remetentes automáticos não viram conversa de venda.
export function isAutomatedAddress(address: string): boolean {
  const local = normalizeEmail(address).split('@')[0] || ''
  return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|bounce[s]?)([+._-].*)?$/.test(local)
}

export function senderDisplayName(fromHeader: string): string {
  const match = fromHeader.match(/^\s*"?([^"<]+?)"?\s*</)
  return (match?.[1] || '').trim()
}

// Quem está do outro lado: remetente se recebido; primeiro destinatário se enviado pela conta conectada.
export function counterpartOf(headers: GmailHeaders, ownAddress: string): { direction: 'inbound' | 'outbound'; address: string } {
  const own = normalizeEmail(ownAddress)
  const from = normalizeEmail(headers.from)
  const outbound = Boolean(own) && from === own
  if (!outbound) return { direction: 'inbound', address: from }
  const other = [...headers.to, ...headers.cc].map(normalizeEmail).find((item) => item && item !== own) || ''
  return { direction: 'outbound', address: other }
}
