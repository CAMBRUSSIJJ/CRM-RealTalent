import fs from 'node:fs'
import path from 'node:path'
import { cleanNumber, isDirectPhoneAddress, isLidAddress, isPhoneCandidate, isWhatsAppTechnicalMessage, mapWhatsAppAckStatus, whatsappMessageBody } from './whatsapp-sync-utils.mjs'
import { applyWhatsAppWebMediaHotfix } from './whatsapp-web-media-hotfix.mjs'
import { importCommunicationsPackage } from './communications-runtime-deps.mjs'
// Historical H8 media markers preserved after parser extraction: '[Imagem]' '[Áudio]' '[Documento]'


let qrCodeModule = null
async function loadQRCode() {
  if (qrCodeModule) return qrCodeModule
  try {
    const mod = await importCommunicationsPackage('qrcode')
    qrCodeModule = mod.default || mod
    if (!qrCodeModule?.toDataURL) throw new Error('toDataURL indisponível no pacote qrcode.')
    return qrCodeModule
  } catch (error) {
    throw new Error(`Renderizador QR não está instalado. Reinicie pelo ./start-linux.sh. ${error instanceof Error ? error.message : String(error)}`)
  }
}

const sessions = new Map()
const safeId = value => String(value || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
const serializedId = value => String(value?._serialized || value?.$1 || value?.id || value || '')
const isIgnoredThread = value => /(?:status@broadcast|@(?:status|newsletter|broadcast))$/.test(String(value || ''))

function findBrowserExecutable() {
  const candidates = [
    process.env.REALTALENT_WHATSAPP_BROWSER,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  return candidates.find(candidate => {
    try { return fs.existsSync(candidate) } catch { return false }
  }) || null
}

async function loadWebJs() {
  let mediaHotfix = { ok: false, state: 'not-checked', target: '' }
  try { mediaHotfix = applyWhatsAppWebMediaHotfix() } catch (error) { console.warn(`[WhatsApp QR] Hotfix de mídia não aplicado: ${error instanceof Error ? error.message : String(error)}`) }
  try {
    const mod = await importCommunicationsPackage('whatsapp-web.js')
    const source = mod.default && typeof mod.default === 'object' ? mod.default : mod
    const Client = mod.Client || source.Client
    const LocalAuth = mod.LocalAuth || source.LocalAuth
    const MessageMedia = mod.MessageMedia || source.MessageMedia
    if (!Client || !LocalAuth || !MessageMedia) throw new Error('Client/LocalAuth/MessageMedia indisponíveis no pacote whatsapp-web.js.')
    return { Client, LocalAuth, MessageMedia, mediaHotfix }
  } catch (error) {
    throw new Error(`Motor WhatsApp Web não está instalado. Reinicie pelo ./start-linux.sh. ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function createWhatsAppBrowserQrBridge({ root, now, uuid, store, saveStore, upsertAccount, pushEvent, makeEvent, persistMedia }) {
  const authRoot = path.join(root, '.realtalent-whatsapp-browser')
  fs.mkdirSync(authRoot, { recursive: true, mode: 0o700 })

  const get = workspaceId => sessions.get(String(workspaceId)) || null

  const updateQrAccount = (workspaceId, patch) => {
    const s = store()
    const account = (s.accounts || []).find(a => a.workspaceId === workspaceId && a.provider === 'whatsapp_cloud' && a.metadata?.transport === 'qr')
    if (!account) return null
    const metadata = patch?.metadata ? { ...(account.metadata || {}), ...(patch.metadata || {}) } : account.metadata
    Object.assign(account, patch, { metadata, updatedAt: now() })
    saveStore(s)
    return account
  }

  const rememberAsyncError = (session, label, error) => {
    const message = `${label}: ${error instanceof Error ? error.message : String(error)}`
    console.warn(`[WhatsApp QR] ${message}`)
    if (session) {
      session.lastError = message
      session.updatedAt = now()
    }
    try { updateQrAccount(session?.workspaceId || '', { lastError: message }) } catch {}
  }

  const status = workspaceId => {
    const s = get(workspaceId)
    return s ? {
      state: s.state,
      qrDataUrl: s.qrDataUrl || null,
      phone: s.phone || '',
      displayName: s.displayName || 'WhatsApp QR Local',
      lastError: s.lastError || null,
      updatedAt: s.updatedAt,
      engine: 'whatsapp-web-js',
      lastHistorySyncAt: s.lastHistorySyncAt || null,
      lastHistoryImportCount: Number(s.lastHistoryImportCount || 0),
      syncingHistory: Boolean(s.syncPromise),
      mediaHotfix: s.mediaHotfix || null,
    } : {
      state: 'idle', qrDataUrl: null, phone: '', displayName: 'WhatsApp QR Local', lastError: null,
      updatedAt: now(), engine: 'whatsapp-web-js', lastHistorySyncAt: null, lastHistoryImportCount: 0, syncingHistory: false, mediaHotfix: null,
    }
  }

  async function destroySession(session, { logout = false } = {}) {
    if (!session?.client) return
    session.manualDisconnect = Boolean(logout)
    if (session.reconnectTimer) { clearTimeout(session.reconnectTimer); session.reconnectTimer = null }
    if (logout) {
      try { await session.client.logout() } catch {}
    }
    try { await session.client.destroy() } catch {}
  }

  function scheduleReconnect(session, reason = 'desconexão') {
    if (!session || session.manualDisconnect || session.reconnectTimer) return
    session.state = 'starting'
    session.reconnectAttempts = Number(session.reconnectAttempts || 0) + 1
    const delay = Math.min(12_000, 1_500 * session.reconnectAttempts)
    session.lastError = `WhatsApp Web reconectando após ${reason}. Tentativa ${session.reconnectAttempts}.`
    session.updatedAt = now()
    try { updateQrAccount(session.workspaceId, { status: 'attention', lastError: session.lastError, metadata: { liveState: 'starting' } }) } catch {}
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null
      start(session.workspaceId, session.displayName).catch(error => rememberAsyncError(session, 'Falha ao reconectar WhatsApp Web', error))
    }, delay)
  }

  const qrAccount = (snapshot, workspaceId) => (snapshot.accounts || []).find(a => a.workspaceId === workspaceId && a.provider === 'whatsapp_cloud' && a.metadata?.transport === 'qr' && a.status !== 'revoked') || null

  async function resolveChatIdentity(chat, message, session) {
    const threadId = serializedId(chat?.id) || String(message?.fromMe ? message?.to : message?.from || '')
    const isGroup = Boolean(chat?.isGroup || /@g\.us$/.test(threadId))
    let contact = null
    if (!isGroup && chat && typeof chat.getContact === 'function') {
      try { contact = await chat.getContact() } catch {}
    }

    const rawFrom = String(message?.from || '')
    const rawTo = String(message?.to || '')
    const rawContactId = serializedId(contact?.id)
    const rawCandidates = [threadId, rawContactId, rawFrom, rawTo].filter(Boolean)
    const from = isDirectPhoneAddress(rawFrom) ? isPhoneCandidate(rawFrom) : ''
    const to = isDirectPhoneAddress(rawTo) ? isPhoneCandidate(rawTo) : ''
    const contactNumber = isPhoneCandidate(contact?.number || (isDirectPhoneAddress(rawContactId) ? rawContactId : ''))

    let mappedPhone = ''
    const lidCandidates = [...new Set(rawCandidates.filter(isLidAddress))]
    if (!isGroup && lidCandidates.length && typeof session.client?.getContactLidAndPhone === 'function') {
      try {
        const mappings = await session.client.getContactLidAndPhone(lidCandidates)
        mappedPhone = (Array.isArray(mappings) ? mappings : [])
          .map(item => isPhoneCandidate(item?.pn || ''))
          .find(Boolean) || ''
      } catch (error) {
        // WhatsApp Web may not have a PN mapping for every historical LID. Keep the
        // thread stable and continue; a later sync can enrich the event when available.
        session.lastLidWarning = error instanceof Error ? error.message : String(error)
      }
    }

    const fallbackPeer = message?.fromMe ? to : from
    const threadPeer = isDirectPhoneAddress(threadId) ? isPhoneCandidate(threadId) : ''
    const peer = isGroup ? (threadPeer || fallbackPeer) : (mappedPhone || contactNumber || fallbackPeer || threadPeer)
    const displayPhone = peer ? `+${peer}` : ''
    const chatName = String(
      chat?.name || chat?.formattedTitle || contact?.pushname || contact?.name || contact?.shortName || message?._data?.notifyName || displayPhone || 'WhatsApp'
    ).trim()
    return {
      threadId,
      peer,
      chatName,
      isGroup,
      own: isPhoneCandidate(session.phone),
      from: from || (message?.fromMe ? isPhoneCandidate(session.phone) : ''),
      to: to || (!message?.fromMe ? isPhoneCandidate(session.phone) : ''),
      unresolvedLid: !isGroup && !peer && lidCandidates.length > 0,
      lidCandidates,
    }
  }

  function ingestMessage(snapshot, account, session, message, chat = null, source = 'live', identity = null, enrichment = {}) {
    if (!message || isWhatsAppTechnicalMessage(message)) return false
    const externalMessageId = serializedId(message.id)
    if (!externalMessageId) return false
    const resolved = identity || {
      threadId: serializedId(chat?.id) || String(message.fromMe ? message.to : message.from || ''),
      from: isDirectPhoneAddress(message.from) ? isPhoneCandidate(message.from) : '',
      to: isDirectPhoneAddress(message.to) ? isPhoneCandidate(message.to) : '',
      own: isPhoneCandidate(session.phone),
      peer: message.fromMe ? (isDirectPhoneAddress(message.to) ? isPhoneCandidate(message.to) : '') : (isDirectPhoneAddress(message.from) ? isPhoneCandidate(message.from) : ''),
      chatName: String(chat?.name || chat?.formattedTitle || message?._data?.notifyName || 'WhatsApp').trim(),
      isGroup: Boolean(chat?.isGroup),
      unresolvedLid: isLidAddress(serializedId(chat?.id) || String(message.fromMe ? message.to : message.from || '')),
      lidCandidates: [],
    }
    if (!resolved.threadId || isIgnoredThread(resolved.threadId)) return false
    const bodyText = whatsappMessageBody(message)
    if (!bodyText) return false
    if (!resolved.peer && !resolved.isGroup && !resolved.unresolvedLid) return false

    const direction = message.fromMe ? 'outbound' : 'inbound'
    const historical = source === 'history_sync' || source === 'initial_history_sync'
    const event = makeEvent({
      workspaceId: session.workspaceId,
      accountId: account.id,
      channel: 'whatsapp',
      direction,
      status: message.fromMe ? mapWhatsAppAckStatus(message.ack) : 'received',
      externalMessageId,
      threadId: resolved.threadId,
      senderAddress: message.fromMe ? (resolved.own || resolved.from) : resolved.from,
      recipientAddresses: [message.fromMe ? resolved.to : (resolved.own || resolved.to)].filter(Boolean),
      bodyText,
      replyToExternalMessageId: enrichment.replyToExternalMessageId || null,
      hasAttachments: Boolean(message.hasMedia || enrichment.mediaRef),
      metadata: {
        provider: 'whatsapp_qr', transport: 'qr', qrEngine: 'whatsapp-web-js', unofficial: true,
        historySource: source, peerAddress: resolved.peer || '', chatName: resolved.chatName, isGroup: resolved.isGroup,
        unresolvedLid: Boolean(resolved.unresolvedLid), lidAddress: resolved.unresolvedLid ? resolved.threadId : null,
        messageType: String(message.type || ''), ack: Number.isFinite(Number(message.ack)) ? Number(message.ack) : null,
        ...(enrichment.mediaRef ? { attachment: enrichment.mediaRef } : {}),
        ...(enrichment.replyPreview ? { replyPreview: enrichment.replyPreview } : {}),
        ...(enrichment.idempotencyKey ? { idempotencyKey: enrichment.idempotencyKey } : {}),
        ...(historical && direction === 'inbound' ? { crmReadAt: now(), importedHistory: true } : {}),
      },
    })
    if (message.timestamp) event.occurredAt = new Date(Number(message.timestamp) * 1000).toISOString()
    return pushEvent(snapshot, event)
  }

  async function waitForConnected(workspaceId, waitMs = 15_000) {
    const deadline = Date.now() + Math.max(1_000, Number(waitMs || 15_000))
    let session = get(workspaceId)
    while (Date.now() < deadline) {
      session = get(workspaceId)
      if (session?.client && session.state === 'connected') return session
      if (session?.state === 'qr') throw new Error('A sessão WhatsApp QR precisa ser autenticada novamente. Abra Configurações → WhatsApp e escaneie um novo QR.')
      if (session?.manualDisconnect) throw new Error('A sessão WhatsApp QR foi desconectada manualmente.')
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    throw new Error(`WhatsApp QR não ficou pronto para sincronizar em ${Math.round(waitMs/1000)}s. Estado atual: ${session?.state || 'sem sessão'}.`)
  }

  async function ensureConnected(workspaceId) {
    workspaceId = String(workspaceId || 'default')
    let session = get(workspaceId)
    if (!session) {
      const snapshot = store()
      const account = (snapshot.accounts || []).find(a => a.workspaceId === workspaceId && a.provider === 'whatsapp_cloud' && a.metadata?.transport === 'qr' && a.status !== 'revoked')
      if (account) {
        await start(workspaceId, account.displayName || 'WhatsApp QR Local')
        session = get(workspaceId)
      }
    }
    if (session?.state === 'connected' && session.client) return session
    if (session?.state === 'disconnected' && !session.manualDisconnect && !session.reconnectTimer) {
      scheduleReconnect(session, 'sync solicitado com sessão desconectada')
    }
    return waitForConnected(workspaceId, 15_000)
  }

  async function fetchRawStoreChats(session, messageLimit = 80) {
    if (!session?.client?.pupPage) throw new Error('Página do WhatsApp Web indisponível para leitura direta.')
    return session.client.pupPage.evaluate(({ messageLimit }) => {
      const normalizeId = value => {
        if (!value) return ''
        if (typeof value === 'string') return value
        if (value._serialized) return String(value._serialized)
        if (value.$1) return String(value.$1)
        if (value.user && value.server) return `${value.user}@${value.server}`
        try { return String(value) } catch { return '' }
      }
      const asArray = collection => {
        if (!collection) return []
        try { if (typeof collection.getModelsArray === 'function') return collection.getModelsArray() || [] } catch {}
        if (Array.isArray(collection.models)) return collection.models
        if (Array.isArray(collection._models)) return collection._models
        return []
      }
      const collections = typeof window.require === 'function' ? window.require('WAWebCollections') : null
      const chatCollection = collections?.Chat
      if (!chatCollection) throw new Error('WAWebCollections.Chat indisponível no WhatsApp Web atual.')
      const chats = asArray(chatCollection)
      return chats.map(chat => {
        const id = normalizeId(chat?.id)
        const rawMessages = asArray(chat?.msgs).slice(-Math.max(1, Number(messageLimit || 80)))
        const messages = rawMessages.map(message => {
          const idObj = message?.id || {}
          const remote = normalizeId(idObj?.remote || message?.chatId || '')
          const fromMe = Boolean(idObj?.fromMe ?? message?.fromMe)
          const body = String(message?.body || message?.caption || message?.text || message?.content || '').trim()
          return {
            id: normalizeId(idObj),
            fromMe,
            from: normalizeId(message?.from || (!fromMe ? remote : '')),
            to: normalizeId(message?.to || (fromMe ? remote : '')),
            body,
            type: String(message?.type || ''),
            timestamp: Number(message?.t || message?.timestamp || 0),
            ack: Number(message?.ack ?? 0),
            hasMedia: Boolean(message?.isMedia || message?.hasMedia || ['image','video','audio','ptt','document','sticker'].includes(String(message?.type || '').toLowerCase())),
            _data: {
              body,
              caption: String(message?.caption || ''),
              type: String(message?.type || ''),
              notifyName: String(message?.notifyName || message?.senderObj?.pushname || ''),
            },
          }
        }).filter(message => message.id)
        return {
          __rawStore: true,
          id,
          name: String(chat?.formattedTitle || chat?.name || chat?.contact?.pushname || chat?.contact?.name || '').trim(),
          formattedTitle: String(chat?.formattedTitle || ''),
          isGroup: Boolean(chat?.isGroup || /@g\.us$/.test(id)),
          timestamp: Number(chat?.t || chat?.timestamp || chat?.lastReceivedKey?.t || 0),
          unreadCount: Number(chat?.unreadCount || 0),
          messages,
        }
      }).filter(chat => chat.id)
    }, { messageLimit })
  }

  async function fetchChatsWithRetry(session, messageLimit = 80) {
    // H13: current whatsapp-web.js releases can report READY while client.getChats()
    // crashes inside Puppeteer (r: r) or returns an empty list. Read the minimal
    // chat/message models directly from WAWebCollections first, avoiding fragile
    // WWebJS.getChats()/Chat.serialize() paths.
    let rawError = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const rawChats = await fetchRawStoreChats(session, messageLimit)
        if (Array.isArray(rawChats) && rawChats.length) return { mode: 'wa-store-direct', chats: rawChats }
        rawError = new Error('A store do WhatsApp Web respondeu sem chats materializados.')
      } catch (error) { rawError = error }
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 900 * attempt))
    }

    let apiError = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const chats = await session.client.getChats()
        if (Array.isArray(chats) && chats.length) return { mode: 'wwebjs-getChats', chats }
        apiError = new Error('client.getChats() respondeu sem chats.')
      } catch (error) { apiError = error }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1200))
    }
    throw new Error(`WhatsApp Web conectado, mas nenhum leitor conseguiu materializar os chats. Store direta: ${rawError instanceof Error ? rawError.message : String(rawError)} · getChats: ${apiError instanceof Error ? apiError.message : String(apiError)}`)
  }

  async function performSyncHistory(workspaceId, options = {}, providedSnapshot = null) {
    const session = await ensureConnected(workspaceId)
    const snapshot = providedSnapshot || store()
    const account = qrAccount(snapshot, workspaceId)
    if (!account) throw new Error('Conta QR conectada não encontrada no gateway local.')

    const chatLimit = Math.max(1, Math.min(120, Number(options.chatLimit || process.env.REALTALENT_WHATSAPP_SYNC_CHAT_LIMIT || 60)))
    const messageLimit = Math.max(1, Math.min(150, Number(options.messageLimit || process.env.REALTALENT_WHATSAPP_SYNC_MESSAGE_LIMIT || 80)))
    const includeGroups = options.includeGroups === true
    const incremental = Boolean(options.incremental)
    const lastSyncMs = incremental && session.lastHistorySyncAt ? Date.parse(session.lastHistorySyncAt) : 0
    const graceMs = 5 * 60_000
    const chatResult = await fetchChatsWithRetry(session, messageLimit)
    const historyEngine = chatResult.mode
    const chats = chatResult.chats
    const candidates = (Array.isArray(chats) ? chats : [])
      .filter(chat => {
        const id = serializedId(chat?.id)
        if (!id || isIgnoredThread(id)) return false
        if (!includeGroups && chat?.isGroup) return false
        if (lastSyncMs > 0) {
          const chatMs = Number(chat?.timestamp || 0) * 1000
          if (chatMs > 0 && chatMs < lastSyncMs - graceMs) return false
        }
        return true
      })
      .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0))
      .slice(0, chatLimit)

    let imported = 0
    let messagesScanned = 0
    let messagesFailed = 0
    let chatsScanned = 0
    let failedChats = 0
    let unresolvedLids = 0
    const failures = []
    for (const chat of candidates) {
      let messages = []
      try {
        messages = chat?.__rawStore ? (Array.isArray(chat.messages) ? chat.messages : []) : await chat.fetchMessages({ limit: messageLimit })
      } catch (error) {
        failedChats++
        if (failures.length < 5) failures.push(`chat ${serializedId(chat?.id) || '?'}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      chatsScanned++
      let identity = null
      try { identity = await resolveChatIdentity(chat, messages.at?.(-1) || messages[0] || null, session) }
      catch (error) {
        if (failures.length < 5) failures.push(`identidade ${serializedId(chat?.id) || '?'}: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (identity?.unresolvedLid) unresolvedLids++
      for (const message of Array.isArray(messages) ? messages : []) {
        messagesScanned++
        try {
          const resolved = identity || await resolveChatIdentity(chat, message, session)
          if (ingestMessage(snapshot, account, session, message, chat, options.source || 'history_sync', resolved)) imported++
        } catch (error) {
          messagesFailed++
          if (failures.length < 5) failures.push(`mensagem ${serializedId(message?.id) || '?'}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    const date = now()
    account.status = 'connected'
    account.lastSyncAt = date
    account.lastError = failedChats === candidates.length && candidates.length > 0 ? 'Nenhum chat pôde ser sincronizado nesta tentativa.' : null
    account.updatedAt = date
    account.metadata = {
      ...(account.metadata || {}), lastHistorySyncAt: date, lastHistoryImportCount: imported,
      lastChatsScanned: chatsScanned, lastMessagesScanned: messagesScanned, lastHistoryFailedChats: failedChats,
      lastHistoryFailedMessages: messagesFailed, unresolvedLids, liveState: session.state, historyEngine,
    }
    session.lastHistorySyncAt = date
    session.lastHistoryImportCount = imported
    session.updatedAt = date
    saveStore(snapshot)
    return { imported, chatsScanned, messagesScanned, failedChats, messagesFailed, unresolvedLids, failures, historyEngine, lastSyncAt: date }
  }

  async function syncHistory(workspaceId, options = {}, providedSnapshot = null) {
    workspaceId = String(workspaceId || 'default')
    let session = get(workspaceId)
    if (!session) session = await ensureConnected(workspaceId)
    if (session.syncPromise) {
      const activeResult = await session.syncPromise
      if (options.incremental) return activeResult
      return syncHistory(workspaceId, options, providedSnapshot)
    }
    session.syncPromise = performSyncHistory(workspaceId, options, providedSnapshot)
      .finally(() => { session.syncPromise = null })
    return session.syncPromise
  }

  function pruneOutboundSendContexts(session) {
    const cutoff = Date.now() - 30_000
    session.outboundSendContexts = (session.outboundSendContexts || []).filter(item => Number(item.createdAt || 0) >= cutoff)
  }

  function registerOutboundSendContext(session, context) {
    pruneOutboundSendContexts(session)
    session.outboundSendContexts.push(context)
    return context
  }

  function matchOutboundSendContext(session, message, threadId) {
    pruneOutboundSendContexts(session)
    const messageThread = String(threadId || (message?.fromMe ? message?.to : message?.from) || '')
    const hasMedia = Boolean(message?.hasMedia)
    const messageBody = String(whatsappMessageBody(message) || '')
    const candidates = [...(session.outboundSendContexts || [])].reverse()
    return candidates.find(context => {
      if (context.failed || context.matched) return false
      if (String(context.chatId || '') !== messageThread) return false
      if (Boolean(context.hasMedia) !== hasMedia) return false
      if (!hasMedia && context.body && messageBody && String(context.body) !== messageBody) return false
      return true
    }) || null
  }

  function friendlyMediaSendError(error) {
    const raw = error instanceof Error ? error.message : String(error || '')
    if (/Data passed to getter must include an id property|how we memoize/i.test(raw)) {
      const friendly = new Error('Não foi possível enviar a mídia pelo WhatsApp Web. A mensagem não foi duplicada. Use “Tentar novamente”.')
      friendly.code = 'WHATSAPP_WEB_MEDIA_ID_REGRESSION'
      return friendly
    }
    return error instanceof Error ? error : new Error(raw || 'Falha ao enviar mensagem pelo WhatsApp.')
  }

  async function refreshContactCache(session) {
    if (!session?.client || session.state !== 'connected') return []
    let contacts = []
    try { contacts = await session.client.getContacts() } catch { return [] }
    const next = new Map()
    for (const contact of Array.isArray(contacts) ? contacts : []) {
      const serialized = serializedId(contact?.id)
      const phone = isDirectPhoneAddress(serialized) ? isPhoneCandidate(serialized) : isPhoneCandidate(contact?.number || '')
      if (!phone || phone === isPhoneCandidate(session.phone)) continue
      const name = String(contact?.name || contact?.pushname || contact?.shortName || contact?.formattedName || '').trim()
      if (name) next.set(phone, name)
    }
    session.contactNames = next
    session.contactsCachedAt = now()
    return contacts
  }

  async function listContacts(workspaceId) {
    const session = await ensureConnected(workspaceId)
    let contacts = []
    try { contacts = await session.client.getContacts() } catch (error) { throw new Error(`Não foi possível ler os contatos conhecidos pelo WhatsApp: ${error instanceof Error ? error.message : String(error)}`) }
    const result = []
    const own = isPhoneCandidate(session.phone)
    const seen = new Set()
    for (const contact of Array.isArray(contacts) ? contacts : []) {
      const serialized = serializedId(contact?.id)
      const phone = isDirectPhoneAddress(serialized) ? isPhoneCandidate(serialized) : isPhoneCandidate(contact?.number || '')
      if (!phone || phone === own || seen.has(phone)) continue
      seen.add(phone)
      const name = String(contact?.name || contact?.pushname || contact?.shortName || contact?.formattedName || `+${phone}`).trim()
      result.push({ phone, name, pushName:String(contact?.pushname || ''), isMyContact:Boolean(contact?.isMyContact), isBusiness:Boolean(contact?.isBusiness), isBlocked:Boolean(contact?.isBlocked) })
    }
    session.contactNames = new Map(result.map(item => [item.phone, item.name]).filter(([,name]) => name && !/^\+?\d+$/.test(name)))
    session.contactsCachedAt = now()
    return result.sort((a,b) => Number(b.isMyContact)-Number(a.isMyContact) || a.name.localeCompare(b.name, 'pt-BR'))
  }

  async function groupInfo(workspaceId, groupId) {
    const session = await ensureConnected(workspaceId)
    const id = String(groupId || '').trim()
    if (!id.endsWith('@g.us')) throw new Error('Identidade de grupo inválida.')
    let chat = null
    try { chat = await session.client.getChatById(id) } catch (error) { throw new Error(`Não foi possível abrir o grupo: ${error instanceof Error ? error.message : String(error)}`) }
    const participants = Array.isArray(chat?.participants) ? chat.participants.map(item => {
      const pid = serializedId(item?.id)
      const phone = isDirectPhoneAddress(pid) ? isPhoneCandidate(pid) : isPhoneCandidate(pid)
      return { id:pid, phone, isAdmin:Boolean(item?.isAdmin), isSuperAdmin:Boolean(item?.isSuperAdmin) }
    }) : []
    return { id, name:String(chat?.name || chat?.formattedTitle || 'Grupo do WhatsApp'), description:String(chat?.description || ''), participantCount:participants.length, participants }
  }

  async function start(workspaceId, displayName = 'WhatsApp QR Local') {
    workspaceId = String(workspaceId || 'default')
    const prior = get(workspaceId)
    if (prior?.client) await destroySession(prior)

    const { Client, LocalAuth, MessageMedia, mediaHotfix } = await loadWebJs()
    const clientId = safeId(workspaceId)
    const browserExecutable = findBrowserExecutable()
    const puppeteer = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      ...(browserExecutable ? { executablePath: browserExecutable } : {}),
    }
    const stored = store()
    const storedAccount = (stored.accounts || []).find(a => a.workspaceId === workspaceId && a.provider === 'whatsapp_cloud' && a.metadata?.transport === 'qr')
    const session = {
      workspaceId,
      displayName: String(displayName || storedAccount?.displayName || 'WhatsApp QR Local'),
      state: 'starting',
      qrDataUrl: null,
      phone: cleanNumber(storedAccount?.metadata?.displayPhoneNumber || ''),
      lastError: null,
      updatedAt: now(),
      client: null,
      accountId: storedAccount?.id || null,
      lastHistorySyncAt: storedAccount?.metadata?.lastHistorySyncAt || storedAccount?.lastSyncAt || null,
      lastHistoryImportCount: Number(storedAccount?.metadata?.lastHistoryImportCount || 0),
      syncPromise: null,
      manualDisconnect: false,
      reconnectTimer: null,
      reconnectAttempts: 0,
      liveMessageIds: new Map(),
      contactNames: new Map(),
      contactsCachedAt: null,
      MessageMedia,
      mediaHotfix,
      outboundSendContexts: [],
    }
    sessions.set(workspaceId, session)
    updateQrAccount(workspaceId, { status: 'attention', lastError: 'Aguardando autenticação do WhatsApp Web.' })

    const client = new Client({
      authStrategy: new LocalAuth({ clientId, dataPath: authRoot, rmMaxRetries: 6 }),
      puppeteer,
      authTimeoutMs: 120_000,
      qrMaxRetries: 8,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 8_000,
      deviceName: 'RealTalent CRM',
      browserName: 'Chrome',
    })
    session.client = client

    client.on('qr', async qr => {
      session.state = 'qr'
      session.updatedAt = now()
      session.lastError = null
      try { const QRCode = await loadQRCode(); session.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 }) }
      catch (error) { session.lastError = `Falha ao renderizar QR: ${error instanceof Error ? error.message : String(error)}` }
    })
    client.on('authenticated', () => {
      session.state = 'starting'
      session.qrDataUrl = null
      session.lastError = null
      session.updatedAt = now()
    })
    client.on('auth_failure', message => {
      session.state = 'disconnected'
      session.lastError = `O WhatsApp recusou a autenticação: ${String(message || 'falha de autenticação')}. Remova a sessão QR e gere um código novo.`
      session.updatedAt = now()
      updateQrAccount(workspaceId, { status: 'error', lastError: session.lastError })
    })
    client.on('ready', () => {
      try {
        session.state = 'connected'
        session.qrDataUrl = null
        session.phone = cleanNumber(client.info?.wid?._serialized || client.info?.wid?.user || session.phone || '')
        session.lastError = null
        session.reconnectAttempts = 0
        session.updatedAt = now()
        const s = store()
        const existing = (s.accounts || []).find(a => a.workspaceId === workspaceId && a.provider === 'whatsapp_cloud' && a.metadata?.transport === 'qr')
        const date = now()
        const account = {
          id: existing?.id || uuid(), workspaceId, provider: 'whatsapp_cloud',
          externalAccountId: session.phone || existing?.externalAccountId || `qr-browser-${uuid()}`,
          displayName: session.displayName, status: 'connected', scopes: ['local_qr_session'], credential: null,
          tokenExpiresAt: null, lastSyncAt: existing?.lastSyncAt || null, lastError: null, lastTestedAt: date, lastTestStatus: 'pass', lastTestLatencyMs: 0,
          capabilities: { messages: true, templates: false, delivery_status: true, webhooks: false, history_sync: true },
          metadata: { ...(existing?.metadata || {}), transport: 'qr', qrEngine: 'whatsapp-web-js', displayPhoneNumber: session.phone, unofficial: true, historySync: true, liveState: 'connected' },
          createdAt: existing?.createdAt || date, updatedAt: date,
        }
        upsertAccount(s, account); saveStore(s); session.accountId = account.id
        setTimeout(() => { void refreshContactCache(session) }, 800).unref?.()
        setTimeout(() => {
          syncHistory(workspaceId, { chatLimit: 40, messageLimit: 50, source: 'initial_history_sync' }).catch(error => {
            session.lastError = `WhatsApp conectado, mas a importação inicial do histórico falhou: ${error instanceof Error ? error.message : String(error)}`
            session.updatedAt = now()
            try { updateQrAccount(workspaceId, { lastError: session.lastError }) } catch {}
          })
        }, 5000).unref?.()
      } catch (error) {
        rememberAsyncError(session, 'Falha ao finalizar conexão WhatsApp', error)
      }
    })
    client.on('disconnected', reason => {
      session.state = 'disconnected'
      session.lastError = `Sessão WhatsApp Web encerrada${reason ? `: ${String(reason)}` : ''}. Tentando reconectar automaticamente.`
      session.updatedAt = now()
      updateQrAccount(workspaceId, { status: 'attention', lastError: session.lastError, metadata: { liveState: 'disconnected' } })
      if (!session.manualDisconnect) scheduleReconnect(session, String(reason || 'desconexão'))
    })

    const recordLiveMessage = async (message, source = 'live') => {
      if (!message || isWhatsAppTechnicalMessage(message)) return
      const liveId = serializedId(message.id)
      if (liveId) {
        const seenAt = Number(session.liveMessageIds?.get(liveId) || 0)
        if (seenAt && Date.now() - seenAt < 120_000) return
        session.liveMessageIds?.set(liveId, Date.now())
        if ((session.liveMessageIds?.size || 0) > 500) {
          const cutoff = Date.now() - 120_000
          for (const [id, at] of session.liveMessageIds) if (at < cutoff) session.liveMessageIds.delete(id)
        }
      }
      const s = store()
      const account = qrAccount(s, workspaceId)
      if (!account) return
      // Fast path: mensagens 1:1 com @c.us não precisam esperar getChat()/getContact().
      // Isso reduz a latência entre o evento do WhatsApp Web e a bolha no CRM.
      const rawPeerAddress = String(message.fromMe ? message.to : message.from || '')
      let chat = null
      let identity = null
      if (isDirectPhoneAddress(rawPeerAddress)) {
        const peer = isPhoneCandidate(rawPeerAddress)
        identity = {
          threadId: rawPeerAddress,
          peer,
          chatName: String(message?._data?.notifyName || session.contactNames?.get(peer) || (peer ? `+${peer}` : 'WhatsApp')).trim(),
          isGroup: false,
          own: isPhoneCandidate(session.phone),
          from: message.fromMe ? isPhoneCandidate(session.phone) : peer,
          to: message.fromMe ? peer : isPhoneCandidate(session.phone),
          unresolvedLid: false,
          lidCandidates: [],
        }
      } else {
        try { chat = typeof message.getChat === 'function' ? await message.getChat() : null } catch {}
        try { identity = await resolveChatIdentity(chat, message, session) } catch {}
      }
      let mediaRef = null
      if (!message.fromMe && message.hasMedia && typeof message.downloadMedia === 'function' && typeof persistMedia === 'function') {
        try {
          const media = await message.downloadMedia()
          if (media?.data && media?.mimetype) {
            const messageType = String(message.type || '').toLowerCase()
            const kind = messageType === 'ptt' ? 'voice' : messageType === 'sticker' ? 'sticker' : ['image','video','audio','document'].includes(messageType) ? messageType : undefined
            mediaRef = persistMedia({ dataBase64: media.data, mimeType: media.mimetype, fileName: media.filename || `whatsapp-${liveId || Date.now()}`, kind })
          }
        } catch (error) { rememberAsyncError(session, 'Falha ao baixar mídia recebida', error) }
      }
      let replyToExternalMessageId = ''
      let replyPreview = ''
      if (message.hasQuotedMsg && typeof message.getQuotedMessage === 'function') {
        try { const quoted = await message.getQuotedMessage(); replyToExternalMessageId = serializedId(quoted?.id); replyPreview = whatsappMessageBody(quoted).slice(0, 240) } catch {}
      }
      const outboundContext = message.fromMe ? matchOutboundSendContext(session, message, identity?.threadId || rawPeerAddress) : null
      if (outboundContext) {
        outboundContext.matched = true
        outboundContext.externalMessageId = liveId || serializedId(message.id)
      }
      if (ingestMessage(s, account, session, message, chat, source, identity, { mediaRef, replyToExternalMessageId, replyPreview, idempotencyKey: outboundContext?.idempotencyKey || null })) saveStore(s)
    }
    client.on('message', message => {
      if (message?.fromMe) return
      void recordLiveMessage(message, 'live_inbound').catch(error => rememberAsyncError(session, 'Falha ao registrar mensagem recebida', error))
    })
    client.on('message_create', message => {
      if (!message?.fromMe) return
      void recordLiveMessage(message, 'live_outbound').catch(error => rememberAsyncError(session, 'Falha ao registrar mensagem criada', error))
    })
    client.on('message_ack', (message, ack) => {
      try {
        if (!message?.fromMe) return
        const externalMessageId = serializedId(message.id)
        if (!externalMessageId) return
        const s = store()
        const event = (s.events || []).find(item => item.externalMessageId === externalMessageId && item.workspaceId === workspaceId && item.accountId === session.accountId)
        if (!event) return
        event.status = mapWhatsAppAckStatus(ack)
        event.metadata = { ...(event.metadata || {}), ack: Number(ack) }
        saveStore(s)
      } catch (error) {
        rememberAsyncError(session, 'Falha ao atualizar confirmação da mensagem', error)
      }
    })

    void client.initialize().catch(error => {
      session.state = 'disconnected'
      session.lastError = `Não foi possível abrir o WhatsApp Web: ${error instanceof Error ? error.message : String(error)}`
      session.updatedAt = now()
      updateQrAccount(workspaceId, { status: 'attention', lastError: session.lastError, metadata: { liveState: 'disconnected' } })
      if (!session.manualDisconnect) scheduleReconnect(session, 'falha ao inicializar')
    })
    return status(workspaceId)
  }

  async function send(workspaceId, recipient, body, options = {}) {
    const session = await ensureConnected(workspaceId)
    const requestedThread = String(options?.threadId || '').trim()
    let chatId = ''
    if (requestedThread.endsWith('@g.us')) chatId = requestedThread
    else {
      const number = cleanNumber(recipient)
      if (!number) throw new Error('Número de WhatsApp inválido.')
      chatId = `${number}@c.us`
    }
    const sendOptions = {}
    if (options.replyToExternalMessageId) sendOptions.quotedMessageId = String(options.replyToExternalMessageId)
    const context = registerOutboundSendContext(session, {
      idempotencyKey: String(options.idempotencyKey || ''),
      chatId,
      body: String(body || ''),
      hasMedia: Boolean(options.attachment?.dataBase64 && options.attachment?.mimeType),
      createdAt: Date.now(),
      matched: false,
      failed: false,
      externalMessageId: null,
    })
    let sent
    try {
      if (options.attachment?.dataBase64 && options.attachment?.mimeType) {
        const Media = session.MessageMedia
        if (!Media) throw new Error('Motor de mídia do WhatsApp não está disponível.')
        const media = new Media(String(options.attachment.mimeType), String(options.attachment.dataBase64), String(options.attachment.fileName || 'arquivo'))
        if (body) sendOptions.caption = String(body)
        if (options.attachment.kind === 'voice') sendOptions.sendAudioAsVoice = true
        if (options.attachment.kind === 'document') sendOptions.sendMediaAsDocument = true
        sent = await session.client.sendMessage(chatId, media, sendOptions)
      } else {
        sent = await session.client.sendMessage(chatId, String(body), sendOptions)
      }
      const externalMessageId = serializedId(sent?.id)
      if (externalMessageId) context.externalMessageId = externalMessageId
      setTimeout(() => {
        session.outboundSendContexts = (session.outboundSendContexts || []).filter(item => item !== context)
      }, 15_000).unref?.()
      return { id: externalMessageId || uuid(), threadId: chatId }
    } catch (error) {
      context.failed = true
      session.outboundSendContexts = (session.outboundSendContexts || []).filter(item => item !== context)
      throw friendlyMediaSendError(error)
    }
  }

  async function createGroup(workspaceId, title, participants = []) {
    const session = await ensureConnected(workspaceId)
    const cleanTitle = String(title || '').trim().slice(0, 100)
    if (!cleanTitle) throw new Error('Informe o nome do grupo.')
    const numbers = [...new Set((participants || []).map(cleanNumber).filter(Boolean))]
    if (!numbers.length) throw new Error('Adicione pelo menos um participante com WhatsApp.')
    const ids = numbers.map(number => `${number}@c.us`)
    const result = await session.client.createGroup(cleanTitle, ids, { autoSendInviteV4: true, isRestrict: false, isAnnounce: false })
    if (!result || typeof result === 'string') throw new Error(typeof result === 'string' ? result : 'O WhatsApp não retornou os dados do grupo criado.')
    const groupId = serializedId(result.gid)
    if (!groupId || !groupId.endsWith('@g.us')) throw new Error('O WhatsApp criou o grupo, mas não retornou uma identidade de grupo válida.')
    return { groupId, title: String(result.title || cleanTitle), participants: result.participants || {} }
  }

  async function diagnostics(workspaceId) {
    workspaceId = String(workspaceId || 'default')
    const session = get(workspaceId)
    if (!session?.client?.pupPage) return { ok: false, state: session?.state || 'idle', error: 'Página do WhatsApp Web não está disponível.' }
    try {
      const browser = await session.client.pupPage.evaluate(() => {
        const asArray = collection => {
          if (!collection) return []
          try { if (typeof collection.getModelsArray === 'function') return collection.getModelsArray() || [] } catch {}
          if (Array.isArray(collection.models)) return collection.models
          if (Array.isArray(collection._models)) return collection._models
          return []
        }
        let chatCount = 0
        let messageCount = 0
        let collectionsAvailable = false
        try {
          const collections = typeof window.require === 'function' ? window.require('WAWebCollections') : null
          collectionsAvailable = Boolean(collections?.Chat)
          const chats = asArray(collections?.Chat)
          chatCount = chats.length
          messageCount = chats.slice(0, 80).reduce((sum, chat) => sum + asArray(chat?.msgs).length, 0)
        } catch {}
        return {
          url: location.href,
          documentReadyState: document.readyState,
          hasWWebJS: Boolean(window.WWebJS),
          collectionsAvailable,
          chatCount,
          materializedMessageCount: messageCount,
        }
      })
      return { ok: true, state: session.state, phone: session.phone || '', ...browser, lastHistorySyncAt: session.lastHistorySyncAt || null, lastHistoryImportCount: Number(session.lastHistoryImportCount || 0) }
    } catch (error) {
      return { ok: false, state: session.state, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function disconnect(workspaceId) {
    workspaceId = String(workspaceId || 'default')
    const session = get(workspaceId)
    if (session) await destroySession(session, { logout: true })
    sessions.delete(workspaceId)
    const sessionDir = path.join(authRoot, `session-${safeId(workspaceId)}`)
    try { fs.rmSync(sessionDir, { recursive: true, force: true }) } catch {}
    const s = store()
    for (const a of s.accounts || []) {
      if (a.workspaceId === workspaceId && a.provider === 'whatsapp_cloud' && a.metadata?.transport === 'qr') {
        a.status = 'revoked'; a.updatedAt = now(); a.revokedAt = now()
      }
    }
    saveStore(s)
    return { ok: true }
  }

  async function shutdown() {
    const active = [...sessions.values()]
    for (const session of active) if (session.reconnectTimer) { clearTimeout(session.reconnectTimer); session.reconnectTimer = null }
    await Promise.allSettled(active.map(session => destroySession(session)))
    sessions.clear()
    return { ok: true, closed: active.length }
  }

  return { start, status, send, createGroup, listContacts, groupInfo, disconnect, syncHistory, diagnostics, shutdown }
}
