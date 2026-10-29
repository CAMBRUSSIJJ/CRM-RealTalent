import type {AppRoute,WorkspaceSnapshot} from '../domain/types'
import type {AssistantAnswer} from './realtalent-assistant'
import type {AgentConversationTurn} from './realtalent-agent-v4-conversation'
import {env} from '../lib/env'
import {runtimeFetch} from './realtalent-runtime-transport'
import {
  createProspectingAgentJob,existingProspectingIdentityKeys,getProspectingAgentHealth,
  listProspectingAgentJobs,type ProspectingAgentJob,
} from './prospecting-linux-agent'
import {readProspectingState,type ProspectRecord} from './prospecting-workspace'
import {rankProspects} from './prospecting-intelligence'
import {explainProspectScore} from './prospecting-g1g2-intelligence'

export const GARIMPO_REVIEW_REQUEST='realtalent:garimpo:open-review'
export const garimpoReviewStorageKey=(workspaceId:string)=>'realtalent:garimpo:review:v1:'+encodeURIComponent(workspaceId)
const normalized=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
const isActive=(job:ProspectingAgentJob)=>['queued','running','paused'].includes(job.status)
const isReadable=(p:ProspectRecord,userId:string|null,privileged:boolean)=>
  privileged||p.createdBy===userId
const bounded=(s:unknown,max:number)=>typeof s==='string'?s.trim().slice(0,max):''
const summary=(title:string,text:string,facts:string[]=[]):AssistantAnswer=>({
  id:'garimpo-native:'+Date.now()+':'+Math.random().toString(36).slice(2,6),
  intent:'unknown',title,text,items:[],facts,suggestedPrompts:[],
  generatedAt:new Date().toISOString(),
})
/** Only explicit requests for Garimpo work enter the specialized planner.
 * Does NOT redirect generic CRM conversations or email/WhatsApp actions. */
export function wantsGarimpoNativeTool(prompt:string,route:AppRoute,history:AgentConversationTurn[]=[]):boolean {
  const text=normalized(prompt)
  const explicit=/\b(garimpo|prospeccao territorial)\b/.test(text)
  const discovery=/\b(busque|buscar|encontre|encontrar|ache|achar|pesquise|pesquisar|procure|procurar|localize|localizar|garimpe|garimpar|liste|listar)\b/.test(text)
  const company=/\b(empresas?|estabelecimentos?|negocios?|comercios?|prestadores?|fornecedores?)\b/.test(text)
  const review=/\b(revis(?:ao|ar)|prioriz(?:ar|e)|qual(?:is|ificar)|resultados?|encontrad[ao]s?|dessas?|delas?|daquelas?)\b/.test(text)
  const relatedHistory=history.slice(-2).some(turn=>/\b(garimpo|busca iniciada|empresas encontradas|prospeccao)\b/.test(normalized(turn.user+' '+turn.assistant)))
  return (explicit && (discovery||company||review)) ||
    (route==='prospecting' && ((discovery&&company)||(review&&relatedHistory)))
}

interface ModelPlan{
  intent:'search'|'rank'|'review'|'answer'|'clarify'
  segment:string;city:string;quantity:number;confidence:number;answer:string
}
export const isModelPlan=(p:unknown):p is ModelPlan=>{
  if(!p||typeof p!=='object')return false
  const v=p as Partial<ModelPlan>
  return ['search','rank','review','answer','clarify'].includes(String(v.intent))&&
    typeof v.segment==='string'&&typeof v.city==='string'&&
    typeof v.quantity==='number'&&Number.isInteger(v.quantity)&&v.quantity>=1&&v.quantity<=150&&
    typeof v.confidence==='number'&&v.confidence>=0&&v.confidence<=1&&typeof v.answer==='string'
}
export interface GarimpoBridgeInput{
  prompt:string;route:AppRoute;workspaceId:string;currentUserId:string|null
  snapshot:WorkspaceSnapshot;history:AgentConversationTurn[]
  canView:boolean;canSearch:boolean
  onNavigateToGarimpo:(review:boolean)=>void
}
export interface GarimpoBridgeDependencies{
  listJobs:typeof listProspectingAgentJobs
  health:typeof getProspectingAgentHealth
  createJob:typeof createProspectingAgentJob
  localState:typeof readProspectingState
  fetcher:typeof runtimeFetch
}
const defaults:GarimpoBridgeDependencies={
  listJobs:listProspectingAgentJobs,health:getProspectingAgentHealth,
  createJob:createProspectingAgentJob,localState:readProspectingState,fetcher:runtimeFetch,
}
const errorAnswer=(message:string)=>summary('Garimpo não executado',message)
const trustworthyJobSummary=(job:ProspectingAgentJob):AssistantAnswer=>{
  const unique=Math.max(0,job.stats?.unique??0)
  const ready=Math.max(0,job.stats?.ready??0)
  return summary('Busca real no Garimpo',
    'Já existe uma busca '+(job.status==='paused'?'pausada':'em execução')+' para '+job.input.segment+
    ' em '+job.input.regions.join(', ')+'. Encontrei '+unique+' registro(s) único(s) até agora; '+
    ready+' estão prontos para revisão. A meta é '+job.input.targetQuantity+
    ', mas o resultado final depende das fontes públicas. Não iniciarei uma busca duplicada.',
    ['Execução: '+job.id,'Status: '+job.status])
}
const visibleProspects=(prospects:ProspectRecord[],userId:string|null,role:string)=>
  prospects.filter(p=>isReadable(p,userId,role==='owner'||role==='admin'))

