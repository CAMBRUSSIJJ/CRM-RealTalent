import type {SettingsSectionId} from './settings-guides'

export const SETTINGS_S3_GROUPS=[
  'Minha experiência','Workspace','Vendas','Conexões','Inteligência','Administração',
] as const
export type SettingsS3Group=(typeof SETTINGS_S3_GROUPS)[number]
export const SETTINGS_S3_SECTION_GROUP:Record<SettingsSectionId,SettingsS3Group>={
  account:'Minha experiência',appearance:'Minha experiência',experience:'Minha experiência',
  notifications:'Minha experiência',company:'Workspace',navigation:'Workspace',pages:'Workspace',
  team:'Workspace',commercial:'Vendas',calendar:'Conexões',whatsapp:'Conexões',
  integrations:'Conexões',maps:'Conexões',ai:'Inteligência',audit:'Administração',data:'Administração',
}
/** When opening settings from deep links, expose the relevant group, not a list of 16 items. */
export function collapsedGroupsForSettingsTab(tab:SettingsSectionId):SettingsS3Group[]{
  return SETTINGS_S3_GROUPS.filter(group=>group!==SETTINGS_S3_SECTION_GROUP[tab])
}
