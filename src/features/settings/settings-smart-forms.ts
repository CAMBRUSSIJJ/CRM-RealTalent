import type {CrmPreferences} from './preferences-context'
import type {NotificationPreferences} from '../../services/notification-preferences'

export type CommercialPresetId='balanced'|'outbound'|'consultative'
export type NotificationPresetId='focus'|'balanced'|'quiet'
export interface FormPreset<Id extends string>{id:Id;title:string;description:string}
export const COMMERCIAL_FORM_PRESETS:FormPreset<CommercialPresetId>[]=[
  {id:'balanced',title:'Equilibrado',description:'SLA de 30 min, follow-up em 2 dias e revisão de propostas em 3 dias.'},
  {id:'outbound',title:'Prospecção ativa',description:'Primeiro contato rápido e acompanhamento mais frequente.'},
  {id:'consultative',title:'Venda consultiva',description:'Mais tempo entre interações e foco na próxima ação.'},
]
export const NOTIFICATION_FORM_PRESETS:FormPreset<NotificationPresetId>[]=[
  {id:'focus',title:'Só o essencial',description:'Atividades vencidas, próximas reuniões e falhas operacionais.'},
  {id:'balanced',title:'Acompanhamento completo',description:'Todos os eventos disponíveis, com horários silenciosos.'},
  {id:'quiet',title:'Menos interrupções',description:'Avisos na Central, sem notificações do navegador.'},
]
type OperationKey='businessDays'|'businessStart'|'businessEnd'|'defaultFollowupDays'|
  'firstContactSlaMinutes'|'staleLeadDays'|'proposalFollowupDays'|'maxCallAttempts'|
  'meetingReminderMinutes'|'defaultLeadPriority'|'requireNextActionForActiveLeads'
export type OperationPatch=Pick<CrmPreferences['commercial'],OperationKey>
const balanced:OperationPatch={
  businessDays:[1,2,3,4,5],businessStart:'08:30',businessEnd:'18:00',
  defaultFollowupDays:2,firstContactSlaMinutes:30,staleLeadDays:7,
  proposalFollowupDays:3,maxCallAttempts:5,meetingReminderMinutes:30,
  defaultLeadPriority:'medium',requireNextActionForActiveLeads:true,
}
const outbound:OperationPatch={...balanced,
  defaultFollowupDays:1,firstContactSlaMinutes:15,staleLeadDays:4,
  proposalFollowupDays:2,maxCallAttempts:7,meetingReminderMinutes:30}
const consultative:OperationPatch={...balanced,
  defaultFollowupDays:3,firstContactSlaMinutes:120,staleLeadDays:14,
  proposalFollowupDays:5,maxCallAttempts:4,meetingReminderMinutes:60}
const operationPresets:Record<CommercialPresetId,OperationPatch>={
  balanced,outbound,consultative,
}
/** Returns a NEW draft and never writes or mutates the existing preferences.
 * Scoring weights, sales stages, integrations and security are always preserved. */
export function previewCommercialPreset(current:CrmPreferences,id:CommercialPresetId):CrmPreferences{
  const preset=operationPresets[id]
  return {...current,commercial:{...current.commercial,...preset,businessDays:[...preset.businessDays]}}
}
const commercialLabels:Record<OperationKey,string>={
  businessDays:'Dias úteis',businessStart:'Início do expediente',businessEnd:'Fim do expediente',
  defaultFollowupDays:'Follow-up padrão',firstContactSlaMinutes:'SLA do primeiro contato',
  staleLeadDays:'Lead parado',proposalFollowupDays:'Revisão de proposta',
  maxCallAttempts:'Máximo de tentativas',meetingReminderMinutes:'Lembrete de reunião',
  defaultLeadPriority:'Prioridade inicial',requireNextActionForActiveLeads:'Exigir próxima ação',
}
const operationKeys=Object.keys(commercialLabels) as OperationKey[]
export interface SettingsFieldChange{field:string;before:string;after:string}
const describe=(v:unknown)=>Array.isArray(v)?v.join(', '):typeof v==='boolean'?(v?'Sim':'Não'):String(v??'—')
export function commercialPresetChanges(current:CrmPreferences,id:CommercialPresetId):SettingsFieldChange[]{
  const next=previewCommercialPreset(current,id)
  return operationKeys.filter(key=>JSON.stringify(current.commercial[key])!==JSON.stringify(next.commercial[key]))
    .map(key=>({field:commercialLabels[key],before:describe(current.commercial[key]),after:describe(next.commercial[key])}))
}
const notificationLabels:Partial<Record<keyof NotificationPreferences,string>>={
  inAppEnabled:'Central de avisos',browserEnabled:'Navegador',
  frequency:'Frequência',quietHoursEnabled:'Horário silencioso',
  quietStart:'Silêncio começa',quietEnd:'Silêncio termina',
  upcomingWindowHours:'Antecedência de reuniões',proposalSilenceDays:'Proposta sem avanço',
  overdueActivities:'Follow-up vencido',upcomingActivities:'Atividade próxima',
  upcomingEvents:'Reunião',proposalFollowups:'Proposta',staleLeads:'Lead parado',
  goalsAtRisk:'Metas em risco',automationFailures:'Erros de automação',
}
export function previewNotificationPreset(current:NotificationPreferences,id:NotificationPresetId):NotificationPreferences{
  const next={...current}
  if(id==='focus'){
    Object.assign(next,{frequency:'daily',quietHoursEnabled:true,quietStart:'20:00',quietEnd:'08:00',
      overdueActivities:true,upcomingActivities:true,upcomingEvents:true,
      proposalFollowups:false,staleLeads:false,goalsAtRisk:false,automationFailures:true})
  }else if(id==='balanced'){
    Object.assign(next,{frequency:'realtime',quietHoursEnabled:true,quietStart:'20:00',quietEnd:'08:00',
      overdueActivities:true,upcomingActivities:true,upcomingEvents:true,
      proposalFollowups:true,staleLeads:true,goalsAtRisk:true,automationFailures:true})
  }else{
    Object.assign(next,{inAppEnabled:true,browserEnabled:false,frequency:'daily',
      quietHoursEnabled:true,quietStart:'19:00',quietEnd:'09:00',
      overdueActivities:true,upcomingActivities:false,upcomingEvents:true,
      proposalFollowups:false,staleLeads:false,goalsAtRisk:false,automationFailures:true})
  }
  // Never grant Notification permission, enable desktop prompts or change
  // the existing browser channel without the user's explicit action.
  if(id!=='quiet')next.browserEnabled=current.browserEnabled
  return next
}
export function notificationPresetChanges(current:NotificationPreferences,id:NotificationPresetId):SettingsFieldChange[]{
  const next=previewNotificationPreset(current,id)
  return (Object.keys(notificationLabels) as Array<keyof NotificationPreferences>)
    .filter(key=>JSON.stringify(current[key])!==JSON.stringify(next[key]))
    .map(key=>({field:notificationLabels[key]??String(key),before:describe(current[key]),after:describe(next[key])}))
}
export function settingsPresetSafeguards(){
  return 'Os modelos só preparam mudanças na interface. Regras comerciais precisam ser aplicadas explicitamente; notificações pessoais são salvas ao confirmar.'
}
