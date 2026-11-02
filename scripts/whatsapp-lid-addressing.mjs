/**
 * Resolve WhatsApp phone-number WIDs to the server-confirmed user identity.
 * WhatsApp Web increasingly routes migrated contacts by <lid>@lid instead of
 * <phone>@c.us. Never infer a LID from the length of a phone number.
 *
 * This helper does NOT send or retry a message: a failed send may have gone
 * out already, so an address change must be done BEFORE the first send.
 */
export const recognizedWhatsAppSendAddress = value => {
  const raw = typeof value === 'string' ? value
    : value?._serialized || value?.$1 || value?.id?._serialized || ''
  return typeof raw === 'string' && /^\d+@(c\.us|lid)$/.test(raw) ? raw : null
}

export async function resolveWhatsAppSendAddress(client, chatId, { cache } = {}) {
  if (!/^\d+@c\.us$/.test(chatId)) return { chatId, resolution: 'unchanged' }
  const cached = cache?.get(chatId)
  if (cached && /^\d+@(c\.us|lid)$/.test(cached)) return { chatId: cached, resolution: 'cached' }

  let resolved = chatId
  // getNumberId is the documented WhatsApp query for a phone number; on
  // LID-migrated contacts it can return the actual @lid to address.
  try {
    if (typeof client.getNumberId === 'function') {
      const wid = await client.getNumberId(chatId)
      const confirmed = recognizedWhatsAppSendAddress(wid)
      if (confirmed) resolved = confirmed
    }
  } catch {
    // Temporary lookup failure is not permission to invent an identity.
    // The normal send path can still work for older, non-migrated contacts.
  }

  // On some WebJS builds the existence query yields @c.us even though the
  // user has a known @lid. Accept a mapping only if its phone-number side
  // matches this exact recipient. Never select an arbitrary contact's LID.
  if (resolved === chatId && typeof client.getContactLidAndPhone === 'function') {
    try {
      const pairs = await client.getContactLidAndPhone([chatId])
      const match = Array.isArray(pairs) ? pairs.find(pair =>
        recognizedWhatsAppSendAddress(pair?.pn) === chatId &&
        /^\d+@lid$/.test(recognizedWhatsAppSendAddress(pair?.lid) || '')
      ) : null
      const lid = recognizedWhatsAppSendAddress(match?.lid)
      if (lid) resolved = lid
    } catch {
      // Missing LID mapping remains an ordinary @c.us request, not a guessed LID.
    }
  }
  if (resolved !== chatId && cache) {
    if (cache.size >= 500) cache.clear()
    cache.set(chatId, resolved)
  }
  return { chatId: resolved, resolution: resolved !== chatId ? 'lid_or_server_id' : 'phone_fallback' }
}
