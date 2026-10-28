import type { AssistantAnswer, AssistantContext } from './realtalent-assistant'
import { requestsExternalResearch, isExplicitCrmMutation } from './realtalent-agent-v56-intents'
import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'

export interface ResearchCitation {title:string;url:string;excerpt?:string;reading?:'page'|'snippet'}
export interface ResearchResult {
  ok?:boolean;error?:string;answer?:unknown;adaptedBody?:unknown;
  sources?:unknown;model?:unknown
}
export const validResearchSources=(raw:unknown):ResearchCitation[]=>{
  if(!Array.isArray(raw))return []
  const seen=new Set<string>()
  return raw.flatMap((entry):ResearchCitation[]=>{
    if(!entry || typeof entry!=='object')return []
    const item=entry as {title?:unknown;url?:unknown;excerpt?:unknown;reading?:unknown}
    if(typeof item.title!=='string'||typeof item.url!=='string')return []
    try{
      const url=new URL(item.url)
      if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.') ||
         ['localhost','127.0.0.1','::1'].includes(url.hostname)||seen.has(url.href))return []
      seen.add(url.href)
      return [{title:item.title.slice(0,150),url:url.href.slice(0,550),
        excerpt:typeof item.excerpt==='string'?item.excerpt.slice(0,350):undefined,
        reading:item.reading==='page'?'page':'snippet'}]
    }catch{return []}
  }).slice(0,5)
}
export async function answerExternalResearch(prompt:string,context:AssistantContext={},
  fetcher:typeof runtimeFetch=runtimeFetch,forced=false):Promise<AssistantAnswer|null>{
  const followup=Boolean(context.recentResearchTopic) &&
    !isExplicitCrmMutation(prompt) &&
    /\b(?:com base|nesse estudo|nessa pesquisa|nessas fontes|princ[ií]pios|compare as abordagens|o que (?:achou|encontrou)|adapte o que|aplique isso)\b/i.test(prompt)
  if(!forced && !requestsExternalResearch(prompt) && !followup)return null
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),115000)
  const base={intent:'unknown' as const,items:[],facts:[],suggestedPrompts:[],
    generatedAt:new Date().toISOString()}
  try{
    const response=await fetcher(env.agentGatewayUrl+'/tools/research',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({question:(followup ? context.recentResearchTopic+' — '+prompt : prompt).slice(0,1400),
        history:(context.conversationContext||'').slice(-2700),
        // Only the explicit question reaches the public search service.
        // Previous conversation and document are passed to LOCAL Ollama only.
        activeDocument:context.activeWork?.body.slice(0,6000)||null}),
    })
    const payload=await response.json() as ResearchResult
    if(!response.ok || !payload.ok){
      const unavailable=payload.error==='search_not_configured'?
        'A pesquisa na internet ainda não está configurada. Ative uma instância SearXNG no runtime local para obter fontes verificáveis.' :
        'Não consegui consultar fontes externas nesta tentativa. O roteiro anterior foi preservado; não vou inventar referências.'
      return {...base,id:'research:unavailable:'+Date.now(),title:'Pesquisa indisponível',text:unavailable}
    }
    const sources=validResearchSources(payload.sources)
    if(!sources.length)return {...base,id:'research:empty:'+Date.now(),title:'Nenhuma fonte verificável',
      text:'A busca não retornou fontes públicas verificáveis. Não vou atribuir um roteiro a um autor sem evidências.'}
    const answer=typeof payload.answer==='string'?payload.answer.slice(0,8500):''
    const adapted=typeof payload.adaptedBody==='string'?payload.adaptedBody.trim().slice(0,9000):''
    const work=context.activeWork
    return {...base,id:'research:verified:'+Date.now(),title:'Análise com fontes verificáveis',
      text:answer || 'Encontrei fontes públicas para avaliar, mas a análise do modelo não ficou disponível.',
      researchSources:sources,
      ...(adapted ? {toolOutput:{kind:'script' as const,title:work?.title||'Roteiro original baseado na pesquisa',body:adapted,
        channel:work?.channel||(/whatsapp/i.test(prompt)?'whatsapp' as const:'call' as const),
        leadId:work?.leadId||null,grounded:Boolean(work?.leadId),strategy:work?.strategy}} : {}),
      suggestedPrompts:['Adapte os princípios ao meu público','Compare as abordagens encontradas']}
  }catch{
    return {...base,id:'research:error:'+Date.now(),title:'Pesquisa indisponível',
      text:'Não consegui consultar a pesquisa externa agora. Confira a conexão com o runtime local e o SearXNG. Nenhuma fonte foi inventada.'}
  }finally{clearTimeout(timer)}
}
