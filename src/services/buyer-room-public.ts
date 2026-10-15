import type { BuyerRoomDocument, BuyerRoomParticipant, BuyerRoomStep, ProposalStatus } from '../domain/types'
import { effectiveDataMode } from '../lib/env'
import { getSupabaseClient } from '../lib/supabase'
import { createId } from '../lib/id'
import { readDatabase, writeDatabase } from '../repositories/local-repository-core'
import { buyerRoomStatusFromProgress, normalizeBuyerRoom } from './buyer-room'

export interface BuyerRoomPublicPayload {
  id: string
  title: string
  welcomeMessage: string
  status: 'draft' | 'shared' | 'active' | 'completed' | 'archived'
  expiresAt: string | null
  lastOpenedAt: string | null
  viewCount: number
  participants: BuyerRoomParticipant[]
  steps: BuyerRoomStep[]
  documents: BuyerRoomDocument[]
  proposal: {
    id: string
    proposalNumber: string
    title: string
    status: ProposalStatus
    totalContractValue: number
    recurringMonthlyTotal: number
    currency: 'BRL'
    validUntil: string | null
    terms: string
  }
  customer: { name: string; company: string }
}

const localPayload = (token: string): BuyerRoomPublicPayload | null => {
  const db = readDatabase()
  const room = db.buyerRooms.find((item) => item.shareToken === token && item.shareEnabled && item.status !== 'archived')
  if (!room || (room.expiresAt && new Date(room.expiresAt).getTime() < Date.now())) return null
  const proposal = db.proposals.find((item) => item.id === room.proposalId)
  const lead = db.leads.find((item) => item.id === room.leadId)
  if (!proposal || !lead) return null
  return {
    id: room.id, title: room.title, welcomeMessage: room.welcomeMessage, status: room.status, expiresAt: room.expiresAt, lastOpenedAt: room.lastOpenedAt, viewCount: room.viewCount,
    participants: room.participants, steps: room.steps, documents: room.documents,
    proposal: { id: proposal.id, proposalNumber: proposal.proposalNumber, title: proposal.title, status: proposal.status, totalContractValue: proposal.totalContractValue, recurringMonthlyTotal: proposal.recurringMonthlyTotal, currency: proposal.currency, validUntil: proposal.validUntil, terms: proposal.terms },
    customer: { name: lead.name, company: lead.company },
  }
}

const mapRpcPayload = (data: any): BuyerRoomPublicPayload | null => {
  if (!data || typeof data !== 'object') return null
  return {
    id: String(data.id), title: String(data.title ?? 'Sala de fechamento'), welcomeMessage: String(data.welcomeMessage ?? ''), status: data.status ?? 'active', expiresAt: data.expiresAt ?? null, lastOpenedAt: data.lastOpenedAt ?? null, viewCount: Number(data.viewCount ?? 0),
    participants: Array.isArray(data.participants) ? data.participants : [], steps: Array.isArray(data.steps) ? data.steps : [], documents: Array.isArray(data.documents) ? data.documents : [],
    proposal: { id: String(data.proposal?.id ?? ''), proposalNumber: String(data.proposal?.proposalNumber ?? ''), title: String(data.proposal?.title ?? ''), status: data.proposal?.status ?? 'sent', totalContractValue: Number(data.proposal?.totalContractValue ?? 0), recurringMonthlyTotal: Number(data.proposal?.recurringMonthlyTotal ?? 0), currency: 'BRL', validUntil: data.proposal?.validUntil ?? null, terms: String(data.proposal?.terms ?? '') },
    customer: { name: String(data.customer?.name ?? ''), company: String(data.customer?.company ?? '') },
  }
}

export async function loadBuyerRoomPublic(token: string, trackOpen = false, actorName = 'Visitante'): Promise<BuyerRoomPublicPayload | null> {
  if (!token.trim()) return null
  if (effectiveDataMode === 'local') {
    if (trackOpen) {
      const db = readDatabase(); const index = db.buyerRooms.findIndex((item) => item.shareToken === token && item.shareEnabled && item.status !== 'archived')
      if (index >= 0 && (!db.buyerRooms[index].expiresAt || new Date(db.buyerRooms[index].expiresAt!).getTime() >= Date.now())) {
        const now = new Date().toISOString(); const current = normalizeBuyerRoom(db.buyerRooms[index])
        const next = normalizeBuyerRoom({ ...current, lastOpenedAt: now, viewCount: current.viewCount + 1, activity: [...current.activity, { id: createId('room-event'), type: 'opened', actorName: actorName.trim() || 'Visitante', description: 'Buyer Room aberta.', occurredAt: now, metadata: { public: true } }], updatedAt: now })
        next.status = buyerRoomStatusFromProgress(next); if (next.status === 'shared') next.status = 'active'; db.buyerRooms[index] = next; writeDatabase(db)
      }
    }
    return localPayload(token)
  }
  const client = getSupabaseClient() as any; if (!client) return null
  const { data, error } = await client.rpc(trackOpen ? 'track_buyer_room_public_open' : 'get_buyer_room_public', trackOpen ? { p_share_token: token, p_actor_name: actorName } : { p_share_token: token })
  if (error) throw error
  return mapRpcPayload(data)
}

