import {describe,expect,it} from 'vitest'
import {createDefaultPreferences} from './preferences-context'
import {SETTINGS_GUIDES} from './settings-guides'
import {shouldAutoSaveSettings,validateCommercialSettingsDraft} from './settings-automation-policy'
describe('Settings S1/S2 safety and consistency',()=>{
  it('has complete contextual guidance for all 16 areas',()=>{
    expect(Object.keys(SETTINGS_GUIDES)).toHaveLength(16)
    for(const guide of Object.values(SETTINGS_GUIDES)){
      expect(guide.title.length).toBeGreaterThan(5)
      expect(guide.scope.length).toBeGreaterThan(5)
    }
  })
  it('autosaves only cosmetic sections with explicit enabling and edit permission',()=>{
    expect(shouldAutoSaveSettings('appearance',true,true)).toBe(true)
    expect(shouldAutoSaveSettings('navigation',true,true)).toBe(true)
    for(const item of ['account','company','team','commercial','ai','integrations','whatsapp','maps','data','pages','notifications'])
      expect(shouldAutoSaveSettings(item,true,true)).toBe(false)
    expect(shouldAutoSaveSettings('appearance',false,true)).toBe(false)
    expect(shouldAutoSaveSettings('navigation',true,false)).toBe(false)
  })
  it('accepts safe default commercial settings',()=>{
    expect(validateCommercialSettingsDraft(createDefaultPreferences())).toEqual([])
  })
  it('blocks zero-weight commercial engines',()=>{
    const draft=createDefaultPreferences()
    draft.commercial.leadScoring.weights={profile:0,behavior:0,potential:0}
    expect(validateCommercialSettingsDraft(draft).join(' ')).toMatch(/Lead Score/)
  })
  it('rejects nonascending priority thresholds and deal-zero calibration',()=>{
    const draft=createDefaultPreferences()
    draft.commercial.leadScoring.thresholds={...draft.commercial.leadScoring.thresholds,medium:80,high:60,urgent:95}
    draft.commercial.dealIntelligence.weights={activity:0,stakeholders:0,proposal:0,nextStep:0,timing:0,engagement:0}
    expect(validateCommercialSettingsDraft(draft)).toHaveLength(2)
  })
})
