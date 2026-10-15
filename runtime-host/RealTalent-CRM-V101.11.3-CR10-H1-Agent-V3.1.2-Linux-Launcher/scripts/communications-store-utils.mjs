const statusRank = status => ({ queued: 0, received: 1, sent: 2, delivered: 3, read: 4 }[String(status || '')] ?? 0)

const bodyQuality = value => {
  const text = String(value || '').trim()
  if (!text) return 0
  if (/^\[Mensagem(?: WhatsApp)?\]$/i.test(text)) return 1
  if (/^\[(?:Mídia|WhatsApp · [^\]]+)\]$/i.test(text)) return 2
  if (/^\[(?:Imagem|Vídeo|Áudio|Documento|Sticker|Contato|Localização|Ligação|Enquete|Resposta interativa|Reação|Mensagem apagada)\]$/i.test(text)) return 3
  return 5
}

const richerBody = (current, incoming) => bodyQuality(incoming) >= bodyQuality(current) ? (incoming || current || '') : (current || incoming || '')

export const eventIdentityKey = event => event?.externalMessageId
  ? `${event.workspaceId || ''}|${event.accountId || ''}|${event.channel || ''}|external:${event.externalMessageId}`
  : `${event?.workspaceId || ''}|id:${event?.id || ''}`

export function mergeCommunicationEvent(current, incoming) {
  if (!current) return incoming
  if (!incoming) return current
  const incomingStatus = String(incoming.status || '')
  const currentStatus = String(current.status || '')
  const status = incomingStatus === 'failed'
    ? 'failed'
    : currentStatus === 'failed' && statusRank(incomingStatus) <= 0
      ? currentStatus
      : statusRank(incomingStatus) >= statusRank(currentStatus)
        ? incomingStatus || currentStatus
        : currentStatus
  const currentAck = Number(current.metadata?.ack)
  const incomingAck = Number(incoming.metadata?.ack)
  const ack = Number.isFinite(currentAck) || Number.isFinite(incomingAck)
    ? Math.max(Number.isFinite(currentAck) ? currentAck : -1, Number.isFinite(incomingAck) ? incomingAck : -1)
    : undefined
  return {
    ...current,
    ...incoming,
    id: current.id || incoming.id,
    leadId: incoming.leadId ?? current.leadId ?? null,
    contactId: incoming.contactId ?? current.contactId ?? null,
    bodyText: richerBody(current.bodyText, incoming.bodyText),
    subject: incoming.subject || current.subject || '',
    threadId: incoming.threadId || current.threadId || null,
    status,
    createdAt: current.createdAt || incoming.createdAt,
    metadata: { ...(current.metadata || {}), ...(incoming.metadata || {}), ...(ack === undefined ? {} : { ack }) },
  }
}

export function mergeEventCollections(preferred = [], fallback = [], limit = 5000) {
  const map = new Map()
  for (const event of fallback || []) map.set(eventIdentityKey(event), event)
  for (const event of preferred || []) {
    const key = eventIdentityKey(event)
    map.set(key, mergeCommunicationEvent(map.get(key), event))
  }
  return [...map.values()]
    .sort((a, b) => Date.parse(b.occurredAt || b.createdAt || 0) - Date.parse(a.occurredAt || a.createdAt || 0))
    .slice(0, limit)
}

export function mergeAccountCollections(preferred = [], fallback = [], limit = 100) {
  const map = new Map((fallback || []).map(account => [account.id, account]))
  for (const account of preferred || []) {
    const current = map.get(account.id)
    if (!current) { map.set(account.id, account); continue }
    const incomingNewer = Date.parse(account.updatedAt || 0) >= Date.parse(current.updatedAt || 0)
    const newer = incomingNewer ? account : current
    const older = incomingNewer ? current : account
    map.set(account.id, { ...older, ...newer, metadata: { ...(older.metadata || {}), ...(newer.metadata || {}) } })
  }
  return [...map.values()]
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
    .slice(0, limit)
}

export function mergeStoreSnapshots(preferred = {}, current = {}) {
  return {
    ...current,
    ...preferred,
    version: 1,
    accounts: mergeAccountCollections(preferred.accounts || [], current.accounts || []),
    events: mergeEventCollections(preferred.events || [], current.events || []),
  }
}
