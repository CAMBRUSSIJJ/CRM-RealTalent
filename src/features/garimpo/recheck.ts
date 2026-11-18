import type { ProspectRecord } from '../../services/prospecting-workspace'

export interface RecheckObservation {
  field: string
  value: string
  source: string
  url: string
  observed_at: string
  kind: 'register' | 'website'
}
export interface RecheckResult {
  checked_at: string
  company: string
  cnpj: string
  sources: string[]
  observations: RecheckObservation[]
  warnings: string[]
  no_changes_applied: true
}
export type RecheckField =
  | 'phone' | 'email' | 'instagram' | 'address' | 'city' | 'cnpj'
  | 'legal_name' | 'trade_name' | 'main_cnae' | 'status' | 'opened_on'

export const RECHECK_LABELS: Record<RecheckField, string> = {
  phone: 'Telefone', email: 'E-mail', instagram: 'Instagram', address: 'Endereço',
  city: 'Município', cnpj: 'CNPJ', legal_name: 'Razão social',
  trade_name: 'Nome fantasia', main_cnae: 'CNAE principal',
  status: 'Situação cadastral', opened_on: 'Data de abertura',
}
export interface RecheckProposal {
  field: RecheckField
  before: string
  after: string
  source: string
  url: string
  observed_at: string
  kind: 'register' | 'website'
}
export interface RecheckHistoryEntry {
  checkedAt: string
  sources: string[]
  warnings: string[]
  observed: number
  suggested: number
  appliedFields?: RecheckField[]
  resolvedAt?: string
}
export interface RecheckPending {
  checkedAt: string
  proposals: RecheckProposal[]
}

const websiteFields = new Set<RecheckField>(['phone','email','instagram','address','city','cnpj'])
const registerFields = new Set<RecheckField>(['legal_name','trade_name','main_cnae','status','opened_on'])
const values = Object.keys(RECHECK_LABELS) as RecheckField[]
const persisted = (record: ProspectRecord) => record.rawData || {}
const engine = (record: ProspectRecord) => (persisted(record).engine || {}) as Record<string, unknown>
const fieldFromEngine: Record<string,string> = {
  legal_name: 'legalName', trade_name: 'tradeName', main_cnae: 'mainCnae',
  status: 'registrationStatus', opened_on: 'openedOn',
}
const simple = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const normalized = (value: string, field: RecheckField) => {
  if (field === 'phone' || field === 'cnpj') return value.replace(/\D/g,'')
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()
}
export function currentValue(record: ProspectRecord, field: RecheckField): string {
  if (field in fieldFromEngine) return simple(engine(record)[fieldFromEngine[field]])
  return simple(record[field])
}

export function proposeRecheck(record: ProspectRecord, result: RecheckResult): {
  proposals: RecheckProposal[]; ambiguousFields: RecheckField[]
} {
  const grouped = new Map<RecheckField, RecheckObservation[]>()
  for (const obs of result.observations.slice(0,40)) {
    const field = obs.field as RecheckField
    if (!values.includes(field) || typeof obs.value !== 'string' || !obs.value.trim()
      || !['website','register'].includes(obs.kind)) continue
    if (obs.kind === 'website' && !websiteFields.has(field)) continue
    if (obs.kind === 'register' && !registerFields.has(field)) continue
    if (obs.kind === 'website' && !/^https?:\/\//.test(obs.url)) continue
    grouped.set(field, [...(grouped.get(field) || []), obs])
  }
  const proposals: RecheckProposal[] = [], ambiguousFields: RecheckField[] = []
  for (const [field,observations] of grouped) {
    const old = currentValue(record,field)
    const distinct = new Map<string,RecheckObservation>()
    observations.forEach(obs => distinct.set(normalized(obs.value,field),obs))
    const candidates = [...distinct.values()].filter(obs => normalized(obs.value,field) !== normalized(old,field))
    // Multiple conflicting observed values must be resolved manually, not guessed.
    if (distinct.size > 1) { ambiguousFields.push(field); continue }
    const candidate = candidates[0]
    if (!candidate) continue
    proposals.push({ field, before: old, after: candidate.value.trim(), source: candidate.source,
      url: candidate.url, observed_at: candidate.observed_at, kind: candidate.kind })
  }
  return { proposals: proposals.slice(0,15), ambiguousFields }
}

function readHistory(raw: Record<string,unknown>): RecheckHistoryEntry[] {
  return Array.isArray(raw.recheckHistory) ? (raw.recheckHistory as RecheckHistoryEntry[]).slice(-9) : []
}
export function readPending(record: ProspectRecord): RecheckPending | null {
  const data = record.rawData?.recheckPending as RecheckPending | undefined
  return data && typeof data.checkedAt === 'string' && Array.isArray(data.proposals)
    ? { checkedAt: data.checkedAt, proposals: data.proposals.filter(item =>
        item && values.includes(item.field) && typeof item.after === 'string').slice(0,15) } : null
}
export function recheckHistory(record: ProspectRecord): RecheckHistoryEntry[] {
  return readHistory(persisted(record)).slice().reverse()
}
export function stageRecheck(record: ProspectRecord, result: RecheckResult): Partial<ProspectRecord> {
  const {proposals,ambiguousFields} = proposeRecheck(record,result)
  const warnings = [...result.warnings,
    ...ambiguousFields.map(field => `Mais de um valor publicado para ${RECHECK_LABELS[field]}; confira manualmente.`)]
  const entry: RecheckHistoryEntry = {
    checkedAt: result.checked_at, sources: result.sources.slice(0,5), warnings: warnings.slice(0,15),
    observed: result.observations.length, suggested: proposals.length,
  }
  const history = [...readHistory(persisted(record)),entry].slice(-10)
  return { rawData: { ...record.rawData, recheckHistory: history,
    recheckPending: proposals.length ? { checkedAt: result.checked_at, proposals } : null,
    lastRecheckedAt: result.checked_at }, analyzedAt: result.checked_at }
}
export function resolveRecheck(record: ProspectRecord, fields: RecheckField[]): Partial<ProspectRecord> {
  const pending = readPending(record)
  if (!pending) return {}
  const chosen = new Set(fields)
  const patch: Partial<ProspectRecord> = {}
  const nextEngine = {...engine(record)}
  const appliedFields: RecheckField[] = []
  for (const item of pending.proposals) {
    if (!chosen.has(item.field)) continue
    // A manual change made after staging takes precedence over an old suggestion.
    if (currentValue(record,item.field) !== item.before) continue
    if (item.field in fieldFromEngine) nextEngine[fieldFromEngine[item.field]] = item.after
    else if (websiteFields.has(item.field)) Object.assign(patch, { [item.field]:item.after })
    appliedFields.push(item.field)
  }
  const lastHistory = readHistory(persisted(record))
  const history = lastHistory.map(item => item.checkedAt !== pending.checkedAt ? item : {
    ...item, appliedFields, resolvedAt: new Date().toISOString(),
  })
  return { ...patch, rawData: { ...record.rawData, engine: nextEngine,
    recheckHistory: history, recheckPending: null } }
}
