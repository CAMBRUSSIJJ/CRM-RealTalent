import { effectiveDataMode } from '../lib/env'
import type { CrmRepository } from './crm-repository'
import { LocalCrmRepository } from './local-crm-repository'
import { SupabaseCrmRepository } from './supabase-crm-repository'

export const createRepository = (): CrmRepository =>
  effectiveDataMode === 'supabase' ? new SupabaseCrmRepository() : new LocalCrmRepository()
