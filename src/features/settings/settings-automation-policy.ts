import type {CrmPreferences} from './preferences-context'
/** Safe configuration automation: commercial, security and provider writes are never debounced. */
export const AUTOSAVE_VISUAL_SECTIONS=['appearance','navigation'] as const
export function shouldAutoSaveSettings(section:string,autoEnabled:boolean,canEdit:boolean):boolean{
  return autoEnabled&&canEdit&&AUTOSAVE_VISUAL_SECTIONS.some(id=>id===section)
}
/** Normalize only at commit boundary; warn before a configuration would have no signal. */
export function validateCommercialSettingsDraft(draft:CrmPreferences):string[]{
  const errors:string[]=[]
  const scoring=draft.commercial.leadScoring
  const deals=draft.commercial.dealIntelligence
  if(scoring.enabled&&Object.values(scoring.weights).reduce((sum,weight)=>sum+Number(weight||0),0)<=0)
    errors.push('O Lead Score precisa de ao menos um critério com peso maior que zero.')
  if(deals.enabled&&Object.values(deals.weights).reduce((sum,weight)=>sum+Number(weight||0),0)<=0)
    errors.push('O Deal Intelligence precisa de ao menos um sinal com peso maior que zero.')
  const {medium,high,urgent,warm,hot}=scoring.thresholds
  if(medium>=high||high>=urgent||warm>=hot)
    errors.push('Revise as faixas: média < alta < crítica e morna < quente.')
  return errors
}
