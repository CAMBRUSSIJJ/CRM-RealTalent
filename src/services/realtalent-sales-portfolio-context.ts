import type { WorkspaceSnapshot } from '../domain/types'
import type { AssistantContext, AssistantResultItem } from './realtalent-assistant'
import { buildSalesPortfolioSelection, type SalesPortfolioFocus } from './realtalent-sales-intelligence-agent'

const FOCUS_BY_CAPABILITY: Partial<Record<string, SalesPortfolioFocus>> = {
  'sales.prioritize_pipeline': 'priorities',
  'sales.call_priorities': 'calls',
  'sales.at_risk_deals': 'risk',
  'sales.cooling_deals': 'cooling',
  'sales.missing_decision_maker': 'decision_maker',
  'sales.closing_risk_this_month': 'closing_risk',
}

const visibleLeadIds = (snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  if (snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin') return new Set(snapshot.leads.map((lead) => lead.id))
  if (!context.currentUserId) return new Set<string>()
  return new Set(snapshot.leads.filter((lead) => lead.ownerId === context.currentUserId).map((lead) => lead.id))
}

export const salesPortfolioItemsForCapability = (
  capabilityId: string,
  snapshot: WorkspaceSnapshot,
  context: AssistantContext,
  limit = 7,
): AssistantResultItem[] => {
  const focus = FOCUS_BY_CAPABILITY[capabilityId]
  if (!focus) return []
  const allowed = visibleLeadIds(snapshot, context)
  const visibleSnapshot: WorkspaceSnapshot = { ...snapshot, leads: snapshot.leads.filter((lead) => allowed.has(lead.id)) }
  const { deals } = buildSalesPortfolioSelection(visibleSnapshot, focus, context.now ?? new Date())

  return deals.slice(0, limit).map((deal, index) => ({
    id: `deal:${deal.lead.id}`,
    kind: 'deal',
    leadId: deal.lead.id,
    title: deal.lead.company || deal.lead.name,
    subtitle: `#${index + 1} · ${deal.lead.name} · Health ${deal.healthScore}/100 · Prob. ${deal.realTalentProbability}%`,
    score: deal.healthScore,
    value: deal.commercialValue,
    reason: deal.risks[0]?.detail || deal.nextBestAction.explanation,
    route: deal.nextBestAction.route,
    action: deal.nextBestAction.kind,
    proposalId: deal.proposal?.id,
  }))
}
