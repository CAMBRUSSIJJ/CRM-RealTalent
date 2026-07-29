import { describe, expect, it } from 'vitest'
import { applyExperiencePreset, createDefaultExperiencePreferences, normalizeExperiencePreferences } from './experience-context'

 describe('preferências de experiência V100.50', () => {
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
        },
      },
    }, 'member')
    expect(normalized.pages.dashboard?.hiddenSections).toEqual(['health'])
    expect(normalized.pages.dashboard?.sectionOrder.slice(0, 2)).toEqual(['execution', 'hero'])
    expect(normalized.pages.dashboard?.sectionOrder).toContain('insights')
  })

  it('aplica perfil executivo sem remover conteúdo essencial', () => {
    const preset = applyExperiencePreset('executive', 'viewer')
    expect(preset.global.contentWidth).toBe('focused')
    expect(preset.global.fontScale).toBe('large')
    expect(preset.pages.dashboard?.hiddenSections).toContain('execution')
    const normalized = normalizeExperiencePreferences(preset, 'viewer')
    expect(normalized.pages.dashboard?.hiddenSections).not.toContain('execution')
  })

  it('cria preferências completas para todas as rotas', () => {
    const defaults = createDefaultExperiencePreferences('admin')
    expect(defaults.preset).toBe('admin')
    expect(Object.keys(defaults.pages).length).toBeGreaterThanOrEqual(14)
    expect(defaults.pages.settings?.sectionOrder).toContain('content')
  })
})
