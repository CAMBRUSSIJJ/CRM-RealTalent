import type { Lead } from '../domain/types'
import { safeStorage } from '../lib/storage'
import type { ConversationStatus } from './communication-workspace'

export type WhatsAppSalesConversationStatus = 'awaiting_you' | 'awaiting_customer' | 'resolved'

export interface WhatsAppConversationSalesState {
  status: WhatsAppSalesConversationStatus
  updatedAt: string
}

export interface WhatsAppQuickReply {
  id: string
  label: string
  category: 'abertura' | 'followup' | 'proposta' | 'reuniao' | 'encerramento'
  body: string
}

const STATUS_PREFIX = 'realtalent.h19.3.whatsapp-sales-status:'
const statusKey = (workspaceId: string) => `${STATUS_PREFIX}${workspaceId}`

const readStatusMap = (workspaceId: string): Record<string, WhatsAppConversationSalesState> => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(statusKey(workspaceId)) ?? '{}') as Record<string, Partial<WhatsAppConversationSalesState>>
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => ['awaiting_you', 'awaiting_customer', 'resolved'].includes(String(value?.status)) && Boolean(value?.updatedAt))) as Record<string, WhatsAppConversationSalesState>
  } catch { return {} }
}

export const saveWhatsAppConversationSalesStatus = (workspaceId: string, conversationKey: string, status: WhatsAppSalesConversationStatus) => {
  const map = readStatusMap(workspaceId)
  map[conversationKey] = { status, updatedAt: new Date().toISOString() }
  safeStorage.setItem(statusKey(workspaceId), JSON.stringify(map))
  return map[conversationKey]
}

const inferredSalesStatus = (status: ConversationStatus): WhatsAppSalesConversationStatus => status === 'needs_reply' ? 'awaiting_you' : status === 'waiting_reply' ? 'awaiting_customer' : 'awaiting_you'

export const resolveWhatsAppConversationSalesStatus = (workspaceId: string, conversationKey: string, inferred: ConversationStatus, lastOccurredAt?: string | null): WhatsAppSalesConversationStatus => {
  const saved = readStatusMap(workspaceId)[conversationKey]
  if (!saved) return inferredSalesStatus(inferred)
  if (lastOccurredAt && Date.parse(lastOccurredAt) > Date.parse(saved.updatedAt) + 1000) return inferredSalesStatus(inferred)
  return saved.status
}

export const whatsappSalesStatusLabel = (status: WhatsAppSalesConversationStatus) => ({
  awaiting_you: 'Aguardando você',
  awaiting_customer: 'Aguardando cliente',
  resolved: 'Resolvido',
}[status])

export const DEFAULT_WHATSAPP_QUICK_REPLIES: WhatsAppQuickReply[] = [
  { id: 'opening', label: 'Abertura', category: 'abertura', body: 'Olá {{nome}}, tudo bem? Queria falar rapidamente sobre {{empresa}} e entender como posso te ajudar.' },
  { id: 'followup', label: 'Retomar conversa', category: 'followup', body: 'Oi {{nome}}, passando para retomar nossa conversa. Conseguiu analisar o que combinamos? Posso te ajudar em algum ponto para avançarmos?' },
  { id: 'proposal', label: 'Acompanhar proposta', category: 'proposta', body: 'Oi {{nome}}, conseguiu revisar a proposta? Se fizer sentido, posso te explicar os principais pontos e alinhamos o próximo passo por aqui.' },
  { id: 'meeting', label: 'Agendar reunião', category: 'reuniao', body: 'Podemos marcar uma conversa rápida para alinhar os próximos passos? Me diga um horário que funcione bem para você.' },
  { id: 'close', label: 'Encerrar por agora', category: 'encerramento', body: 'Perfeito, {{nome}}. Vou encerrar este acompanhamento por agora. Quando fizer sentido retomar, é só me chamar por aqui.' },
]

export const renderWhatsAppQuickReply = (reply: WhatsAppQuickReply, lead: Lead | null, fallbackName = 'tudo bem') => {
  const firstName = (lead?.name || fallbackName).trim().split(/\s+/)[0] || fallbackName
  const company = lead?.company?.trim() || 'seu negócio'
  const owner = lead?.ownerName?.trim() || 'nossa equipe'
  return reply.body.replaceAll('{{nome}}', firstName).replaceAll('{{empresa}}', company).replaceAll('{{responsavel}}', owner)
}
