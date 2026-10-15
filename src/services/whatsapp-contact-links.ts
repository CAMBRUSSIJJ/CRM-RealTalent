import { safeStorage } from '../lib/storage'

export interface WhatsAppContactLink {
  leadId: string
  contactId: string | null
  peerAddress: string
  threadId: string
  displayName: string
  linkedAt: string
}

const PREFIX = 'realtalent-v10184-whatsapp-contact-links:'
const storageKey = (workspaceId: string) => `${PREFIX}${workspaceId}`

const normalizePhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 ? digits : ''
}
const normalizeThread = (value: unknown) => String(value || '').trim().toLowerCase()

const read = (workspaceId: string): Record<string, WhatsAppContactLink> => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(storageKey(workspaceId)) ?? '{}') as Record<string, WhatsAppContactLink>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

const write = (workspaceId: string, value: Record<string, WhatsAppContactLink>) => safeStorage.setItem(storageKey(workspaceId), JSON.stringify(value))

const peerKey = (peerAddress: unknown) => {
  const phone = normalizePhone(peerAddress)
  return phone ? `peer:${phone}` : ''
}
const threadKey = (threadId: unknown) => {
  const thread = normalizeThread(threadId)
  return thread ? `thread:${thread}` : ''
}

export function resolveWhatsAppContactLink(workspaceId: string, identity: { peerAddress?: unknown; threadId?: unknown }): WhatsAppContactLink | null {
  const links = read(workspaceId)
  const peer = peerKey(identity.peerAddress)
  if (peer && links[peer]) return links[peer]
  const thread = threadKey(identity.threadId)
  if (thread && links[thread]) return links[thread]
  return null
}

export function saveWhatsAppContactLink(workspaceId: string, input: {
  leadId: string
  contactId?: string | null
  peerAddress?: unknown
  threadId?: unknown
  displayName?: string
}): WhatsAppContactLink {
  const peerAddress = normalizePhone(input.peerAddress)
  const threadId = normalizeThread(input.threadId)
  if (!peerAddress && !threadId) throw new Error('A conversa do WhatsApp não possui identidade suficiente para salvar o vínculo.')
  const link: WhatsAppContactLink = {
    leadId: input.leadId,
    contactId: input.contactId ?? null,
    peerAddress,
    threadId,
    displayName: String(input.displayName || '').trim(),
    linkedAt: new Date().toISOString(),
  }
  const links = read(workspaceId)
  const peer = peerKey(peerAddress)
  const thread = threadKey(threadId)
  if (peer) links[peer] = link
  if (thread) links[thread] = link
  write(workspaceId, links)
  return link
}

export function removeWhatsAppContactLink(workspaceId: string, identity: { peerAddress?: unknown; threadId?: unknown }) {
  const links = read(workspaceId)
  const peer = peerKey(identity.peerAddress)
  const thread = threadKey(identity.threadId)
  if (peer) delete links[peer]
  if (thread) delete links[thread]
  write(workspaceId, links)
}
