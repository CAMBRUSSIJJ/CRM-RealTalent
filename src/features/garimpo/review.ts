import type { Lead } from '../../domain/types'
import { createProspect, type CaptureDraft, type ProspectingState, type ProspectRecord } from '../../services/prospecting-workspace'

const digits = (value: string) => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
const engine = (value: CaptureDraft | ProspectRecord) => ('rawData' in value ? (value as ProspectRecord).rawData.engine : value.engine) as Record<string, unknown> | undefined
const providerId = (value: CaptureDraft | ProspectRecord) => String(engine(value)?.providerId || '')

export function sameBusiness(left: CaptureDraft | ProspectRecord, right: CaptureDraft | ProspectRecord): boolean {
  const a = providerId(left), b = providerId(right)
  if (a && b && a === b) return true
  // Branches sharing a phone are not necessarily the same physical company.
  return normalized(String(left.company || left.name || '')) === normalized(String(right.company || right.name || ''))
    && normalized(String(left.city || '')) === normalized(String(right.city || ''))
    && Boolean(digits(String(left.phone || '')) && digits(String(left.phone || '')) === digits(String(right.phone || '')))
}

export function mergeResults(state: ProspectingState, drafts: CaptureDraft[], workspaceId: string, userId: string | null, leads: Lead[]): ProspectingState {
  const prospects = [...state.prospects]
  for (const draft of drafts) {
    const index = prospects.findIndex(record => sameBusiness(record, draft))
    if (index < 0) {
      prospects.unshift({ ...createProspect(workspaceId, { ...draft, source: 'maps', sourceDetail: 'Google Maps · Motor Python hospedado' }, 'maps', leads, userId), status: 'review' })
      continue
    }
    const original = prospects[index]
    const incoming = createProspect(workspaceId, draft, 'maps', leads, userId)
    const next = { ...original }
    // Enrichment must never undo a manual edit, an approval, a discard, or a CRM receipt.
    for (const field of ['phone','email','website','instagram','address','bookingUrl','description'] as const) {
      if (!next[field] && incoming[field]) next[field] = incoming[field]
    }
    const oldEngine = engine(original) || {}, newEngine = engine(draft) || {}
    const evidence = [...new Map([...(Array.isArray(oldEngine.evidence) ? oldEngine.evidence : []), ...(Array.isArray(newEngine.evidence) ? newEngine.evidence : [])]
      .map(item => [JSON.stringify(item), item])).values()]
    next.rawData = { ...original.rawData, engine: { ...oldEngine, ...newEngine, evidence } }
    if (JSON.stringify(next) !== JSON.stringify(original)) {
      next.updatedAt = new Date().toISOString()
      prospects[index] = next
    }
  }
  return prospects.every((record,index) => record === state.prospects[index]) && prospects.length === state.prospects.length ? state : { ...state, prospects }
}

export function publicUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value))
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function evidenceFor(record: ProspectRecord): Array<{ field: string; value: string; url: string; observed_at: string }> {
  const evidence = engine(record)?.evidence
  return Array.isArray(evidence) ? evidence.filter((item): item is { field: string; value: string; url: string; observed_at: string } =>
    Boolean(item && typeof item === 'object' && typeof item.field === 'string' && typeof item.value === 'string' && publicUrl(item.url))) : []
}
