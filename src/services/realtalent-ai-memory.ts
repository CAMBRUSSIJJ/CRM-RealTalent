import type { Lead, WorkspaceSnapshot } from '../domain/types'

export type AiMemorySource = 'lead' | 'contact' | 'activity' | 'call' | 'meeting' | 'proposal'
export interface CommercialMemoryFact {
  id: string
  leadId: string
  label: string
  value: string
  source: AiMemorySource
  sourceId?: string
  observedAt?: string | null
  freshness: 'current' | 'recent' | 'historical'
}

const ageBucket = (value?: string | null, now = new Date()): CommercialMemoryFact['freshness'] => {
  if (!value) return 'current'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 'historical'
  const days = Math.max(0, (now.getTime() - time) / 86_400_000)
  return days <= 14 ? 'current' : days <= 60 ? 'recent' : 'historical'
}

const compact = (value: string, max = 220) => value.replace(/\s+/g, ' ').trim().slice(0, max)

export const buildCommercialMemory = (snapshot: WorkspaceSnapshot, lead: Lead, now = new Date()): CommercialMemoryFact[] => {
  const facts: CommercialMemoryFact[] = []
  const stage = snapshot.stages.find((item) => item.id === lead.stageId)
  if (stage) facts.push({ id: `stage:${lead.id}`, leadId: lead.id, label: 'Etapa atual', value: stage.name, source: 'lead', sourceId: lead.id, observedAt: lead.updatedAt, freshness: 'current' })
  if (lead.notes?.trim()) facts.push({ id: `notes:${lead.id}`, leadId: lead.id, label: 'Notas comerciais', value: compact(lead.notes), source: 'lead', sourceId: lead.id, observedAt: lead.updatedAt, freshness: ageBucket(lead.updatedAt, now) })

  const contacts = snapshot.contacts.filter((contact) => contact.leadIds.includes(lead.id) || Boolean(lead.companyId && contact.companyId === lead.companyId))
  contacts.slice(0, 6).forEach((contact) => {
    const role = contact.decisionRole ? ` · ${contact.decisionRole.replaceAll('_', ' ')}` : ''
    facts.push({ id: `contact:${contact.id}`, leadId: lead.id, label: 'Stakeholder', value: `${contact.name}${role}${contact.jobTitle ? ` · ${contact.jobTitle}` : ''}`, source: 'contact', sourceId: contact.id, observedAt: contact.updatedAt ?? contact.createdAt, freshness: 'current' })
  })

  const activities = snapshot.activities
    .filter((item) => item.leadId === lead.id)
    .sort((a, b) => new Date(b.completedAt ?? b.dueAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.dueAt ?? a.createdAt).getTime())
    .slice(0, 5)
  activities.forEach((item) => {
    const at = item.completedAt ?? item.dueAt ?? item.createdAt
    facts.push({ id: `activity:${item.id}`, leadId: lead.id, label: item.completedAt ? 'Atividade concluída' : 'Atividade/Próximo passo', value: compact(`${item.title}${item.description ? ` — ${item.description}` : ''}`), source: 'activity', sourceId: item.id, observedAt: at, freshness: ageBucket(at, now) })
  })

  const calls = snapshot.calls.filter((item) => item.leadId === lead.id).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 3)
  calls.forEach((call) => facts.push({ id: `call:${call.id}`, leadId: lead.id, label: 'Ligação', value: compact(`${call.outcome ?? 'resultado não registrado'}${call.notes ? ` — ${call.notes}` : ''}`), source: 'call', sourceId: call.id, observedAt: call.startedAt, freshness: ageBucket(call.startedAt, now) }))

  const meetings = snapshot.events.filter((item) => item.leadId === lead.id).sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()).slice(0, 3)
  meetings.forEach((event) => facts.push({ id: `meeting:${event.id}`, leadId: lead.id, label: 'Reunião', value: compact(`${event.title}${event.description ? ` — ${event.description}` : ''}`), source: 'meeting', sourceId: event.id, observedAt: event.startsAt, freshness: ageBucket(event.startsAt, now) }))

  const proposals = snapshot.proposals.filter((item) => item.leadId === lead.id && item.isCurrentVersion).sort((a, b) => b.version - a.version).slice(0, 2)
  proposals.forEach((proposal) => facts.push({ id: `proposal:${proposal.id}`, leadId: lead.id, label: 'Proposta', value: `${proposal.title} · ${proposal.status}`, source: 'proposal', sourceId: proposal.id, observedAt: proposal.updatedAt ?? proposal.createdAt, freshness: ageBucket(proposal.updatedAt ?? proposal.createdAt, now) }))

  return facts.slice(0, 18)
}
