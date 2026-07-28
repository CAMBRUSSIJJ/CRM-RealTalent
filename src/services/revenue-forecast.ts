import type { ForecastCategory, ProposalLineItem, ProposalRecord, WorkspaceSnapshot } from '../domain/types'

export const calculateProposalLine = (item: Pick<ProposalLineItem, 'quantity' | 'unitPrice' | 'discountPercent' | 'taxRate' | 'billingType' | 'billingInterval'>) => {
  const quantity = Math.max(0.01, Number(item.quantity || 1))
  const unitPrice = Math.max(0, Number(item.unitPrice || 0))
  const discountPercent = Math.min(100, Math.max(0, Number(item.discountPercent || 0)))
  const taxRate = Math.max(0, Number(item.taxRate || 0))
  const lineSubtotal = quantity * unitPrice
  const lineDiscount = lineSubtotal * discountPercent / 100
  const taxable = lineSubtotal - lineDiscount
  const lineTax = taxable * taxRate / 100
  const lineTotal = taxable + lineTax
  const recurringMonthlyTotal = item.billingType === 'recurring'
    ? lineTotal * (item.billingInterval === 'year' ? 1 / 12 : item.billingInterval === 'quarter' ? 1 / 3 : 1)
    : 0
  return { quantity, unitPrice, discountPercent, taxRate, lineSubtotal, lineDiscount, lineTax, lineTotal, recurringMonthlyTotal }
}

export const calculateProposalTotals = (items: ProposalLineItem[]) => items.reduce((totals, item) => {
  const line = calculateProposalLine(item)
  totals.subtotal += line.lineSubtotal
  totals.discountTotal += line.lineDiscount
  totals.taxTotal += line.lineTax
  totals.total += line.lineTotal
  totals.recurringMonthlyTotal += line.recurringMonthlyTotal
  return totals
}, { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0, recurringMonthlyTotal: 0 })

const monthKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const proposalCloseDate = (proposal: ProposalRecord, snapshot: WorkspaceSnapshot) => proposal.acceptedAt
  ?? snapshot.leads.find((lead) => lead.id === proposal.leadId)?.expectedCloseAt
  ?? proposal.validUntil
  ?? proposal.updatedAt

export interface ForecastCategorySummary {
  category: ForecastCategory
  proposals: number
  value: number
  weightedValue: number
  mrr: number
  weightedMrr: number
}

export function calculateRevenueForecast(snapshot: WorkspaceSnapshot, reference = new Date()) {
  const targetMonth = monthKey(reference)
  const proposals = snapshot.proposals.filter((proposal) => monthKey(proposalCloseDate(proposal, snapshot)) === targetMonth && !['rejected', 'cancelled', 'expired'].includes(proposal.status))
  const categories: ForecastCategory[] = ['pipeline', 'best_case', 'commit', 'closed', 'omitted']
  const byCategory = categories.map((category): ForecastCategorySummary => {
    const items = proposals.filter((proposal) => proposal.forecastCategory === category)
    return {
      category,
      proposals: items.length,
      value: items.reduce((sum, item) => sum + item.total, 0),
      weightedValue: items.reduce((sum, item) => sum + item.total * item.probability / 100, 0),
      mrr: items.reduce((sum, item) => sum + item.recurringMonthlyTotal, 0),
      weightedMrr: items.reduce((sum, item) => sum + item.recurringMonthlyTotal * item.probability / 100, 0),
    }
  })
  const recognized = snapshot.revenueEntries.filter((entry) => entry.status === 'recognized' && monthKey(entry.recognizedAt) === targetMonth)
  const closedRevenue = recognized.reduce((sum, item) => sum + item.amount, 0)
  const recognizedMrr = snapshot.revenueEntries.filter((entry) => entry.status === 'recognized' && entry.revenueType === 'recurring').reduce((sum, item) => sum + item.recurringMonthlyAmount, 0)
  const open = byCategory.filter((item) => !['closed', 'omitted'].includes(item.category))
  const weightedForecast = closedRevenue + open.reduce((sum, item) => sum + item.weightedValue, 0)
  const commitForecast = closedRevenue + byCategory.filter((item) => item.category === 'commit').reduce((sum, item) => sum + item.value, 0)
  const bestCaseForecast = commitForecast + byCategory.filter((item) => item.category === 'best_case').reduce((sum, item) => sum + item.value, 0)
  const pipelineTotal = open.reduce((sum, item) => sum + item.value, 0)
  const activeMrrForecast = recognizedMrr + open.reduce((sum, item) => sum + item.weightedMrr, 0)
  return { targetMonth, proposals, byCategory, recognized, closedRevenue, recognizedMrr, weightedForecast, commitForecast, bestCaseForecast, pipelineTotal, activeMrrForecast }
}

export function calculateRevenueSeries(snapshot: WorkspaceSnapshot, months = 6, reference = new Date()) {
  const output: Array<{ month: string; recognized: number; mrr: number; forecast: number }> = []
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth() - index, 1)
    const key = monthKey(date)
    const recognized = snapshot.revenueEntries.filter((entry) => entry.status === 'recognized' && monthKey(entry.recognizedAt) === key).reduce((sum, entry) => sum + entry.amount, 0)
    const mrr = snapshot.revenueEntries.filter((entry) => entry.status === 'recognized' && entry.revenueType === 'recurring' && monthKey(entry.recognizedAt) <= key).reduce((sum, entry) => sum + entry.recurringMonthlyAmount, 0)
    const forecast = snapshot.proposals.filter((proposal) => !['rejected', 'cancelled', 'expired'].includes(proposal.status) && monthKey(proposalCloseDate(proposal, snapshot)) === key).reduce((sum, proposal) => sum + proposal.total * proposal.probability / 100, 0)
    output.push({ month: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''), recognized, mrr, forecast })
  }
  return output
}
