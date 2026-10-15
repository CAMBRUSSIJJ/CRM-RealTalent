export const cleanNumber = value => String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '')
export const isPhoneCandidate = value => { const digits = cleanNumber(value); return digits.length >= 8 && digits.length <= 15 ? digits : '' }
export const isLidAddress = value => /@lid$/.test(String(value || ''))
export const isDirectPhoneAddress = value => /@c\.us$/.test(String(value || ''))

const lowValueBodies = new Set(['[Mensagem WhatsApp]','[Mensagem]','[Mídia]'])
const technicalTypes = new Set([
  'e2e_notification', 'notification_template', 'protocol', 'ciphertext',
  'history_sync_notification', 'notification', 'gp2', 'groups_v4_invite',
])

export const isWhatsAppTechnicalMessage = message => {
  const type = String(message?.type || message?._data?.type || '').trim().toLowerCase()
  if (technicalTypes.has(type)) return true
  const subtype = String(message?._data?.subtype || '').trim().toLowerCase()
  return technicalTypes.has(subtype)
}

export const looksLikeEncodedMediaText = value => {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^data:[^;]{1,120};base64,/i.test(text)) return true
  // Base64 de mídia costuma ser longo, sem espaços e formado quase só por este alfabeto.
  if (text.length >= 512 && !/\s/.test(text.slice(0, 512)) && /^[A-Za-z0-9+/=_-]+$/.test(text.slice(0, Math.min(text.length, 4096)))) return true
  return false
}

export const mapWhatsAppAckStatus = ack => {
  const value = Number(ack)
  if (!Number.isFinite(value)) return 'sent'
  if (value < 0) return 'failed'
  if (value === 0) return 'queued'
  if (value === 1) return 'sent'
  if (value === 2) return 'delivered'
  return 'read'
}

export const whatsappMessageBody = message => {
  if (isWhatsAppTechnicalMessage(message)) return ''
  const candidates = [
    message?.body,
    message?._data?.body,
    message?._data?.caption,
    message?._data?.content,
    message?._data?.selectedDisplayText,
    message?._data?.selectedButtonId,
    message?._data?.selectedRowId,
    message?._data?.pollName,
    message?._data?.reactionText,
  ].map(value => String(value || '').trim()).filter(Boolean).filter(value => !looksLikeEncodedMediaText(value))
  const rich = candidates.find(value => !lowValueBodies.has(value)) || candidates[0] || ''
  if (rich) return rich
  const type = String(message?.type || message?._data?.type || '').toLowerCase()
  if (message?.location?.latitude || message?._data?.lat) return '[Localização]'
  if (Array.isArray(message?.vCards) && message.vCards.length) return '[Contato]'
  if (message?.hasMedia) {
    if (type === 'image') return '[Imagem]'
    if (type === 'video') return '[Vídeo]'
    if (type === 'audio' || type === 'ptt') return '[Áudio]'
    if (type === 'document') return '[Documento]'
    if (type === 'sticker') return '[Sticker]'
    return '[Mídia]'
  }
  if (type === 'revoked') return '[Mensagem apagada]'
  if (type === 'location') return '[Localização]'
  if (type === 'vcard' || type === 'multi_vcard') return '[Contato]'
  if (type === 'call_log') return '[Ligação]'
  if (type === 'poll_creation') return '[Enquete]'
  if (type === 'buttons_response' || type === 'list_response' || type === 'interactive') return '[Resposta interativa]'
  if (type === 'reaction') return '[Reação]'
  return type ? `[WhatsApp · ${type}]` : '[Mensagem WhatsApp]'
}
