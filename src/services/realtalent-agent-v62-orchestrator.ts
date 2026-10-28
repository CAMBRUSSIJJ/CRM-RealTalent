import type {AssistantAnswer,AssistantContext} from './realtalent-assistant'
import {calculateCommercialRequest} from './realtalent-agent-v41-calculator'
import {isExplicitCrmMutation} from './realtalent-agent-v56-intents'
import {answerExternalResearch} from './realtalent-agent-v56-research'
import {env} from '../lib/env'
import {runtimeFetch} from './realtalent-runtime-transport'

export interface ReadOnlyToolPlan {tools: Array<{name:'web_research'|'calculator';input:string}>;confidence:number}
const externalWords=/\b(?:pesquis[a-z]*|fontes|mercado|tendencias|metodologia|concorrentes?|referencias?|setor|estrategias?)\b/i
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export function shouldPlanReadOnlyTools(prompt:string,context:AssistantContext={}):boolean{
  if(prompt.length>1500||prompt.length<25||isExplicitCrmMutation(prompt)||context.pendingCapability)return false
  if(context.activeWork && /(?:revise|reescreva|resuma|reformate|transforme|deixe mais)/i.test(prompt))return false
  const numeric=calculateCommercialRequest(prompt)
  return Boolean(numeric) && externalWords.test(normalize(prompt))
}
export const validReadOnlyPlan=(raw:unknown):ReadOnlyToolPlan|null=>{
  if(!raw||typeof raw!=='object')return null
  const obj=raw as {tools?:unknown;confidence?:unknown}
  if(typeof obj.confidence!=='number'||obj.confidence<0.65||obj.confidence>1||!Array.isArray(obj.tools)||obj.tools.length>2)return null
  const names=new Set<string>(),tools:ReadOnlyToolPlan['tools']=[]
  for(const rawTool of obj.tools){
    if(!rawTool||typeof rawTool!=='object')return null
    const t=rawTool as {name?:unknown;input?:unknown}
    if((t.name!=='web_research'&&t.name!=='calculator')||typeof t.input!=='string'||t.input.trim().length<3||t.input.length>400||names.has(t.name))return null
    names.add(t.name);tools.push({name:t.name,input:t.input})
  }
  if(tools.length!==2 || !names.has('web_research') || !names.has('calculator'))return null
  return {tools,confidence:obj.confidence}
}
export async function planReadOnlyTools(prompt:string,context:AssistantContext={},
  fetcher:typeof runtimeFetch=runtimeFetch):Promise<ReadOnlyToolPlan|null>{
  if(!shouldPlanReadOnlyTools(prompt,context))return null
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),19000)
  try{
    const response=await fetcher(env.agentGatewayUrl+'/tools/plan-readonly',{
      method:'POST',headers:{'content-type':'application/json'},signal:ctrl.signal,
      body:JSON.stringify({prompt:prompt.slice(0,1500)})
    })
    if(!response.ok)return null
    const data=await response.json() as {ok?:boolean;plan?:unknown}
    return data.ok===true?validReadOnlyPlan(data.plan):null
  }catch{return null}finally{clearTimeout(timer)}
}
export async function runPlannedReadOnlyTools(prompt:string,context:AssistantContext={},
  options:{planner?:typeof planReadOnlyTools;researcher?:typeof answerExternalResearch}={}):Promise<AssistantAnswer|null>{
  const plan=await (options.planner??planReadOnlyTools)(prompt,context)
  if(!plan)return null
  // Calculate using the ORIGINAL user input, never numeric values invented by
  // the model. Any missing or malformed calculation falls back to the legacy path.
  const calculation=calculateCommercialRequest(prompt)
  if(!calculation)return null
  const rawQuery=plan.tools.find(t=>t.name==='web_research')?.input||''
  // Never send phone numbers, emails or CRM records to external search engines.
  if(/@|https?:\/\/|\d{4,}/i.test(rawQuery))return null
  const research=await (options.researcher??answerExternalResearch)(rawQuery,context,runtimeFetch,true)
  if(!research)return null
  const found=Boolean(research.researchSources?.length)
  const text=found?
    research.text+'\n\n### Cálculo verificado\n**'+calculation.result+'**\n'+
      calculation.formula+'\n'+calculation.details.join('\n') :
    '### Cálculo verificado\n**'+calculation.result+'**\n'+calculation.formula+
      '\n\nA pesquisa externa não pôde ser concluída. Não vou atribuir fontes ou recomendações que não foram verificadas.'
  return {
    id:'tools:v6.2:'+Date.now(),intent:'unknown',title:'Pesquisa e cálculo',
    text,items:[],facts:[],suggestedPrompts:['Compare as fontes','Ajuste o cenário do cálculo'],
    researchSources:research.researchSources,
    generatedAt:new Date().toISOString(),
    toolOutput:{kind:'calculation',title:calculation.title,result:calculation.result,
      formula:calculation.formula,details:calculation.details,category:calculation.category}
  }
}
