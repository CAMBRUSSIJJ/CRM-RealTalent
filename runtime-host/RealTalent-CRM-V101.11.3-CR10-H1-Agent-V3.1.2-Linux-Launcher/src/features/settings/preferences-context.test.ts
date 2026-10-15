import { describe, expect, it } from 'vitest'
import { normalizePreferences } from './preferences-context'

describe('normalização segura das preferências', () => {
  it('impede cores e valores inválidos de quebrarem a interface', () => {
    const preferences = normalizePreferences({
      company: { accentColor: 'javascript:alert(1)', navigationColor: '#123', name: '   ' } as never,
      appearance: { theme: 'invalid' } as never,
      commercial: { businessDays: [1, 1, 9], maxCallAttempts: 999, businessStart: '99:99' } as never,
      navigation: { visibleRoutes: ['leads'] } as never,
    }, 'RealTalent')
    expect(preferences.company.accentColor).toBe('#2f59db')
    expect(preferences.company.navigationColor).toBe('#17264a')
    expect(preferences.appearance.theme).toBe('light')
    expect(preferences.commercial.businessDays).toEqual([1])
    expect(preferences.commercial.maxCallAttempts).toBe(50)
    expect(preferences.commercial.businessStart).toBe('08:30')
    expect(preferences.navigation.visibleRoutes).toEqual(expect.arrayContaining(['dashboard', 'settings']))
  })

  it('remove rotas repetidas e preserva todas na ordem', () => {
    const preferences = normalizePreferences({ navigation: { order: ['leads', 'leads', 'pipeline'] } as never }, 'RealTalent')
    expect(preferences.navigation.order[0]).toBe('leads')
    expect(new Set(preferences.navigation.order).size).toBe(preferences.navigation.order.length)
  })

  it('normaliza políticas compartilhadas do Pipeline', () => {
    const preferences = normalizePreferences({ commercial: { pipelineStagePolicies: { proposal: { maxDays: 999, requirePhone: true, requireValue: true, requireNextAction: true, preventSkipping: true, confirmBackward: true, instructions: '  Confirmar decisor  ' } } } as never }, 'RealTalent')
    expect(preferences.commercial.pipelineStagePolicies.proposal.maxDays).toBe(365)
    expect(preferences.commercial.pipelineStagePolicies.proposal.instructions).toBe('Confirmar decisor')
    expect(preferences.commercial.requireNextActionForActiveLeads).toBe(true)
  })

  it('migra navegação antiga para menu principal e protege Configurações', () => {
    const preferences = normalizePreferences({ navigation: { visibleRoutes: ['dashboard', 'leads', 'settings'], order: ['leads', 'dashboard', 'settings'] } as never }, 'RealTalent')
    expect(preferences.navigation.primaryRoutes).toEqual(expect.arrayContaining(['dashboard', 'leads', 'settings']))
    expect(preferences.navigation.primaryRoutes).not.toContain('followups')
  })

  it('preserva escolha entre menu principal e Mais ferramentas somente para rotas visíveis', () => {
    const preferences = normalizePreferences({ navigation: { visibleRoutes: ['dashboard', 'pipeline', 'followups', 'settings'], primaryRoutes: ['dashboard', 'followups', 'commercial-map', 'settings'] } as never }, 'RealTalent')
    expect(preferences.navigation.primaryRoutes).toEqual(expect.arrayContaining(['dashboard', 'followups', 'settings']))
    expect(preferences.navigation.primaryRoutes).not.toContain('commercial-map')
    expect(preferences.navigation.primaryRoutes).not.toContain('pipeline')
  })

})
