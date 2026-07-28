import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_WORKSPACE } from '../domain/defaults'
import { calculateProposalLine } from '../services/revenue-forecast'
import { LocalCrmRepository } from './local-crm-repository'

describe('propostas no repositório local V100.43', () => {
  beforeEach(() => localStorage.clear())

  it('aceita proposta, ganha o lead e reconhece receita uma única vez', async () => {
    const repository = new LocalCrmRepository(); await repository.initialize()
    const product = (await repository.listProducts(DEMO_WORKSPACE.id))[0]
    const calculation = calculateProposalLine({ quantity: 1, unitPrice: 2500, discountPercent: 10, taxRate: 0, billingType: 'one_time', billingInterval: null })
    const proposal = await repository.createProposal({
      workspaceId: DEMO_WORKSPACE.id, leadId: 'lead-alpha', opportunityId: null, companyId: null, contactId: null,
      title: 'Proposta homologação', status: 'draft', forecastCategory: 'commit', probability: 80, currency: 'BRL',
      subtotal: calculation.lineSubtotal, discountTotal: calculation.lineDiscount, taxTotal: calculation.lineTax,
      total: calculation.lineTotal, recurringMonthlyTotal: 0, validUntil: '2026-08-15', ownerId: null, notes: '', terms: '',
      items: [{ id: 'item-test', productId: product.id, name: product.name, description: '', quantity: 1, unitPrice: 2500, discountPercent: 10, taxRate: 0, billingType: 'one_time', billingInterval: null, ...calculation }],
    })
    await repository.updateProposalStatus(proposal.id, 'accepted')
    await repository.updateProposalStatus(proposal.id, 'accepted')
    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    expect(snapshot.leads.find((lead) => lead.id === 'lead-alpha')?.status).toBe('won')
    expect(snapshot.revenueEntries.filter((entry) => entry.proposalId === proposal.id)).toHaveLength(1)
    expect(snapshot.revenueEntries.find((entry) => entry.proposalId === proposal.id)?.amount).toBe(2250)
  })
})
