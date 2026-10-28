import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import { universalCrmCapabilityById } from './realtalent-crm-universal-registry'

export type CrmV51Preflight = {ok:true;reason:''}|{ok:false;reason:string}

/** Independent permission-boundary preflight before touching CRM state.
 * The executor still enforces record access and verifies persistence. */
export function preflightCrmPlanV51(steps:CrmCapabilityPlanStep[]):CrmV51Preflight {
  if(!Array.isArray(steps)||steps.length===0||steps.length>8)
    return {ok:false,reason:'Plano sem etapas ou com mais de oito operações.'}
  const seen=new Set<string>()
  for(const step of steps){
    const definition=universalCrmCapabilityById(step?.capabilityId ?? '')
    if(!definition||definition.execution!=='native')
      return {ok:false,reason:'Ferramenta desconhecida ou indisponível no catálogo autorizado.'}
    if(!step.id||seen.has(step.id))
      return {ok:false,reason:'O plano tem etapas sem identificação ou duplicadas.'}
    seen.add(step.id)
    if(step.risk!==definition.risk)
      return {ok:false,reason:'O nível de risco da operação não corresponde ao catálogo.'}
    if(!Array.isArray(step.args)||step.args.length>24)
      return {ok:false,reason:'Argumentos da ferramenta estão fora dos limites.'}
    if(step.args.some(arg=>!arg||typeof arg.name!=='string'||typeof arg.value!=='string'))
      return {ok:false,reason:'Há parâmetros inválidos na operação.'}
  }
  if(steps.some(step=>step.capabilityId==='agent.undo_last')&&steps.length!==1)
    return {ok:false,reason:'Desfazer não pode ser combinado com outras operações.'}
  return {ok:true,reason:''}
}
