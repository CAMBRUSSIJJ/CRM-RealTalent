import type {WorkspaceSnapshot} from '../domain/types'
import type {AssistantAnswer,AssistantContext} from './realtalent-assistant'
import {answerExternalResearch} from './realtalent-agent-v56-research'
import {isExplicitCrmMutation} from './realtalent-agent-v56-intents'
import {env} from '../lib/env'
import {runtimeFetch} from './realtalent-runtime-transport'

export type WorkflowTask='crm_summary'|'web_research'|'draft_document'
export interface WorkflowPlan {tasks:WorkflowTask[];confidence:number}
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const CRM=/\b(?:crm|meus? (?:leads?|contatos?|negocios?|clientes?|oportunidades?|pipeline)|minhas? (?:propostas?|vendas?|contas?))\b/
const WEB=/\b(?:pesquis|internet|mercado|tendencias|setor|concorr|fontes|metodologias? (?:atuais|recentes)|benchmark)\b/
const DOCUMENT=/\b(?:plano|planejamento|relatorio|analise estrategica|documento|proposta de estrategia|estrategia comercial|roteiro)\b/
const DIRECT_WRITE=/\b(?:envie|enviar|salve|salvar|publique|publicar|exclua|excluir|delete|apague|atualize|atualizar|mova|mover|cadastre|cadastrar|agende|agendar|dispare|disparar)\b/
export function shouldRunContextualWorkflow(prompt:string,context:AssistantContext={}):boolean{
  const s=norm(prompt)
  if(s.length<24||s.length>1400||context.pendingCapability||isExplicitCrmMutation(prompt)||DIRECT_WRITE.test(s))return false
  if(context.activeWork&&/\b(?:corrija|reescreva|revise|mude|resuma|reformate|transforme)\b/.test(s))return false
  const crm=CRM.test(s),web=WEB.test(s),doc=DOCUMENT.test(s)
  return (crm&&doc)||(web&&doc&&crm) // explicit CRM context + an analytical deliverable
}
export function validateWorkflowPlan(raw:unknown,prompt:string):WorkflowPlan|null{
  if(!raw||typeof raw!=='object'||!shouldRunContextualWorkflow(prompt))return null
  const v=raw as {tasks?:unknown;confidence?:unknown}
  if(!Array.isArray(v.tasks)||v.tasks.length>3||typeof v.confidence!=='number'||v.confidence<0.7||v.confidence>1)return null
  const allowed=new Set<WorkflowTask>(['crm_summary','web_research','draft_document'])
  const tasks=v.tasks as WorkflowTask[]
  if(tasks.some(task=>!allowed.has(task))||new Set(tasks).size!==tasks.length)return null
  if(!tasks.includes('crm_summary')||!tasks.includes('draft_document'))return null
  if(tasks.includes('web_research')&&!WEB.test(norm(prompt)))return null
  return {tasks,confidence:v.confidence}
}
/** Aggregate only. No phone, email, notes, company/person names, CRM IDs
 * or any customer-provided free text are sent to the local Ollama model.
 * User never sees other workspaces or leads outside their permitted role. */
