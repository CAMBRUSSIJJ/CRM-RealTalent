import type { ProposalRecord, RevenueEntry } from '../domain/types'
import type { CrmRepository, NewRevenueEntryInput } from '../repositories/crm-repository'

const isoDate = (value: Date) => {
  const copy = new Date(value)
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset())
  return copy.toISOString().slice(0, 10)
}

const addMonths = (dateOnly: string, months: number) => {
  const [year, month, day] = dateOnly.split('-').map(Number)
  const source = new Date(Date.UTC(year, Math.max(0, month - 1), day || 1, 12))
  source.setUTCMonth(source.getUTCMonth() + months)
  return source.toISOString().slice(0, 10)
}

const revenueBase = (proposal: ProposalRecord): Pick<NewRevenueEntryInput, 'workspaceId' | 'proposalId' | 'leadId' | 'opportunityId' | 'ownerId' | 'source'> => ({
  workspaceId: proposal.workspaceId,
  proposalId: proposal.id,
  leadId: proposal.leadId,
  opportunityId: proposal.opportunityId,
  ownerId: proposal.ownerId,
  source: 'proposal_schedule',
})

export const buildProposalRevenueSchedule = (proposal: ProposalRecord, now = new Date()): NewRevenueEntryInput[] => {
  const start = proposal.contractStartAt || proposal.acceptedAt?.slice(0, 10) || isoDate(now)
  const end = proposal.contractEndAt || null
  const entries: NewRevenueEntryInput[] = []
  const base = revenueBase(proposal)

  if (proposal.oneTimeTotal > 0) {
    entries.push({
      ...base,
      revenueType: 'one_time',
      status: 'forecast',
      amount: proposal.oneTimeTotal,
      recurringMonthlyAmount: 0,
      recognizedAt: new Date(`${start}T12:00:00`).toISOString(),
      competenceDate: start,
      servicePeriodStart: start,
      servicePeriodEnd: start,
      adjustmentReason: 'Plano automático criado a partir da proposta aceita.',
      description: `${proposal.proposalNumber} · valor inicial contratado`,
      scheduleKey: `${proposal.id}:one_time:${start}`,
      installmentIndex: 1,
      installmentCount: 1,
    })
  }

  if (proposal.recurringMonthlyTotal > 0) {
    const count = Math.max(1, Math.min(600, proposal.contractTermMonths || 12))
    for (let index = 0; index < count; index += 1) {
      const competence = addMonths(start, index)
      entries.push({
        ...base,
        revenueType: 'recurring',
        status: 'forecast',
        amount: proposal.recurringMonthlyTotal,
        recurringMonthlyAmount: proposal.recurringMonthlyTotal,
        recognizedAt: new Date(`${competence}T12:00:00`).toISOString(),
        competenceDate: competence,
        servicePeriodStart: competence,
        servicePeriodEnd: end,
        adjustmentReason: 'Plano automático criado a partir da proposta aceita.',
        description: `${proposal.proposalNumber} · competência ${index + 1}/${count}`,
        scheduleKey: `${proposal.id}:recurring:${competence}`,
        installmentIndex: index + 1,
        installmentCount: count,
      })
    }
  }

  return entries
}

export async function ensureProposalRevenueSchedule(repository: CrmRepository, proposal: ProposalRecord): Promise<RevenueEntry[]> {
  if (proposal.status !== 'accepted' && !proposal.closedWonAt) return []
  const plan = buildProposalRevenueSchedule(proposal)
  if (!plan.length) return []
  const existing = await repository.listRevenueEntries(proposal.workspaceId)
  const existingKeys = new Set(existing.map((entry) => entry.scheduleKey).filter(Boolean))
  const created: RevenueEntry[] = []
  for (const row of plan) {
    if (row.scheduleKey && existingKeys.has(row.scheduleKey)) continue
    const entry = await repository.createRevenueEntry(row)
    created.push(entry)
    if (entry.scheduleKey) existingKeys.add(entry.scheduleKey)
  }
  return created
}
