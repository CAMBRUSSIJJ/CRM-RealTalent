import type { Lead, OpportunityRecord, ProposalRecord } from './types'

/**
 * Valor comercial de um contato, igual em todas as telas (Contatos, Pipeline, Propostas):
 * proposta oficial vigente → oportunidade → valor cadastrado no contato.
 */
export function buildCommercialValueResolver(opportunities: OpportunityRecord[] = [], proposals: ProposalRecord[] = []) {
  const opportunityByLead = new Map(opportunities.map((opportunity) => [opportunity.leadId, opportunity]))
  const proposalByLead = new Map<string, ProposalRecord>()
  for (const proposal of proposals) {
    if (!proposal.isOfficial || !proposal.isCurrentVersion || ['rejected', 'cancelled', 'expired'].includes(proposal.status)) continue
    proposalByLead.set(proposal.leadId, proposal)
  }
  return (lead: Pick<Lead, 'id' | 'value'>) => proposalByLead.get(lead.id)?.totalContractValue ?? opportunityByLead.get(lead.id)?.value ?? lead.value
}