export function authorizedCrmSummary(snapshot:WorkspaceSnapshot,context:AssistantContext={}):string|null{
  const role=snapshot.workspace.role
  const privileged=role==='owner'||role==='admin'
  if(!privileged&&!context.currentUserId)return null
  const visible=snapshot.leads.filter(l=>l.workspaceId===snapshot.workspace.id &&
    (privileged||l.ownerId===context.currentUserId))
  const active=visible.filter(l=>l.status==='active')
  const total=active.reduce((sum,l)=>sum+(Number.isFinite(l.value)?Math.max(0,l.value):0),0)
  const byStage=snapshot.stages.filter(s=>s.workspaceId===snapshot.workspace.id).map(stage=>({
    stage:stage.order,
    count:active.filter(l=>l.stageId===stage.id).length,
  })).filter(x=>x.count>0).slice(0,12)
  const overdue=active.filter(l=>l.nextActionAt && new Date(l.nextActionAt).getTime()<Date.now()).length
  const format=(n:number)=>Number(n.toFixed(2))
  return JSON.stringify({
    scope:privileged?'workspace':'owned_only',
    authorizedLeads:visible.length,activeLeads:active.length,
    wonLeads:visible.filter(l=>l.status==='won').length,
    openPipelineValue:format(total),
    highPriority:active.filter(l=>['urgent','high'].includes(l.priority)).length,
    overdueNextActions:overdue,
    stages:byStage,
    source:'authorized_crm_snapshot',
    warning:'Aggregated snapshot, no customer identities; do not invent customer details or causal outcomes.'
  })
}
const publicTopics: Array<[RegExp,string]>=[
  [/\b(?:jardina|paisagis|jardineir|condominio)/,'mercado jardinagem paisagismo condomínios Brasil vendas de serviços'],
  [/\b(?:psicolog|coaching|desenvolvimento humano)/,'mercado desenvolvimento humano coaching serviços Brasil'],
  [/\b(?:consultor|consultoria)/,'estratégias comerciais venda consultiva de serviços Brasil'],
  [/\b(?:software|saas|crm)/,'estratégias vendas B2B software CRM Brasil'],
  [/\b(?:marketing|agencia)/,'estratégias comerciais agência marketing serviços Brasil'],
]
/** Never send arbitrary user/CRM text to public search; use whitelisted generic topics. */
export function publicTopicForWorkflow(prompt:string):string|null{
  const s=norm(prompt)
  for(const [regex,topic] of publicTopics)if(regex.test(s))return topic
  return null
}
export async function getWorkflowPlan(prompt:string,context:AssistantContext={},
  fetcher:typeof runtimeFetch=runtimeFetch):Promise<WorkflowPlan|null>{
  if(!shouldRunContextualWorkflow(prompt,context))return null
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),17000)
  try{
    const response=await fetcher(env.agentGatewayUrl+'/tools/workflow-plan',{
      method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,
      body:JSON.stringify({prompt:prompt.slice(0,1400)})
    })
    if(!response.ok)return null
    const payload=await response.json() as {ok?:boolean;plan?:unknown}
    return payload.ok===true?validateWorkflowPlan(payload.plan,prompt):null
  }catch{return null}finally{clearTimeout(timer)}
}
type LocalWorkflowReply={ok?:boolean;answer?:unknown;document?:unknown}
export async function runContextualWorkflow(prompt:string,snapshot:WorkspaceSnapshot,context:AssistantContext={},
  options:{planner?:typeof getWorkflowPlan;researcher?:typeof answerExternalResearch;fetcher?:typeof runtimeFetch}={}):Promise<AssistantAnswer|null>{
  if(!shouldRunContextualWorkflow(prompt,context))return null
  const crm=authorizedCrmSummary(snapshot,context)
  if(!crm)return {id:'workflow:forbidden:'+Date.now(),intent:'unknown',title:'Sem acesso ao contexto',
    text:'Não tenho permissão para consultar os dados deste CRM com o usuário atual. Nenhum documento foi criado.',
    items:[],facts:[],suggestedPrompts:[],generatedAt:new Date().toISOString()}
  const plan=await (options.planner??getWorkflowPlan)(prompt,context)
  if(!plan)return null
  let evidence:AssistantAnswer|null=null
  if(plan.tasks.includes('web_research')){
    const topic=publicTopicForWorkflow(prompt)
    if(topic) evidence=await (options.researcher??answerExternalResearch)(topic,
      {conversationContext:'',activeWork:null,recentResearchTopic:''},options.fetcher??runtimeFetch,true)
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000)
  try{
    const response=await (options.fetcher??runtimeFetch)(env.agentGatewayUrl+'/tools/workflow-synthesize',{
      method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,
      body:JSON.stringify({
        prompt:prompt.slice(0,1400),
        crmSummary:crm,
        researchAnswer:evidence?.researchSources?.length?evidence.text.slice(0,6400):'',
        sources:(evidence?.researchSources??[]).map(s=>({title:s.title,url:s.url,reading:s.reading})).slice(0,5),
        recentConversation:(context.conversationContext||'').slice(-2000),
        currentDocument:(context.activeWork?.body||'').slice(0,2500),
      })
    })
    if(!response.ok)throw Error('model_unavailable')
    const payload=await response.json() as LocalWorkflowReply
    const answer=typeof payload.answer==='string'?payload.answer.trim().slice(0,8500):''
    const document=typeof payload.document==='string'?payload.document.trim().slice(0,12000):''
    if(!payload.ok||!answer||!document)throw Error('incomplete_result')
    return {
      id:'workflow:v6.3:'+Date.now(),intent:'crm_capability',title:'Análise e plano comercial',
      text:answer,items:[],facts:[],
      suggestedPrompts:['Detalhe as prioridades do plano','Transforme este plano em checklist'],
      researchSources:evidence?.researchSources,
      generatedAt:new Date().toISOString(),
      // Reuse the existing revisioned, user-confirmed Playbook workspace.
      toolOutput:{kind:'script',title:'Plano comercial — rascunho para revisão',
        body:document,channel:'meeting',leadId:null,grounded:true}
    }
  }catch{
    return {id:'workflow:unavailable:'+Date.now(),intent:'unknown',title:'Planejamento incompleto',
      text:'Consultei somente os dados autorizados do CRM, mas o Qwen não concluiu um plano verificável. O documento anterior foi preservado; tente novamente quando o Ollama estiver disponível.',
      items:[],facts:[],suggestedPrompts:[],generatedAt:new Date().toISOString(),
      researchSources:evidence?.researchSources}
  }finally{clearTimeout(timer)}
}
