import type { AssistantAnswer } from './realtalent-assistant'
export interface WorkQualityCheck {
  ok:boolean
  warnings:string[]
  score:number
}
export function evaluateAgentWork(answer:AssistantAnswer,previousBody=''):WorkQualityCheck{
  const output=answer.toolOutput
  if(!output||output.kind!=='script')return {ok:true,warnings:[],score:100}
  const warnings:string[]=[]
  if(output.body.trim().length<200)warnings.push('Roteiro curto demais para orientar uma abordagem.')
  if(previousBody && output.body.trim()===previousBody.trim())warnings.push('O roteiro não foi alterado.')
  if(/\[(?:Nome do cliente|tema do serviço|resultado desejado)\]/i.test(output.body))
    warnings.push('Ainda há campos genéricos para personalizar.')
  if(output.strategy?.evidence==='external' && !output.strategy.sources.length)
    warnings.push('Pesquisa externa sem fontes identificáveis.')
  if(/\b(?:pesquisei|consultei (?:sites|a internet))\b/i.test(output.body)&&(!output.strategy||!output.strategy.sources.length))
    warnings.push('O roteiro afirma pesquisa externa sem fontes.')
  return {ok:warnings.length===0,score:Math.max(0,100-warnings.length*25),warnings}
}
