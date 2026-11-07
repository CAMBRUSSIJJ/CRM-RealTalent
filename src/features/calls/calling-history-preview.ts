/** Compact, display-only history cleanup. Never mutate persisted CRM activities. */
export function callingHistoryPreview(value: string | null | undefined, maxLength = 156): string {
  const source = (value ?? '').trim()
  if (!source) return ''
  // Agenda metadata is generated for integrations, not for the salesperson.
  const withoutMetadata = source.split(/\[CRM_[A-Z_]*META(?:\s*[:=]|\])/i)[0] ?? ''
  const cleaned = withoutMetadata
    .replace(/\btask-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[·•—:;\s]+$/g, '')
    .trim()
  if (!cleaned) return ''
  const friendly = /^Tarefa do CRM$/i.test(cleaned) ? 'Tarefa registrada no CRM' : cleaned
  const limit = Math.max(48, Math.min(400, Math.floor(maxLength) || 156))
  return friendly.length > limit ? friendly.slice(0, limit - 1).trimEnd() + '…' : friendly
}
