import { describe, expect, it } from 'vitest'
import { applyExperiencePreset, createDefaultExperiencePreferences, mergeExperienceSectionOrder, normalizeExperiencePreferences } from './experience-context'

 describe('preferências de experiência V100.51.1', () => {
  it('protege seções essenciais ao normalizar dados antigos', () => {
    const normalized = normalizeExperiencePreferences({
      version: 1,
      preset: 'custom',
      pages: {
        dashboard: {
          density: 'compact',
          emphasis: 'focus',
          hiddenSections: ['hero', 'health', 'execution', 'inexistente'],
          sectionOrder: ['execution', 'hero'],
          dataScope: 'team',
        },
      },
    }, 'member')
    expect(normalized.pages.dashboard?.hiddenSections).toEqual([])
    expect(normalized.pages.dashboard?.sectionOrder).toEqual(['day', 'day-health'])
    expect(normalized.pages.dashboard?.dataScope).toBe('team')
  })

  it('aplica perfil executivo sem remover conteúdo essencial', () => {
    const preset = applyExperiencePreset('executive', 'viewer')
    expect(preset.global.contentWidth).toBe('focused')
    expect(preset.global.fontScale).toBe('large')
    const normalized = normalizeExperiencePreferences(preset, 'viewer')
    expect(normalized.pages.dashboard?.hiddenSections).toEqual([])
    expect(normalized.pages.dashboard?.sectionOrder).toEqual(['day', 'day-health'])
  })

  it('insere novas seções na posição do registro sem destruir a ordem personalizada', () => {
    expect(mergeExperienceSectionOrder(['hero', 'health', 'score', 'execution', 'summary', 'insights'], ['hero', 'health', 'score', 'execution', 'intelligence', 'summary', 'insights']))
      .toEqual(['hero', 'health', 'score', 'execution', 'intelligence', 'summary', 'insights'])
    expect(mergeExperienceSectionOrder(['execution', 'hero'], ['hero', 'health', 'score', 'execution', 'intelligence', 'summary', 'insights']).slice(0, 2))
      .toEqual(['execution', 'hero'])
  })

  it('cria preferências completas para todas as rotas', () => {
    const defaults = createDefaultExperiencePreferences('admin')
    expect(defaults.preset).toBe('admin')
    expect(Object.keys(defaults.pages).length).toBeGreaterThanOrEqual(14)
    expect(defaults.pages.settings?.sectionOrder).toContain('content')
    expect(defaults.pages.dashboard?.dataScope).toBe('mine')
    expect(defaults.pages.dashboard?.sectionOrder).toEqual(['day', 'day-health'])
  })
})
