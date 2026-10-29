import {describe,it,expect} from 'vitest'
import {createDefaultPreferences} from './preferences-context'
import {createDefaultExperiencePreferences} from '../experience/experience-context'
import {previewCommercialPreset,commercialPresetChanges,previewNotificationPreset,notificationPresetChanges} from './settings-smart-forms'

describe('Configurações S3.3 — presets com revisão obrigatória',()=>{
  it('never mutates the stored commercial preferences or nested scoring',()=>{
    const before=createDefaultPreferences('Empresa A')
    const source=JSON.stringify(before)
    const next=previewCommercialPreset(before,'outbound')
    expect(before).not.toBe(next)
    expect(JSON.stringify(before)).toBe(source)
    expect(next.commercial.firstContactSlaMinutes).toBe(15)
    expect(next.commercial.defaultFollowupDays).toBe(1)
    expect(next.commercial.leadScoring).toBe(before.commercial.leadScoring)
    expect(next.commercial.dealIntelligence).toBe(before.commercial.dealIntelligence)
    expect(next.commercial.pipelineStagePolicies).toBe(before.commercial.pipelineStagePolicies)
    expect(next.security).toEqual(before.security)
  })
  it('changes only documented commercial operation fields',()=>{
    const before=createDefaultPreferences()
    const next=previewCommercialPreset(before,'consultative')
    const changed=Object.keys(before.commercial).filter(key=>JSON.stringify(
      before.commercial[key as keyof typeof before.commercial])!==JSON.stringify(
      next.commercial[key as keyof typeof before.commercial]))
    expect(changed).toEqual(['defaultFollowupDays','firstContactSlaMinutes','staleLeadDays','proposalFollowupDays','maxCallAttempts','meetingReminderMinutes'])
    expect(commercialPresetChanges(before,'consultative').length).toBe(changed.length)
    expect(commercialPresetChanges(before,'balanced')).toHaveLength(0)
  })
  it('keeps rules and draft independent across preset switches',()=>{
    const before=createDefaultPreferences()
    const a=previewCommercialPreset(before,'outbound')
    const b=previewCommercialPreset(before,'balanced')
    a.commercial.businessDays.push(6)
    expect(before.commercial.businessDays).not.toContain(6)
    expect(b.commercial.businessDays).not.toContain(6)
  })
  it('notification profiles do not silently enable browser permission',()=>{
    const before=createDefaultExperiencePreferences().notifications
    const source=JSON.stringify(before)
    for(const id of ['focus','balanced','quiet'] as const){
      const after=previewNotificationPreset(before,id)
      expect(after.browserEnabled).toBe(false)
      expect(after.inAppEnabled).toBe(true)
      expect(JSON.stringify(before)).toBe(source)
    }
    expect(previewNotificationPreset({...before,browserEnabled:true},'quiet').browserEnabled).toBe(false)
  })
  it('provides real before and after values rather than implying execution',()=>{
    const before=createDefaultExperiencePreferences().notifications
    const delta=notificationPresetChanges(before,'quiet')
    expect(delta).toContainEqual({field:'Silêncio começa',before:'20:00',after:'19:00'})
    expect(delta.every(row=>row.field&&row.before&&row.after)).toBe(true)
  })
})
