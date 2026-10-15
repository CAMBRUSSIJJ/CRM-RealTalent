import type { BuyerRoom, BuyerRoomActivity, BuyerRoomDocument, BuyerRoomParticipant, BuyerRoomStep, ContactRecord, ProposalRecord, WorkspaceSnapshot } from '../domain/types'
import { createId } from '../lib/id'

const nowIso = () => new Date().toISOString()

export const createBuyerRoomShareToken = () => {
  const bytes = new Uint8Array(24)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export const buyerRoomProgress = (room: BuyerRoom) => {
  if (!room.steps.length) return 0
  return Math.round(room.steps.filter((step) => step.status === 'completed').length / room.steps.length * 100)
}

export const buyerRoomStatusFromProgress = (room: BuyerRoom): BuyerRoom['status'] => {
  if (room.status === 'archived') return 'archived'
  const progress = buyerRoomProgress(room)
  if (progress === 100 && room.steps.length) return 'completed'
  if (room.shareEnabled && room.viewCount > 0) return 'active'
  if (room.shareEnabled) return 'shared'
  return 'draft'
}

export const normalizeBuyerRoom = (room: BuyerRoom): BuyerRoom => {
  const steps = Array.isArray(room.steps) ? room.steps
    .map((step, index) => ({
      ...step,
      title: String(step.title ?? '').trim(),
      description: String(step.description ?? '').trim(),
      order: Number.isFinite(Number(step.order)) ? Number(step.order) : index + 1,
      owner: ['seller', 'buyer', 'shared'].includes(step.owner) ? step.owner : 'shared',
      ownerContactId: step.ownerContactId ?? null,
      dueAt: step.dueAt ?? null,
      completedAt: step.status === 'completed' ? step.completedAt ?? nowIso() : null,
      status: ['pending', 'in_progress', 'completed', 'blocked'].includes(step.status) ? step.status : 'pending',
    }))
    .filter((step) => step.title)
    .sort((left, right) => left.order - right.order)
    .map((step, index) => ({ ...step, order: index + 1 })) : []
  const participants = Array.isArray(room.participants) ? room.participants.filter((item) => item?.name).map((item) => ({ ...item, contactId: item.contactId ?? null, email: item.email ?? '', jobTitle: item.jobTitle ?? '', required: Boolean(item.required), acknowledgedAt: item.acknowledgedAt ?? null })) : []
  const documents = Array.isArray(room.documents) ? room.documents.filter((item) => item?.title).map((item) => ({ ...item, url: item.url ?? '', proposalId: item.proposalId ?? null, visible: item.visible !== false, addedAt: item.addedAt ?? nowIso() })) : []
  const activity = Array.isArray(room.activity) ? room.activity.slice(-250).map((item) => ({ ...item, actorName: item.actorName || 'Sistema', description: item.description || '', occurredAt: item.occurredAt ?? nowIso(), metadata: item.metadata ?? {} })) : []
  const normalized = { ...room, title: String(room.title ?? '').trim() || 'Sala de fechamento', welcomeMessage: String(room.welcomeMessage ?? '').trim(), shareToken: String(room.shareToken ?? ''), shareEnabled: Boolean(room.shareEnabled), expiresAt: room.expiresAt ?? null, lastOpenedAt: room.lastOpenedAt ?? null, viewCount: Math.max(0, Number(room.viewCount ?? 0)), participants, steps, documents, activity }
  return { ...normalized, status: buyerRoomStatusFromProgress(normalized) }
}

const participantFromContact = (contact: ContactRecord): BuyerRoomParticipant => ({
  id: createId('room-participant'), contactId: contact.id, name: contact.name, email: contact.email, jobTitle: contact.jobTitle,
  decisionRole: contact.decisionRole, side: 'buyer', required: ['decision_maker', 'economic_buyer', 'finance', 'procurement'].includes(contact.decisionRole), acknowledgedAt: null,
})

export const buildBuyerRoomDraft = (proposal: ProposalRecord, snapshot: WorkspaceSnapshot): Omit<BuyerRoom, 'id' | 'createdAt' | 'updatedAt' | 'viewCount' | 'lastOpenedAt' | 'activity'> & { activity?: BuyerRoomActivity[] } => {
  const lead = snapshot.leads.find((item) => item.id === proposal.leadId)
  const contacts = snapshot.contacts
    .filter((contact) => proposal.companyId ? contact.companyId === proposal.companyId : contact.leadIds.includes(proposal.leadId))
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || right.influenceLevel - left.influenceLevel)
    .slice(0, 8)
  const participants: BuyerRoomParticipant[] = contacts.map(participantFromContact)
  participants.unshift({ id: createId('room-participant'), contactId: null, name: lead?.ownerName || 'Equipe RealTalent', email: '', jobTitle: 'Responsável comercial', decisionRole: 'seller', side: 'seller', required: true, acknowledgedAt: nowIso() })
  const steps: BuyerRoomStep[] = [
    { id: createId('room-step'), title: 'Revisar proposta e escopo', description: 'Validar escopo, investimento e condições comerciais apresentados.', owner: 'buyer', ownerContactId: proposal.contactId, dueAt: proposal.validUntil, status: proposal.status === 'accepted' || proposal.closedWonAt ? 'completed' : proposal.status === 'viewed' ? 'in_progress' : 'pending', completedAt: proposal.status === 'accepted' || proposal.closedWonAt ? proposal.acceptedAt ?? proposal.closedWonAt : null, order: 1 },
    { id: createId('room-step'), title: 'Confirmar aprovação financeira', description: 'Registrar aprovação do responsável econômico/financeiro.', owner: 'buyer', ownerContactId: contacts.find((contact) => ['economic_buyer', 'finance'].includes(contact.decisionRole))?.id ?? null, dueAt: proposal.expectedCloseAt, status: proposal.status === 'accepted' || proposal.closedWonAt ? 'completed' : 'pending', completedAt: proposal.status === 'accepted' || proposal.closedWonAt ? proposal.acceptedAt ?? proposal.closedWonAt : null, order: 2 },
    { id: createId('room-step'), title: 'Formalizar aceite', description: 'Confirmar o aceite final da proposta comercial.', owner: 'shared', ownerContactId: proposal.contactId, dueAt: proposal.expectedCloseAt, status: proposal.status === 'accepted' || proposal.closedWonAt ? 'completed' : 'pending', completedAt: proposal.acceptedAt ?? null, order: 3 },
    { id: createId('room-step'), title: 'Agendar kickoff / implantação', description: 'Alinhar o início do pós-venda e responsáveis pela implantação.', owner: 'seller', ownerContactId: null, dueAt: proposal.postSaleStartAt, status: proposal.closedWonAt ? 'in_progress' : 'pending', completedAt: null, order: 4 },
  ]
  const documents: BuyerRoomDocument[] = [{ id: createId('room-document'), kind: 'proposal', title: `${proposal.proposalNumber} · ${proposal.title}`, url: '', proposalId: proposal.id, visible: true, addedAt: nowIso() }]
  return {
    workspaceId: proposal.workspaceId, leadId: proposal.leadId, opportunityId: proposal.opportunityId, proposalId: proposal.id, companyId: proposal.companyId,
    title: `${lead?.company || lead?.name || 'Cliente'} × RealTalent`,
    welcomeMessage: `Este espaço reúne a proposta, responsáveis e próximos passos para avançarmos com clareza até o fechamento.`,
    status: 'draft', shareToken: createBuyerRoomShareToken(), shareEnabled: false, expiresAt: proposal.validUntil ? `${proposal.validUntil}T23:59:59.999Z` : null,
    participants, steps, documents,
    activity: [{ id: createId('room-event'), type: 'created', actorName: lead?.ownerName || 'Equipe RealTalent', description: 'Buyer Room criada a partir da proposta.', occurredAt: nowIso(), metadata: { proposalId: proposal.id } }],
  }
}

