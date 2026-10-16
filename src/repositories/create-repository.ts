import { effectiveDataMode } from '../lib/env'
import type { CrmRepository } from './crm-repository'
import { LocalCrmRepository } from './local-crm-repository'
import { SupabaseCommercialConsistencyRepository } from './supabase-commercial-consistency-repository'
import { withCommercialRelationConsistency } from './commercial-relation-consistency-repository'

export const createRepository = (): CrmRepository => {
  const repository: CrmRepository = effectiveDataMode === 'supabase'
    ? new SupabaseCommercialConsistencyRepository()
    : new LocalCrmRepository()
  return withCommercialRelationConsistency(repository)
}
