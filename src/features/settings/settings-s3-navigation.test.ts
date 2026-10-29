import {describe,it,expect} from 'vitest'
import {SETTINGS_GUIDES,type SettingsSectionId} from './settings-guides'
import {SETTINGS_S3_GROUPS,SETTINGS_S3_SECTION_GROUP,collapsedGroupsForSettingsTab} from './settings-s3-navigation'

describe('Configurações S3 compact navigation',()=>{
  it('classifies all 16 real settings screens into six areas',()=>{
    expect(Object.keys(SETTINGS_S3_SECTION_GROUP).sort()).toEqual(Object.keys(SETTINGS_GUIDES).sort())
    expect(new Set(Object.values(SETTINGS_S3_SECTION_GROUP)).size).toBe(6)
  })
  it.each([
    ['account','Minha experiência'],
    ['ai','Inteligência'],
    ['whatsapp','Conexões'],
    ['commercial','Vendas'],
    ['data','Administração'],
    ['team','Workspace'],
  ] as Array<[SettingsSectionId,string]>)('starts %s with its category expanded', (section,expected)=>{
    const collapsed=collapsedGroupsForSettingsTab(section)
    expect(collapsed).not.toContain(expected)
    expect(collapsed).toHaveLength(SETTINGS_S3_GROUPS.length-1)
  })
  it('has a predictable initial state for every section, including deep links',()=>{
    for(const section of Object.keys(SETTINGS_GUIDES) as SettingsSectionId[]){
      const collapsed=collapsedGroupsForSettingsTab(section)
      expect(SETTINGS_S3_GROUPS.filter(group=>!collapsed.includes(group))).toEqual([SETTINGS_S3_SECTION_GROUP[section]])
    }
  })
})
