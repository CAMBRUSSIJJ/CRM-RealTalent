import type { WorkspaceSnapshot } from '../domain/types'
import type { AssistantAnswer, AssistantContext } from './realtalent-assistant'
import { calculateCommercialRequest } from './realtalent-agent-v41-calculator'
import { createCommercialScript } from './realtalent-agent-v41-scripts'

export const runAgentToolsV41 = (prompt:string,snapshot:WorkspaceSnapshot,context:AssistantContext={}):AssistantAnswer|null=>{
  if(context.pendingCapability)return null
  const now=(context.now??new Date()).toISOString()
  const calculation=calculateCommercialRequest(prompt)
  if(calculation)return {
    id:`tool:calculator:${Date.now()}`,intent:'crm_capability',
    title:calculation.title,text:'Cálculo realizado pela calculadora do RealTalent. Confira a fórmula e as premissas.',
    items:[],facts:[],suggestedPrompts:['Calcule uma margem de 30% sobre custo de R$ 100','Quanto é 15% de 2400?'],
    toolOutput:{kind:'calculation',title:calculation.title,result:calculation.result,formula:calculation.formula,details:calculation.details},generatedAt:now,
  }
  const script=createCommercialScript(prompt,snapshot,context)
  if(script)return {
    id:`tool:script:${Date.now()}`,intent:'crm_capability',title:script.title,
    text:script.rationale,items:[],facts:[],suggestedPrompts:['Crie um roteiro de ligação consultiva','Monte uma abordagem de WhatsApp comercial'],
    toolOutput:{kind:'script',title:script.title,body:script.body,channel:script.kind,leadId:script.leadId,grounded:script.grounded},
    generatedAt:now,
  }
  return null
}
