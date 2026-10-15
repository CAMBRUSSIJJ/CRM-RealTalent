import { createId } from '../lib/id'
import { safeStorage } from '../lib/storage'
import type { ConversationStatus } from './communication-workspace'

export type WhatsAppOperationalStatus = 'new' | 'in_progress' | 'awaiting_customer' | 'followup_scheduled' | 'resolved'

export interface WhatsAppWorkLabel {
  id: string
  name: string
  color: string
  system: boolean
  createdAt: string
}

export interface WhatsAppConversationWorkState {
  conversationKey: string
  status: WhatsAppOperationalStatus
  labelIds: string[]
  ownerId: string | null
  ownerName: string
  followUpAt: string | null
  snoozedUntil: string | null
  updatedAt: string
}

const STATE_PREFIX = 'realtalent.h19.13.whatsapp-work-state:'
const LABEL_PREFIX = 'realtalent.h19.13.whatsapp-work-labels:'

export const DEFAULT_WHATSAPP_WORK_LABELS: WhatsAppWorkLabel[] = [
  { id: 'lead', name: 'Lead', color: '#356AE6', system: true, createdAt: 'system' },
  { id: 'cliente', name: 'Cliente', color: '#15803D', system: true, createdAt: 'system' },
  { id: 'quente', name: 'Quente', color: '#DC2626', system: true, createdAt: 'system' },
  { id: 'retornar', name: 'Retornar', color: '#D97706', system: true, createdAt: 'system' },
  { id: 'pos-venda', name: 'Pós-venda', color: '#7C3AED', system: true, createdAt: 'system' },
  { id: 'vip', name: 'VIP', color: '#B45309', system: true, createdAt: 'system' },
]

const stateKey = (workspaceId: string) => `${STATE_PREFIX}${workspaceId}`
const labelKey = (workspaceId: string) => `${LABEL_PREFIX}${workspaceId}`

const inferredStatus = (status: ConversationStatus): WhatsAppOperationalStatus => status === 'needs_reply' ? 'new' : status === 'waiting_reply' ? 'awaiting_customer' : 'in_progress'

export const whatsappOperationalStatusLabel: Record<WhatsAppOperationalStatus, string> = {
  new: 'Novo',
  in_progress: 'Em atendimento',
  awaiting_customer: 'Aguardando cliente',
  followup_scheduled: 'Retorno agendado',
  resolved: 'Concluído',
}

export const loadWhatsAppWorkStates = (workspaceId: string): Record<string, WhatsAppConversationWorkState> => {
  try {
    const parsed = JSON.parse(safeStorage.getItem(stateKey(workspaceId)) ?? '{}') as Record<string, Partial<WhatsAppConversationWorkState>>
    const result: Record<string, WhatsAppConversationWorkState> = {}
    for (const [conversationKey, item] of Object.entries(parsed)) {
      if (!item || !['new', 'in_progress', 'awaiting_customer', 'followup_scheduled', 'resolved'].includes(String(item.status))) continue
      result[conversationKey] = {
        conversationKey,
        status: item.status as WhatsAppOperationalStatus,
        labelIds: Array.isArray(item.labelIds) ? item.labelIds.filter(Boolean).map(String) : [],
        ownerId: item.ownerId ? String(item.ownerId) : null,
        ownerName: String(item.ownerName ?? ''),
        followUpAt: item.followUpAt ? String(item.followUpAt) : null,
        snoozedUntil: item.snoozedUntil ? String(item.snoozedUntil) : null,
        updatedAt: String(item.updatedAt ?? new Date(0).toISOString()),
      }
    }
    return result
  } catch { return {} }
}

export const resolveWhatsAppWorkState = (workspaceId: string, conversationKey: string, conversationStatus: ConversationStatus): WhatsAppConversationWorkState => {
  const saved = loadWhatsAppWorkStates(workspaceId)[conversationKey]
  if (saved) return saved
  return { conversationKey, status: inferredStatus(conversationStatus), labelIds: [], ownerId: null, ownerName: '', followUpAt: null, snoozedUntil: null, updatedAt: new Date(0).toISOString() }
}

export const saveWhatsAppWorkState = (workspaceId: string, conversationKey: string, conversationStatus: ConversationStatus, patch: Partial<Omit<WhatsAppConversationWorkState, 'conversationKey' | 'updatedAt'>>) => {
  const map = loadWhatsAppWorkStates(workspaceId)
  const current = map[conversationKey] ?? resolveWhatsAppWorkState(workspaceId, conversationKey, conversationStatus)
  const next: WhatsAppConversationWorkState = {
    ...current,
    ...patch,
    conversationKey,
    labelIds: patch.labelIds ? Array.from(new Set(patch.labelIds.filter(Boolean))) : current.labelIds,
    updatedAt: new Date().toISOString(),
  }
  map[conversationKey] = next
  safeStorage.setItem(stateKey(workspaceId), JSON.stringify(map))
  return next
}

export const loadWhatsAppWorkLabels = (workspaceId: string): WhatsAppWorkLabel[] => {
  let custom: WhatsAppWorkLabel[] = []
  try {
    const parsed = JSON.parse(safeStorage.getItem(labelKey(workspaceId)) ?? '[]') as Partial<WhatsAppWorkLabel>[]
    custom = Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.name).map((item) => ({ id: String(item.id), name: String(item.name), color: String(item.color || '#64748B'), system: false, createdAt: String(item.createdAt || new Date().toISOString()) })) : []
  } catch {}
  return [...DEFAULT_WHATSAPP_WORK_LABELS, ...custom.filter((item) => !DEFAULT_WHATSAPP_WORK_LABELS.some((system) => system.id === item.id))]
}

export const createWhatsAppWorkLabel = (workspaceId: string, input: { name: string; color: string }) => {
  const name = input.name.trim()
  if (!name) throw new Error('Informe o nome da etiqueta.')
  const labels = loadWhatsAppWorkLabels(workspaceId)
  const duplicate = labels.find((item) => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
  if (duplicate) return duplicate
  const created: WhatsAppWorkLabel = { id: createId('wa-label'), name, color: input.color || '#64748B', system: false, createdAt: new Date().toISOString() }
  const custom = labels.filter((item) => !item.system)
  safeStorage.setItem(labelKey(workspaceId), JSON.stringify([...custom, created]))
  return created
}

export const deleteWhatsAppWorkLabel = (workspaceId: string, labelId: string) => {
  const labels = loadWhatsAppWorkLabels(workspaceId)
  const target = labels.find((item) => item.id === labelId)
  if (!target || target.system) return false
  safeStorage.setItem(labelKey(workspaceId), JSON.stringify(labels.filter((item) => !item.system && item.id !== labelId)))
  const states = loadWhatsAppWorkStates(workspaceId)
  for (const [key, state] of Object.entries(states)) states[key] = { ...state, labelIds: state.labelIds.filter((id) => id !== labelId) }
  safeStorage.setItem(stateKey(workspaceId), JSON.stringify(states))
  return true
}

export const isDueToday = (value?: string | null) => {
  if (!value) return false
  const due = new Date(value); const today = new Date()
  return due.getFullYear() === today.getFullYear() && due.getMonth() === today.getMonth() && due.getDate() === today.getDate()
}

export const isOverdue = (value?: string | null) => Boolean(value && Date.parse(value) < Date.now())
