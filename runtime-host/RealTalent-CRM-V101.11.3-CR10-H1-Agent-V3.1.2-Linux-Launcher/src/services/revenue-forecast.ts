import type { ForecastCategory, ProposalRecord, RevenueEntry, WorkspaceSnapshot } from '../domain/types'

export { calculateProposalLine, calculateProposalTotals } from './proposal-pricing'
import { calculateProposalLine, calculateProposalTotals } from './proposal-pricing'

const monthKey = (value: string | Date | null | undefined) => {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7)
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const officialCurrentProposals = (snapshot: WorkspaceSnapshot) => snapshot.proposals.filter((proposal) => proposal.isOfficial && proposal.isCurrentVersion)

const opportunityForProposal = (proposal: ProposalRecord, snapshot: WorkspaceSnapshot) => snapshot.opportunities.find((opportunity) => opportunity.id === proposal.opportunityId || opportunity.leadId === proposal.leadId)

const proposalCloseDate = (proposal: ProposalRecord, snapshot: WorkspaceSnapshot) => {
  const opportunity = opportunityForProposal(proposal, snapshot)
  return proposal.closedWonAt ?? opportunity?.closedWonAt ?? opportunity?.expectedCloseAt ?? proposal.expectedCloseAt
}

const categoryForProposal = (proposal: ProposalRecord, snapshot: WorkspaceSnapshot): ForecastCategory => opportunityForProposal(proposal, snapshot)?.forecastCategory ?? proposal.forecastCategory
const probabilityForProposal = (proposal: ProposalRecord, snapshot: WorkspaceSnapshot) => Math.min(100, Math.max(0, opportunityForProposal(proposal, snapshot)?.probability ?? proposal.probability))

export interface ForecastCategorySummary {
  category: ForecastCategory
  proposals: number
  value: number
  weightedValue: number
  mrr: number
  weightedMrr: number
  arr: number
  weightedArr: number
  oneTime: number
}

const revenueMonth = (entry: RevenueEntry) => monthKey(entry.competenceDate || entry.recognizedAt)

const activeRecurringEntriesAt = (entries: RevenueEntry[], key: string) => {
  const candidates = entries.filter((entry) => entry.status === 'recognized' && entry.revenueType === 'recurring' && revenueMonth(entry) <= key && (!entry.servicePeriodStart || monthKey(entry.servicePeriodStart) <= key) && (!entry.servicePeriodEnd || monthKey(entry.servicePeriodEnd) >= key))
  const latest = new Map<string, RevenueEntry>()
  for (const entry of candidates) {
    const identity = entry.proposalId ?? entry.leadId ?? entry.id
    const current = latest.get(identity)
    if (!current || new Date(entry.recognizedAt).getTime() > new Date(current.recognizedAt).getTime()) latest.set(identity, entry)
  }
  return [...latest.values()]
}

export function calculateRevenueForecast(snapshot: WorkspaceSnapshot, reference = new Date()) {
  const targetMonth = monthKey(reference)
  const proposals = officialCurrentProposals(snapshot).filter((proposal) => {
    if (['rejected', 'cancelled', 'expired'].includes(proposal.status)) return false
    return monthKey(proposalCloseDate(proposal, snapshot)) === targetMonth
  })
  const categories: ForecastCategory[] = ['pipeline', 'best_case', 'commit', 'closed', 'omitted']
  const byCategory = categories.map((category): ForecastCategorySummary => {
    const items = proposals.filter((proposal) => categoryForProposal(proposal, snapshot) === category)
    return {
      category,
      proposals: items.length,
      value: items.reduce((sum, item) => sum + item.totalContractValue, 0),
      weightedValue: items.reduce((sum, item) => sum + item.totalContractValue * probabilityForProposal(item, snapshot) / 100, 0),
      mrr: items.reduce((sum, item) => sum + item.recurringMonthlyTotal, 0),
      weightedMrr: items.reduce((sum, item) => sum + item.recurringMonthlyTotal * probabilityForProposal(item, snapshot) / 100, 0),
      arr: items.reduce((sum, item) => sum + item.annualRecurringTotal, 0),
      weightedArr: items.reduce((sum, item) => sum + item.annualRecurringTotal * probabilityForProposal(item, snapshot) / 100, 0),
      oneTime: items.reduce((sum, item) => sum + item.oneTimeTotal, 0),
    }
  })
  const recognized = snapshot.revenueEntries.filter((entry) => entry.status === 'recognized' && revenueMonth(entry) === targetMonth)
  const closedRevenue = recognized.reduce((sum, item) => sum + item.amount, 0)
  const recognizedMrr = activeRecurringEntriesAt(snapshot.revenueEntries, targetMonth).reduce((sum, item) => sum + item.recurringMonthlyAmount, 0)
  const open = byCategory.filter((item) => !['closed', 'omitted'].includes(item.category))
  const closedBookings = byCategory.filter((item) => item.category === 'closed').reduce((sum, item) => sum + item.value, 0)
  const weightedForecast = closedBookings + open.reduce((sum, item) => sum + item.weightedValue, 0)
  const commitForecast = closedBookings + byCategory.filter((item) => item.category === 'commit').reduce((sum, item) => sum + item.value, 0)
  const bestCaseForecast = commitForecast + byCategory.filter((item) => item.category === 'best_case').reduce((sum, item) => sum + item.value, 0)
  const pipelineTotal = open.reduce((sum, item) => sum + item.value, 0)
  const weightedMrr = open.reduce((sum, item) => sum + item.weightedMrr, 0)
  const weightedArr = open.reduce((sum, item) => sum + item.weightedArr, 0)
  const oneTimeForecast = open.reduce((sum, item) => sum + item.oneTime, 0)
  const activeMrrForecast = recognizedMrr + weightedMrr
  return { targetMonth, proposals, byCategory, recognized, closedRevenue, closedBookings, recognizedMrr, weightedForecast, commitForecast, bestCaseForecast, pipelineTotal, activeMrrForecast, weightedMrr, weightedArr, oneTimeForecast }
}

export function calculateRevenueSeries(snapshot: WorkspaceSnapshot, months = 6, reference = new Date()) {
  const output: Array<{ month: string; recognized: number; mrr: number; forecast: number }> = []
  const official = officialCurrentProposals(snapshot)
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth() - index, 1)
    const key = monthKey(date)
    const recognized = snapshot.revenueEntries.filter((entry) => entry.status === 'recognized' && revenueMonth(entry) === key).reduce((sum, entry) => sum + entry.amount, 0)
    const mrr = activeRecurringEntriesAt(snapshot.revenueEntries, key).reduce((sum, entry) => sum + entry.recurringMonthlyAmount, 0)
    const forecast = official.filter((proposal) => !['rejected', 'cancelled', 'expired'].includes(proposal.status) && monthKey(proposalCloseDate(proposal, snapshot)) === key && !['closed', 'omitted'].includes(categoryForProposal(proposal, snapshot))).reduce((sum, proposal) => sum + proposal.totalContractValue * probabilityForProposal(proposal, snapshot) / 100, 0)
    output.push({ month: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''), recognized, mrr, forecast })
  }
  return output
}