export async function updateBuyerRoomPublicStep(token: string, stepId: string, completed: boolean, actorName = 'Comprador'): Promise<BuyerRoomPublicPayload | null> {
  if (effectiveDataMode === 'local') {
    const db = readDatabase(); const index = db.buyerRooms.findIndex((item) => item.shareToken === token && item.shareEnabled && item.status !== 'archived')
    if (index < 0) return null
    const room = normalizeBuyerRoom(db.buyerRooms[index]); const step = room.steps.find((item) => item.id === stepId)
    if (!step || !['buyer', 'shared'].includes(step.owner)) throw new Error('Esta etapa não pode ser alterada pelo comprador.')
    const now = new Date().toISOString(); room.steps = room.steps.map((item) => item.id === stepId ? { ...item, status: completed ? 'completed' : 'in_progress', completedAt: completed ? now : null } : item)
    room.activity = [...room.activity, { id: createId('room-event'), type: 'step_updated', actorName: actorName.trim() || 'Comprador', description: completed ? 'Etapa concluída pelo comprador.' : 'Etapa reaberta pelo comprador.', occurredAt: now, metadata: { stepId, completed } }]
    room.updatedAt = now; room.status = buyerRoomStatusFromProgress(room); db.buyerRooms[index] = room; writeDatabase(db); return localPayload(token)
  }
  const client = getSupabaseClient() as any; if (!client) return null
  const { data, error } = await client.rpc('update_buyer_room_public_step', { p_share_token: token, p_step_id: stepId, p_completed: completed, p_actor_name: actorName })
  if (error) throw error
  return mapRpcPayload(data)
}


export async function trackBuyerRoomPublicDocument(token: string, documentId: string, actorName = 'Comprador'): Promise<boolean> {
  if (!token.trim() || !documentId.trim()) return false
  if (effectiveDataMode === 'local') {
    const db = readDatabase(); const index = db.buyerRooms.findIndex((item) => item.shareToken === token && item.shareEnabled && item.status !== 'archived')
    if (index < 0) return false
    const room = normalizeBuyerRoom(db.buyerRooms[index]); const document = room.documents.find((item) => item.id === documentId && item.visible)
    if (!document) return false
    const now = new Date().toISOString(); room.activity = [...room.activity, { id: createId('room-event'), type: 'document_opened', actorName: actorName.trim() || 'Comprador', description: `Documento aberto: ${document.title}.`, occurredAt: now, metadata: { documentId, public: true } }]
    room.updatedAt = now; db.buyerRooms[index] = room; writeDatabase(db); return true
  }
  const client = getSupabaseClient() as any; if (!client) return false
  const { data, error } = await client.rpc('track_buyer_room_public_document', { p_share_token: token, p_document_id: documentId, p_actor_name: actorName })
  if (error) throw error
  return Boolean(data)
}

export async function addBuyerRoomPublicComment(token: string, message: string, actorName = 'Comprador'): Promise<boolean> {
  const clean = message.trim().slice(0, 2000)
  if (!token.trim() || clean.length < 2) return false
  if (effectiveDataMode === 'local') {
    const db = readDatabase(); const index = db.buyerRooms.findIndex((item) => item.shareToken === token && item.shareEnabled && item.status !== 'archived')
    if (index < 0) return false
    const room = normalizeBuyerRoom(db.buyerRooms[index]); const now = new Date().toISOString()
    room.activity = [...room.activity, { id: createId('room-event'), type: 'comment', actorName: actorName.trim() || 'Comprador', description: clean, occurredAt: now, metadata: { public: true } }]
    room.updatedAt = now; db.buyerRooms[index] = room; writeDatabase(db); return true
  }
  const client = getSupabaseClient() as any; if (!client) return false
  const { data, error } = await client.rpc('add_buyer_room_public_comment', { p_share_token: token, p_message: clean, p_actor_name: actorName })
  if (error) throw error
  return Boolean(data)
}
