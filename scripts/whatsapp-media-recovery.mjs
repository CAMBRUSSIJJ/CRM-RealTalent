// Safe helpers shared by live WhatsApp events and historical attachment recovery.
// A message placeholder is not a media file; only downloaded bytes produce an attachment.
export function isRecoverableWhatsAppMediaEvent(event, workspaceId) {
  return Boolean(event &&
    event.workspaceId === workspaceId &&
    event.channel === 'whatsapp' &&
    event.metadata?.transport === 'qr' &&
    event.hasAttachments &&
    !event.metadata?.attachment?.url &&
    typeof event.externalMessageId === 'string' && event.externalMessageId.length > 0)
}

export function whatsappMediaKind(type = '', mimeType = '') {
  const kind = String(type || '').toLowerCase()
  if (kind === 'ptt') return 'voice'
  if (kind === 'sticker') return 'sticker'
  if (['image', 'video', 'audio', 'document'].includes(kind)) return kind
  const mime = String(mimeType || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

export function whatsappMediaFilename(media = {}, id = '') {
  const mime = String(media.mimetype || '').split(';')[0].trim().toLowerCase()
  const ext = ({
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm',
    'audio/ogg': '.ogg', 'audio/opus': '.opus', 'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a', 'audio/webm': '.webm', 'application/pdf': '.pdf',
  })[mime] || '.bin'
  const fallback = String(id || 'arquivo').replace(/[^a-zA-Z0-9_-]/g, '-').slice(-56)
  const name = String(media.filename || '').trim()
  return name && /\.[a-z0-9]{1,8}$/i.test(name) ? name : `${name || `whatsapp-${fallback}`}${ext}`
}