/** Returns null to leave the original Agent alone. A handled operation always
 * returns an evidence-backed response, never falls back to hypothetical lists. */
export async function handleGarimpoFromMainAgent(
  input:GarimpoBridgeInput,inject:Partial<GarimpoBridgeDependencies>={},
):Promise<AssistantAnswer|null>{
  if(!wantsGarimpoNativeTool(input.prompt,input.route,input.history))return null
  if(!input.canView||!input.workspaceId)return errorAnswer('Você não tem acesso à revisão do Garimpo neste workspace.')
  const deps={...defaults,...inject}
  let jobs:ProspectingAgentJob[]=[]
  try{jobs=await deps.listJobs(input.workspaceId)}
  catch{return errorAnswer('Não consegui consultar o motor do Garimpo. Confira se o serviço local está funcionando. Não executei nem simulei uma pesquisa.')}
  const lastJob=jobs[0]??null
  const context={segment:lastJob?.input.segment??'',city:lastJob?.input.regions.join('; ')??'',
    quantity:lastJob?.input.targetQuantity??40,totalKnown:jobs[0]?.stats?.unique??0}
  const recent=input.history.slice(-6).flatMap(turn=>[
    {role:'user',text:bounded(turn.user,400)},{role:'assistant',text:bounded(turn.assistant,400)}
  ])
  let plan:ModelPlan
  try{
    const ctrl=new AbortController()
    const timer=setTimeout(()=>ctrl.abort(),52000)
    try{
      const response=await deps.fetcher(env.agentGatewayUrl+'/tools/garimpo-conversation',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,
        body:JSON.stringify({prompt:input.prompt.slice(0,1100),context,history:recent.slice(-6)})
      })
      if(!response.ok)throw Error('Ollama ou gateway indisponível (HTTP '+response.status+').')
      const data=await response.json() as {ok?:boolean;plan?:unknown}
      if(!data.ok||!isModelPlan(data.plan))throw Error('A IA não retornou um plano validado.')
      plan=data.plan
    }finally{clearTimeout(timer)}
  }catch(error){
    return errorAnswer('Não consegui interpretar o pedido usando o Qwen3 local: '+
      (error instanceof Error?error.message:'falha desconhecida')+
      '. Nenhuma lista foi inventada nem pesquisa simulada.')
  }
  // A direct command to find companies must NOT be downgraded to advice.
  if(/\b(busque|buscar|encontre|encontrar|ache|achar|pesquise|pesquisar|procure|procurar|garimpe|garimpar|localize|localizar)\b/.test(normalized(input.prompt)) &&
    plan.intent!=='search' && plan.intent!=='clarify')
    return errorAnswer('Entendi que você solicitou uma busca real, mas não obtive os parâmetros de pesquisa com segurança. Informe segmento e cidade; não vou substituir a busca por exemplos fictícios.')

  if(plan.intent==='clarify')return summary('Preciso de um detalhe para buscar',bounded(plan.answer,450)||'Qual segmento e cidade você quer pesquisar?')
  if(plan.intent==='search'){
    if(!input.canSearch)return errorAnswer('Seu perfil permite consultar o Garimpo, mas não iniciar pesquisas neste workspace.')
    if(!plan.segment.trim()||!plan.city.trim()||plan.confidence<0.65)
      return summary('Confirmar região da busca','Qual segmento e cidade devo usar para pesquisar empresas reais?')
    const active=jobs.find(isActive)
    if(active){input.onNavigateToGarimpo(false);return trustworthyJobSummary(active)}
    const health=await deps.health()
    if(!health?.ok)return errorAnswer('O motor local de prospecção não está respondendo. Abra o inicializador do Garimpo (porta 4320) e tente novamente; nenhuma empresa foi criada.')
    const segment=bounded(plan.segment,100), regions=plan.city.split(/[;\n]+/).map(s=>s.trim()).filter(Boolean).slice(0,5)
    if(!regions.length)return summary('Confirmar região','Em qual cidade ou região devo pesquisar?')
    const sameTerritory=Boolean(lastJob)&&
      normalized(lastJob!.input.regions.join(';'))===normalized(regions.join(';'))
    const oldArea=lastJob?.input.areaMode
    const preserveMap=sameTerritory&&oldArea==='map'&&(lastJob?.input.mapPolygon?.length??0)>=3
    if(sameTerritory&&oldArea==='map'&&!preserveMap)
      return errorAnswer('A última busca usou uma área desenhada, mas não há polígono válido. Confirme a área no mapa antes de iniciar.')
    try{
      const created=await deps.createJob({
        workspaceId:input.workspaceId,segment,regions,
        targetQuantity:plan.quantity,targetMode:'quantity',
        areaMode:preserveMap?'map':sameTerritory?(oldArea??'radius'):'radius',
        radiusKm:sameTerritory?(lastJob?.input.radiusKm??15):15,
        searchMode:'coverage',categoryMode:'exact',
        mapPolygon:preserveMap?lastJob?.input.mapPolygon:undefined,
        searchCenter:sameTerritory&&oldArea==='radius'?lastJob?.input.searchCenter:undefined,
        existingKeys:existingProspectingIdentityKeys(input.snapshot.leads),
        enrichWeb:true,enrichCnpj:true,browserFallback:true,
      })
      input.onNavigateToGarimpo(false)
      return summary('Busca iniciada no Garimpo',
        'Iniciei uma pesquisa REAL de '+plan.quantity+' empresa(s) do segmento '+segment+
        ' em '+regions.join(', ')+'. O motor territorial está trabalhando agora. '+
        'A quantidade é uma meta, não um total já encontrado. As empresas serão encaminhadas à Revisão conforme forem localizadas e verificadas. '+
        'Não aprovei registros nem enviei nada ao CRM.',
        ['Execução: '+created.id,'Status: '+created.status,'Fonte: motor territorial do Garimpo'])
    }catch(error){
      return errorAnswer('O motor do Garimpo recusou a busca: '+
        (error instanceof Error?error.message:'erro não identificado')+
        '. Não vou afirmar que encontrei empresas sem confirmação.')
    }
  }
  if(plan.intent==='review'){
    input.onNavigateToGarimpo(true)
    return summary('Revisão aberta','Abri a área Revisar do Garimpo. A aprovação e o envio ao CRM continuam manuais.')
  }
  if(plan.intent==='rank'){
    const local=visibleProspects(deps.localState(input.workspaceId).prospects,input.currentUserId,input.snapshot.workspace.role)
    if(local.length){
      const ranked=rankProspects(local,input.snapshot).slice(0,8)
      const lines=ranked.map(({prospect})=>{
        const s=explainProspectScore(prospect,input.snapshot)
        return prospect.company+' ('+prospect.city+'): ICP '+s.fit+
          '/100; potencial '+s.opportunity+'/100; confiança '+s.evidenceConfidence+
          '/100. '+(s.reasons[0]??s.uncertainties[0]??'Exige validação humana')+'.'
      })
      if(lines.length)return summary('Empresas reais para investigar',
        'Priorização de '+local.length+' registro(s) disponíveis no Garimpo, com base em evidências do CRM, não em intenção de compra presumida:\n'+
        lines.map((line,index)=>(index+1)+'. '+line).join('\n')+
        '\nAbra Revisar para conferir fontes e bloqueios antes da aprovação.')
    }
    const recentJob=jobs.find(job=>job.results.length>0)
    if(recentJob){
      const lines=recentJob.results.slice(0,8).map((candidate,index)=>String(index+1)+'. '+
        bounded(candidate.company||candidate.name,100)+' — '+bounded(candidate.city||recentJob.input.regions[0],80)+
        ' (qualificação: '+String(candidate.qualityStatus??'pendente')+')')
      return summary('Empresas encontradas pelo motor',
        'A execução '+recentJob.id+' retornou '+recentJob.stats.unique+
        ' empresa(s) única(s), segundo o motor. Ainda não há registros disponíveis para ranking G2. Alguns resultados para revisão:\n'+
        lines.join('\n')+'\nEstas empresas ainda precisam de validação; não são recomendações de compra.')
    }
    return summary('Ainda sem empresas qualificadas','Não há empresas reais disponíveis para priorizar. Inicie uma busca e acompanhe os resultados em Revisar.')
  }
  return summary('Garimpo',bounded(plan.answer,450)||
    'Posso iniciar uma busca real e depois mostrar os resultados disponíveis. Diga segmento, cidade e quantidade.')
}
