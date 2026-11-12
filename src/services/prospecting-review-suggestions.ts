import type { CrossSourceReview, CrossSourceStatus } from './prospecting-cross-source-review'

export const editableReviewFields = [
  'phone', 'email', 'address', 'website', 'instagram', 'bookingUrl', 'cnpj',
] as const

export type EditableReviewField = typeof editableReviewFields[number]

export interface ReviewSuggestion {
  key: string
  field: EditableReviewField
  label: string
  currentValue: string
  suggestedValue: string
  sourceUrls: string[]
  independentPublishers: number
  evidenceStatus: Exclude<CrossSourceStatus, 'pending'>
  kind: 'conflict' | 'new'
}

function comparable(field: EditableReviewField, value: string): string {
  const raw = String(value || '').trim()
  if (field === 'phone' || field === 'cnpj') return raw.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (field === 'instagram') {
    return raw.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
      .replace(/^@/, '').split(/[/?#]/)[0].toLowerCase()
  }
  if (field === 'website' || field === 'bookingUrl') {
    try {
      const url = new URL(raw)
      return (url.hostname + url.pathname).replace(/\/$/, '').toLowerCase()
    } catch { /* user-supplied URL can be incomplete */ }
  }
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').toLowerCase()
}

/** Decisions come exclusively from URLs backing an identity-matched company.
 * These are review suggestions, not automatically approved CRM updates.
 */
export function buildReviewSuggestions(review: CrossSourceReview | null): ReviewSuggestion[] {
  if (!review?.matched) return []
  const suggestions: ReviewSuggestion[] = []
  for (const item of review.fields) {
    if (item.status === 'pending' ||
      !editableReviewFields.includes(item.field as EditableReviewField)) continue
    const field = item.field as EditableReviewField
    for (const candidate of item.candidates) {
      if (!candidate.value.trim() || !candidate.urls.length ||
        !candidate.urls.some((url) => {
          try {
            const u = new URL(url)
            return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
          } catch { return false }
        })) continue
      if (item.currentValue && comparable(field, item.currentValue) === comparable(field, candidate.value)) continue
      suggestions.push({
        key: field + ':' + comparable(field, candidate.value),
        field,
        label: item.label,
        currentValue: item.currentValue,
        suggestedValue: candidate.value,
        sourceUrls: candidate.urls,
        independentPublishers: candidate.independentPublishers,
        evidenceStatus: item.status,
        kind: item.currentValue ? 'conflict' : 'new',
      })
    }
  }
  const priority = (item: ReviewSuggestion) =>
    item.kind === 'conflict' ? 0 : item.evidenceStatus === 'confirmed' ? 1 : 2
  return suggestions.sort((a, b) => priority(a) - priority(b) || a.label.localeCompare(b.label, 'pt-BR'))
}