export const appendBuyerRoomActivity = (room: BuyerRoom, event: Omit<BuyerRoomActivity, 'id' | 'occurredAt'> & { occurredAt?: string }): BuyerRoom => normalizeBuyerRoom({
  ...room,
  activity: [...room.activity, { ...event, id: createId('room-event'), occurredAt: event.occurredAt ?? nowIso() }],
  updatedAt: nowIso(),
})

export const buyerRoomPublicUrl = (token: string) => {
  if (typeof window === 'undefined') return `?buyer-room=${encodeURIComponent(token)}`
  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('buyer-room', token)
  return url.toString()
}


export const buyerRoomPatchForProposal = (room: BuyerRoom, proposal: ProposalRecord) => {
  const accepted = proposal.status === 'accepted' || Boolean(proposal.closedWonAt)
  const viewed = proposal.status === 'viewed' || accepted
  const now = nowIso()
  const steps = room.steps.map((step) => {
    if (step.order <= 3 && accepted) return { ...step, status: 'completed' as const, completedAt: step.completedAt ?? proposal.acceptedAt ?? proposal.closedWonAt ?? now }
    if (step.order === 1 && viewed && step.status === 'pending') return { ...step, status: 'in_progress' as const }
    if (step.order === 4 && proposal.closedWonAt && step.status === 'pending') return { ...step, status: 'in_progress' as const }
    return step
  })
  const documents = room.documents.map((document) => document.kind === 'proposal' ? { ...document, title: `${proposal.proposalNumber} · ${proposal.title}`, proposalId: proposal.id } : document)
  return {
    leadId: proposal.leadId,
    opportunityId: proposal.opportunityId,
    proposalId: proposal.id,
    companyId: proposal.companyId,
    expiresAt: proposal.validUntil ? `${proposal.validUntil}T23:59:59.999Z` : room.expiresAt,
    steps,
    documents,
    status: buyerRoomStatusFromProgress({ ...room, steps, documents }),
  }
}
