import type { CompanyRecord, ContactRecord, Lead, OpportunityRecord } from '../../domain/types'

export type CanonicalCommercialObjectKey = 'person' | 'company' | 'opportunity'
export type CanonicalResolutionSource = 'explicit-link' | 'inverse-link' | 'identity-match' | 'missing'

export interface CanonicalCommercialLink {
  leadId: string
  workspaceId: string
  personId: string | null
  companyId: string | null
  opportunityId: string | null
  source: {
    person: CanonicalResolutionSource
    company: CanonicalResolutionSource
    opportunity: CanonicalResolutionSource
  }
}

export type CanonicalIssueCode =
  | 'missing_person'
  | 'missing_company'
  | 'missing_opportunity'
  | 'workspace_mismatch'
  | 'relation_mismatch'
  | 'ambiguous_identity'

export interface CanonicalIssue {
  severity: 'error' | 'warning'
  code: CanonicalIssueCode
  leadId: string
  object: CanonicalCommercialObjectKey | 'lead'
  recordId?: string
  message: string
}

export interface CanonicalCommercialGraph {
  version: '101.9.3'
  persons: Map<string, ContactRecord>
  companies: Map<string, CompanyRecord>
  opportunities: Map<string, OpportunityRecord>
  links: Map<string, CanonicalCommercialLink>
  issues: CanonicalIssue[]
}

export interface CanonicalCommercialInspection {
  version: '101.9.3'
  authority: {
    person: 'ContactRecord'
    company: 'CompanyRecord'
    opportunity: 'OpportunityRecord'
    lead: 'legacy-projection'
  }
  counts: {
    leads: number
    persons: number
    companies: number
    opportunities: number
    fullyCanonical: number
    legacyFallbacks: number
    projectedLeadsChanged: number
  }
  issues: CanonicalIssue[]
  links: CanonicalCommercialLink[]
}

export interface CanonicalProjectionResult {
  lead: Lead
  changed: boolean
  link: CanonicalCommercialLink
}
