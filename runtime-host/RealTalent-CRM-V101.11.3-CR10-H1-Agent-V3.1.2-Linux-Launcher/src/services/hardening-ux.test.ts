import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAGES, DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACTS,
  DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_PRODUCTS, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES,
  DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE,
} from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'
import { searchWorkspace } from './global-search'
import { searchHelpArticles } from './help-center'

const snapshot: WorkspaceSnapshot = {
  workspace: DEMO_WORKSPACE,
  stages: DEFAULT_STAGES,
  leads: DEMO_LEADS,
  activities: DEMO_ACTIVITIES,
  calls: DEMO_CALLS,
  events: DEMO_EVENTS,
  playbooks: DEMO_PLAYBOOKS,
  goals: DEMO_GOALS,
  automationRules: DEMO_AUTOMATION_RULES,
  automationRuns: DEMO_AUTOMATION_RUNS,
  companies: DEMO_COMPANIES,
  contacts: DEMO_CONTACTS,
  contactRelationships: [],
  opportunities: DEMO_OPPORTUNITIES,
  socialProfiles: DEMO_SOCIAL_PROFILES,
  products: DEMO_PRODUCTS,
  proposals: DEMO_PROPOSALS,
  buyerRooms: [],
  revenueEntries: DEMO_REVENUE_ENTRIES,
}

describe('V100.92 hardening & UX', () => {
  it('não retorna ajuda irrelevante apenas porque o artigo pertence à rota atual', () => {
    expect(searchHelpArticles('termo-que-nao-existe', 'settings')).toEqual([])
  })

  it('mantém a busca de ajuda tolerante a acentos', () => {
    expect(searchHelpArticles('notificacao', 'dashboard').some((article) => article.id === 'notifications')).toBe(true)
  })

  it('encontra leads pela busca global com normalização de texto', () => {
    const result = searchWorkspace('barbearia alpha', snapshot)
    expect(result.some((item) => item.kind === 'lead' && item.context?.leadId === 'lead-alpha')).toBe(true)
  })

  it('encontra módulos mesmo quando a função não está visível na navegação principal', () => {
    const result = searchWorkspace('forecast', snapshot)
    expect(result.some((item) => item.kind === 'module' && item.route === 'proposals')).toBe(true)
  })

  it('encontra propostas e preserva o contexto para navegação', () => {
    const proposal = DEMO_PROPOSALS[0]
    const result = searchWorkspace(proposal.proposalNumber, snapshot)
    expect(result.some((item) => item.kind === 'proposal' && item.context?.proposalId === proposal.id)).toBe(true)
  })
})
