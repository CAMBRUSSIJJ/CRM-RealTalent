import type {WorkspaceSnapshot} from '../domain/types'
import type {ProspectRecord} from './prospecting-workspace'
import {prospectDataQuality} from './prospecting-data-layer'
import {scoreProspectWithIcp,type ProspectingIntelligenceScore} from './prospecting-intelligence'

export interface EvidenceItem {
  label:string
  type:'verified_field'|'provided_field'|'gap'|'inference'
  source:string
}
export interface ExplainableProspectScore {
  fit:number
  opportunity:number
  evidenceConfidence:number
  existingScore:number
  decision:'prioritize'|'investigate'|'verify_first'|'do_not_advance'
  reasons:string[]
  uncertainties:string[]
  evidence:EvidenceItem[]
}
const clamp=(value:number)=>Math.round(Math.max(0,Math.min(100,value)))
const normalize=(str:string)=>String(str||'').trim()
/** These dimensions are *not* a prediction of purchase intent.
 * They are deterministic explanations of the already-existing ICP engine. */
export function explainProspectScore(
  prospect:ProspectRecord,snapshot:WorkspaceSnapshot,
  existing:ProspectingIntelligenceScore=scoreProspectWithIcp(prospect,snapshot),
):ExplainableProspectScore {
  const quality=prospectDataQuality(prospect)
  const entity=quality.entity
  const reasons=[...existing.reasons].slice(0,4)
  const uncertainties=[...existing.warnings,...quality.blockers,...quality.warnings].slice(0,7)
  const evidence:EvidenceItem[]=[]
  const add=(label:string,type:EvidenceItem['type'],source:string)=>{
    if(!evidence.some(e=>e.label===label))evidence.push({label,type,source})
  }
  if(prospect.company)add('Nome comercial fornecido pela origem','provided_field',prospect.source)
  if(prospect.cnpj)add('CNPJ informado — validar situação cadastral','provided_field',prospect.source)
  if(prospect.city)add('Cidade declarada — confirmar correspondência territorial','provided_field',prospect.source)
  if(prospect.website)add('Endereço do site informado — confirmar conteúdo','provided_field',prospect.source)
  if(prospect.description)add('Descrição comercial recebida da origem','provided_field',prospect.source)
  if(prospect.sourceDetail)add('Rastro de origem disponível','provided_field',prospect.source)
  if(!prospect.website)add('Nenhum website informado','gap','Data Layer')
  if(!prospect.description)add('Atuação e serviços não descritos','gap','Data Layer')
  if(prospect.duplicateLevel!=='none')add('Duplicidade exige decisão humana','gap','CRM')

  // Preserve the original ICP's weight: never allow the model to change it.
  let fit=clamp((existing.breakdown.fit/30)*100)
  const sample=scoreProspectSampleSize(snapshot)
  if(sample<3){fit=Math.min(fit,65);uncertainties.push('ICP com menos de 3 registros; aderência provisória')}
  let opportunity=clamp((existing.breakdown.potential/25)*100)
  // Potential signals are hypotheses, not evidence of budget/intent.
  if(!prospect.description && !prospect.website)opportunity=Math.min(opportunity,45)
  let evidenceConfidence=clamp(entity.confidence*.6+quality.score*.4)
  if(entity.status==='ambiguous')evidenceConfidence=Math.min(evidenceConfidence,39)
  if(entity.status==='rejected')evidenceConfidence=Math.min(evidenceConfidence,15)
  if(prospect.duplicateLevel==='possible')evidenceConfidence=Math.min(evidenceConfidence,55)
  if(prospect.duplicateLevel==='confirmed')evidenceConfidence=Math.min(evidenceConfidence,25)
  if(!normalize(prospect.city) && !normalize(prospect.address))evidenceConfidence=Math.min(evidenceConfidence,55)
  if(quality.readiness==='blocked')evidenceConfidence=Math.min(evidenceConfidence,49)

  const doNotAdvance=entity.status==='rejected' || prospect.status==='discarded'
  const verifyFirst=!doNotAdvance && (quality.readiness==='blocked' || prospect.duplicateLevel!=='none' || evidenceConfidence<50)
  const decision=doNotAdvance?'do_not_advance':verifyFirst?'verify_first':
    fit>=70&&opportunity>=60&&evidenceConfidence>=70?'prioritize':'investigate'
  if(existing.opportunitySignals.length)uncertainties.push(
    'Sinais de oportunidade não comprovam necessidade de compra ou intenção de contratar')
  if(evidence.length===0)add('Sem evidências identificáveis','gap','Data Layer')
  return {fit,opportunity,evidenceConfidence,existingScore:existing.score,decision,
    reasons:[...new Set(reasons)].slice(0,4),
    uncertainties:[...new Set(uncertainties)].slice(0,5),
    evidence:evidence.slice(0,9)}
}
const scoreProspectSampleSize=(snapshot:WorkspaceSnapshot)=>{
  const won=snapshot.leads.filter(l=>l.status==='won')
  return won.length || snapshot.leads.filter(l=>l.status==='active').length
}
export const prospectDecisionLabel=(value:ExplainableProspectScore['decision'])=>({
  prioritize:'Priorizar investigação comercial',
  investigate:'Investigar oportunidade',
  verify_first:'Verificar dados antes de avançar',
  do_not_advance:'Não avançar sem revisão'
})[value]
