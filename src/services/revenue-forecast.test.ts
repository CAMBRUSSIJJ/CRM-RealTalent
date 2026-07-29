import { describe, expect, it } from 'vitest'
import { DEMO_PROPOSALS, DEMO_PRODUCTS, DEMO_REVENUE_ENTRIES, DEMO_WORKSPACE } from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'
import { calculateProposalLine, calculateProposalTotals, calculateRevenueForecast } from './revenue-forecast'

describe('propostas e forecast', () => {
  it('calcula desconto, imposto e MRR da linha', () => {
    const line = calculateProposalLine({ quantity: 2, unitPrice: 100, discountPercent: 10, taxRate: 5, billingType: 'recurring', billingInterval: 'quarter' })
    expect(line.lineSubtotal).toBe(200)
    expect(line.lineDiscount).toBe(20)
    expect(line.lineTax).toBe(9)
    expect(line.lineTotal).toBe(189)
    expect(line.recurringMonthlyTotal).toBe(63)
  })

  it('soma os itens de uma proposta', () => {
    const product = DEMO_PRODUCTS[0]
    const items = [{ id: 'item', productId: product.id, name: product.name, description: '', quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 0, billingType: 'one_time' as const, billingInterval: null, lineSubtotal: 0, lineDiscount: 0, lineTax: 0, lineTotal: 0, recurringMonthlyTotal: 0 }]
    expect(calculateProposalTotals(items).total).toBe(100)
  })

  it('separa receita fechada e forecast ponderado', () => {
    const snapshot = { workspace: DEMO_WORKSPACE, stages: [], leads: [], activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [], companies: [], contacts: [], opportunities: [], socialProfiles: [], products: DEMO_PRODUCTS, proposals: DEMO_PROPOSALS, revenueEntries: DEMO_REVENUE_ENTRIES } as WorkspaceSnapshot
    const forecast = calculateRevenueForecast(snapshot, new Date('2026-07-16T12:00:00.000Z'))
    expect(forecast.closedRevenue).toBeGreaterThan(0)
    expect(forecast.weightedForecast).toBeGreaterThanOrEqual(forecast.closedBookings)
  })
})
