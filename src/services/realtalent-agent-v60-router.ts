import {env} from '../lib/env'
import {runtimeFetch} from './realtalent-runtime-transport'
import type {AssistantContext} from './realtalent-assistant'
import {isExplicitCrmMutation,requestsFormatting} from './realtalent-agent-v56-intents'
import {isWorkContinuation} from './realtalent-agent-v53-work'
import {answerExternalResearch} from './realtalent-agent-v56-research'

const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
export function canConsiderModelResearch(prompt:string,context:AssistantContext={}):boolean{
  const text=normalized(prompt)
  if(text.length<14||text.length>1500||isExplicitCrmMutation(prompt)||requestsFormatting(prompt))return false
  if(context.activeWork&&isWorkContinuation(prompt,context.activeWork))return false
  if(/\b(?:meu pipeline|minhas tarefas|minhas propostas|meus contatos|minha agenda|meus leads|quantos clientes|faturamento real|crie uma tarefa|salve no crm|enviar mensagem)\b/.test(text))return false
  return true
}
/** Model chooses when fresh sources are needed, but never executes tools or
 * overrides the CRM write permission boundary. */
export async function routeResearchByModel(prompt:string,context:AssistantContext={},
  fetcher:typeof runtimeFetch=runtimeFetch):Promise<boolean>{
  if(!canConsiderModelResearch(prompt,context))return false
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),16500)
  try{
    const response=await fetcher(env.agentGatewayUrl+'/tools/route-intent',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({question:prompt.slice(0,1250)}),
    })
    if(!response.ok)return false
    const data=await response.json() as {ok?:boolean,intent?:unknown,confidence?:unknown}
    return data.ok===true&&data.intent==='research'&&typeof data.confidence==='number'&&data.confidence>=0.78
  }catch{return false}
  finally{clearTimeout(timer)}
}
export async function answerResearchSelectedByModel(prompt:string,context:AssistantContext={}){
  if(!await routeResearchByModel(prompt,context))return null
  return answerExternalResearch(prompt,context,runtimeFetch,true)
}
