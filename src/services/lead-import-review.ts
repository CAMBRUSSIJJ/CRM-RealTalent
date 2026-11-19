import type { Lead } from '../domain/types'
import { normalizeLeadDocument, normalizeLeadEmail, normalizeLeadPhone } from './lead-intelligence'

/**
 * Revisão antes de importar: separa contatos novos, os que já existem no CRM e os repetidos
 * dentro do próprio arquivo. Duplicado = mesmo CNPJ (14 dígitos), mesmo telefone (10+ dígitos)
 * ou mesmo e-mail. Nome igual sozinho não conta: homônimos são comuns.
 */
export interface LeadImportReviewItem {
  lead: Lead
  row: number
  /** Contato do CRM que corresponde a esta linha. */
  existing: Lead | null
  /** Linha anterior do mesmo arquivo que corresponde a esta. */
  repeatsRow: number | null
  reasons: string[]
}

export interface LeadImportReview {
  items: LeadImportReviewItem[]
  fresh: LeadImportReviewItem[]
  matchesExisting: LeadImportReviewItem[]
  repeatedInFile: LeadImportReviewItem[]
}

type Key = { kind: 'cnpj' | 'phone' | 'email'; value: string }
const reasonLabel: Record<Key['kind'], string> = { cnpj: 'mesmo CNPJ', phone: 'mesmo telefone', email: 'mesmo e-mail' }

const keysOf = (lead: Lead): Key[] => {
  const keys: Key[] = []
  const cnpj = normalizeLeadDocument(lead.cnpj)
  if (cnpj.length === 14) keys.push({ kind: 'cnpj', value: cnpj })
  const phone = normalizeLeadPhone(lead.phone ?? '')
  if (phone.length >= 10) keys.push({ kind: 'phone', value: phone })
  const email = normalizeLeadEmail(lead.email ?? '')
  if (email.includes('@')) keys.push({ kind: 'email', value: email })
  return keys
}
const id = (key: Key) => `${key.kind}:${key.value}`

export function reviewLeadImport(incoming: Lead[], existing: Lead[], rowNumbers: number[] = []): LeadImportReview {
  const existingIndex = new Map<string, Lead>()
  for (const lead of existing) for (const key of keysOf(lead)) if (!existingIndex.has(id(key))) existingIndex.set(id(key), lead)
  const fileIndex = new Map<string, number>()
  const items = incoming.map((lead, position): LeadImportReviewItem => {
    const row = rowNumbers[position] ?? position + 2
    const keys = keysOf(lead)
    const existingHits = keys.filter((key) => existingIndex.has(id(key)))
    if (existingHits.length) {
      const match = existingIndex.get(id(existingHits[0]))!
      const reasons = existingHits.filter((key) => existingIndex.get(id(key)) === match).map((key) => reasonLabel[key.kind])
      return { lead, row, existing: match, repeatsRow: null, reasons }
    }
    const fileHits = keys.filter((key) => fileIndex.has(id(key)))
    if (fileHits.length) {
      const repeatsRow = fileIndex.get(id(fileHits[0]))!
      return { lead, row, existing: null, repeatsRow, reasons: fileHits.filter((key) => fileIndex.get(id(key)) === repeatsRow).map((key) => reasonLabel[key.kind]) }
    }
    for (const key of keys) fileIndex.set(id(key), row)
    return { lead, row, existing: null, repeatsRow: null, reasons: [] }
  })
  return {
    items,
    fresh: items.filter((item) => !item.existing && item.repeatsRow === null),
    matchesExisting: items.filter((item) => item.existing),
    repeatedInFile: items.filter((item) => item.repeatsRow !== null),
  }
}
