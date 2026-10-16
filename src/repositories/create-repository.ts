import { effectiveDataMode } from '../lib/env'
import type { CrmRepository } from './crm-repository'
import { LocalCrmRepository } from './local-crm-repository'
import { SupabaseCommercialConsistencyRepository } from './supabase-commercial-consistency-repository'

export const createRepository = (): CrmRepository =>
  effectiveDataMode === 'supabase' ? new SupabaseCommercialConsistencyRepository() : new LocalCrmRepository()
