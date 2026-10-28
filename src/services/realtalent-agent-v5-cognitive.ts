import type { WorkspaceSnapshot } from '../domain/types'
import type { AssistantAnswer, AssistantContext } from './realtalent-assistant'
import { buildCommercialMemory } from './realtalent-ai-memory'
import { runAgentToolsV41 } from './realtalent-agent-v41-tools'
import { createCommercialScript, isCommercialScriptRequest, type GeneratedCommercialScript } from './realtalent-agent-v41-scripts'
import { calculateCommercialRequest } from './realtalent-agent-v41-calculator'
import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'

const norm=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const words=(value:string)=>new Set(norm(value).split(/[^a-z0-9]+/).filter(x=>x.length>3))
export const rankRelevantCRMContext=(prompt:string,snapshot:WorkspaceSnapshot,context:AssistantContext={}):string[]=>{
  const id=context.focusLeadId??(context.previousLeadIds?.length===1?context.previousLeadIds[0]:null)
  const lead=id?snapshot.leads.find(item=>item.id===id):undefined
  if(!lead)return []
  const role=snapshot.workspace.role
  if(role!=='owner'&&role!=='admin'&&(!context.currentUserId||lead.ownerId!==context.currentUserId))return []
  const query=words(prompt)
  return buildCommercialMemory(snapshot,lead,context.now??new Date())
    .map((fact,index)=>({fact,index,score:[...words(fact.label+' '+fact.value)].filter(w=>query.has(w)).length*3+(fact.freshness==='current'?2:0)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,5)
    .map(({fact})=>`[${fact.source}/${fact.freshness}] ${fact.label}: ${fact.value.slice(0,190)}`)
}
export const classifyV5ToolRequest=(prompt:string)=>{
  const text=norm(prompt)
  const script=isCommercialScriptRequest(prompt)
  const calculation=Boolean(calculateCommercialRequest(prompt))
  const explicitCalculation=/\b(calcule|calcular|calcula|quanto e|quanto seria|qual o valor|qual a porcentagem)\b/.test(text)
  const mutation=/\b(envie|enviar|mande|mandar|salve|salvar|publique|publicar|exclua|excluir|apague|apagar|atualize|atualizar|agende|agendar|mova|mover|cadastre|cadastrar|crie\s+(?:uma?\s+)?(?:tarefa|contato|proposta|compromisso|reuniao|automacao))\b/.test(text)
  return {script,calculation,compound:script&&calculation&&explicitCalculation,mutation}
}
export type ScriptRefiner=(draft:GeneratedCommercialScript,request:string,facts:string[])=>Promise<{body:string,model:string}|null>
export const refineWithOllamaV5:ScriptRefiner=async(draft,request,facts)=>{
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),10_000)
  try{
    const response=await runtimeFetch(`${env.agentGatewayUrl}/tools/generate-script`,{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({draft:draft.body.slice(0,6500),request:request.slice(0,1000),facts:facts.slice(0,5),channel:draft.kind}),
    })
    if(!response.ok)return null
    const data=await response.json() as {ok?:boolean,body?:unknown,model?:unknown}
    const body=typeof data.body==='string'?data.body.trim():''
    if(!data.ok||body.length<180||body.length>9000||/\b(j[aá] enviei|mensagem enviada|tarefa criada|playbook salvo)\b/i.test(body))return null
    return {body,model:typeof data.model==='string'?data.model.slice(0,75):'ollama'}
  }catch{return null}
  finally{clearTimeout(timer)}
}

// Read-only local orchestration; mutations always fall through to the existing
// capability planner with server-side permission checks and user confirmation.
export async function runAgentToolsV5(
  prompt:string,snapshot:WorkspaceSnapshot,context:AssistantContext={},
  options:{refiner?:ScriptRefiner}={},
):Promise<AssistantAnswer|null>{
  if(context.pendingCapability)return null
  const route=classifyV5ToolRequest(prompt)
  if(route.mutation)return null
  if(!route.script)return runAgentToolsV41(prompt,snapshot,context)
  const draft=createCommercialScript(prompt,snapshot,context)
  if(!draft)return null
  const numerical=route.compound?calculateCommercialRequest(prompt):null
  const enhanced=await (options.refiner??refineWithOllamaV5)(draft,prompt,rankRelevantCRMContext(prompt,snapshot,context)).catch(()=>null)
  const content=enhanced?.body??draft.body
  const supplement=numerical
    ? `RESULTADO MATEMÁTICO VERIFICADO\n${numerical.title}: ${numerical.result}\nFórmula: ${numerical.formula}\n${numerical.details.join('\n')}\n\n`
    : ''
  return {
    id:`tools:v5:${Date.now()}`,intent:'crm_capability',
    title:route.compound?'Cálculo e roteiro comercial':draft.title,
    text:`${draft.rationale} ${enhanced?'Conteúdo refinado pelo Ollama.':'Foi utilizado o modelo estruturado local.'} Revise antes de utilizar. Nenhuma ação foi executada.`,
    items:[],facts:numerical?[`Cálculo confirmado pela ferramenta matemática: ${numerical.result}`]:[],
    suggestedPrompts:['Personalize o roteiro para venda consultiva','Calcule uma margem de 30% sobre custo de R$ 100'],
    toolOutput:{kind:'script',title:draft.title,body:supplement+content,channel:draft.kind,leadId:draft.leadId,grounded:draft.grounded},
    generatedAt:(context.now??new Date()).toISOString(),
  }
}
