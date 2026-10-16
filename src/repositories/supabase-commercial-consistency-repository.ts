import type { Lead } from '../domain/types'
import { SupabaseCrmRepository } from './supabase-crm-repository'

/**
 * Compatibility boundary for legacy Supabase stage-move RPCs.
 *
 * move_lead_with_reason persists the legacy lead + stage-change activity, while the
 * current commercial model treats OpportunityRecord as the canonical authority for
 * stage/status. Until the database RPC can be upgraded in a controlled Supabase
 * environment, immediately reconcile the canonical opportunity through updateLead.
 * This keeps Preview correct without applying DDL to the production database.
 */
export class SupabaseCommercialConsistencyRepository extends SupabaseCrmRepository {
  override async moveLead(leadId: string, stageId: string, lossReason?: string | null): Promise<Lead> {
    const moved = await super.moveLead(leadId, stageId, lossReason)
    return super.updateLead(leadId, {
      stageId: moved.stageId,
      status: moved.status,
    })
  }
}
