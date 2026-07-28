import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_WORKSPACE } from '../domain/defaults'
import { calculateProposalLine, calculateRevenueForecast } from '../services/revenue-forecast'
import { LocalCrmRepository } from './local-crm-repository'

const proposalInput = (calculation: ReturnType<typeof calculateProposalLine>, productId: string) => ({
  workspaceId: DEMO_WORKSPACE.id,
  leadId: 'lead-alpha',
  opportunityId: 'opportunity-alpha',
  companyId: 'company-alpha',
  contactId: 'contact-alpha',
  title: 'Proposta homologação',
  status: 'draft' as const,
  forecastCategory: 'commit' as const,
  probability: 80,
  currency: 'BRL' as const,
  subtotal: calculation.lineSubtotal,
  discountTotal: calculation.lineDiscount,
  taxTotal: calculation.lineTax,
  total: calculation.lineTotal,
  recurringMonthlyTotal: 0,
  oneTimeTotal: calculation.lineTotal,
  annualRecurringTotal: 0,
  totalContractValue: calculation.lineTotal,
  isOfficial: true,
  isCurrentVersion: true,
  expectedCloseAt: '2026-08-15',
  contractStartAt: '2026-08-20',
  contractEndAt: '2027-08-19',
  contractTermMonths: 12,
  autoRenew: true,
  postSaleStartAt: '2026-08-20',
  postSaleCadenceName: 'Onboarding padrão',
  validUntil: '2026-08-10',
  ownerId: null,
  notes: '',
  terms: '',
  items: [{ id: 'item-test', productId, name: 'Implantação', description: '', billingType: 'one_time' as const, billingInterval: null, ...calculation }],
})

describe('consolidação comercial local V100.44', () => {
  beforeEach(() => localStorage.clear())

  it('separa aceite, fechamento e reconhecimento de receita', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const product = (await repository.listProducts(DEMO_WORKSPACE.id))[0]
    const calculation = calculateProposalLine({ quantity: 1, unitPrice: 2500, discountPercent: 10, taxRate: 0, billingType: 'one_time', billingInterval: null })
    const proposal = await repository.createProposal(proposalInput(calculation, product.id))

    await repository.updateProposalStatus(proposal.id, 'sent')
    await repository.updateProposalStatus(proposal.id, 'accepted')
    let snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    expect(snapshot.leads.find((lead) => lead.id === 'lead-alpha')?.status).toBe('active')
    expect(snapshot.revenueEntries.filter((entry) => entry.proposalId === proposal.id)).toHaveLength(0)

    await repository.closeOpportunityFromProposal(proposal.id)
    snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    expect(snapshot.leads.find((lead) => lead.id === 'lead-alpha')?.status).toBe('won')
    expect(snapshot.revenueEntries.filter((entry) => entry.proposalId === proposal.id)).toHaveLength(0)

    await repository.createRevenueEntry({
      workspaceId: DEMO_WORKSPACE.id,
      proposalId: proposal.id,
      leadId: proposal.leadId,
      opportunityId: proposal.opportunityId,
      revenueType: 'one_time',
      status: 'recognized',
      amount: 2250,
      recurringMonthlyAmount: 0,
      recognizedAt: '2026-08-20T12:00:00.000Z',
      competenceDate: '2026-08-20',
      servicePeriodStart: null,
      servicePeriodEnd: null,
      adjustmentReason: '',
      description: 'Implantação reconhecida',
      ownerId: null,
    })
    snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    expect(snapshot.revenueEntries.filter((entry) => entry.proposalId === proposal.id)).toHaveLength(1)
    expect(snapshot.revenueEntries.find((entry) => entry.proposalId === proposal.id)?.amount).toBe(2250)
  })

  it('mantém uma revisão vigente e evita dupla contagem no forecast', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const product = (await repository.listProducts(DEMO_WORKSPACE.id))[0]
    const calculation = calculateProposalLine({ quantity: 1, unitPrice: 2500, discountPercent: 0, taxRate: 0, billingType: 'one_time', billingInterval: null })
    const original = await repository.createProposal(proposalInput(calculation, product.id))
    const revision = await repository.createProposalRevision(original.id)
    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    const first = snapshot.proposals.find((item) => item.id === original.id)
    const current = snapshot.proposals.find((item) => item.id === revision.id)

    expect(first?.isCurrentVersion).toBe(false)
    expect(first?.isOfficial).toBe(false)
    expect(current?.isCurrentVersion).toBe(true)
    expect(current?.isOfficial).toBe(true)
    expect(current?.proposalNumber).toBe(first?.proposalNumber)
    expect(current?.version).toBe(2)

    const forecast = calculateRevenueForecast(snapshot, new Date('2026-08-01T12:00:00.000Z'))
    expect(forecast.proposals.filter((item) => item.proposalGroupId === original.proposalGroupId)).toHaveLength(1)
  })
  it('redefine a proposta oficial quando a vigente é cancelada', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const product = (await repository.listProducts(DEMO_WORKSPACE.id))[0]
    const calculation = calculateProposalLine({ quantity: 1, unitPrice: 1800, discountPercent: 0, taxRate: 0, billingType: 'one_time', billingInterval: null })
    const proposal = await repository.createProposal(proposalInput(calculation, product.id))

    await repository.updateProposalStatus(proposal.id, 'cancelled')
    const snapshot = await repository.getSnapshot(DEMO_WORKSPACE.id)
    const fallback = snapshot.proposals.find((item) => item.leadId === proposal.leadId && item.isOfficial && item.isCurrentVersion)
    const opportunity = snapshot.opportunities.find((item) => item.id === proposal.opportunityId)

    expect(fallback).toBeTruthy()
    expect(fallback?.id).not.toBe(proposal.id)
    expect(opportunity?.officialProposalId).toBe(fallback?.id)
    expect(opportunity?.value).toBe(fallback?.totalContractValue)
  })

  it('preserva a auditoria depois do envio e protege a proposta oficial', async () => {
    const repository = new LocalCrmRepository()
    await repository.initialize()
    const product = (await repository.listProducts(DEMO_WORKSPACE.id))[0]
    const calculation = calculateProposalLine({ quantity: 1, unitPrice: 1900, discountPercent: 0, taxRate: 0, billingType: 'one_time', billingInterval: null })
    const proposal = await repository.createProposal(proposalInput(calculation, product.id))

    await repository.updateProposalStatus(proposal.id, 'sent')
    await expect(repository.updateProposal(proposal.id, { title: 'Alteração indevida' })).rejects.toThrow('imutáveis')
    await expect(repository.deleteProposal(proposal.id)).rejects.toThrow('oficial')
  })

})
