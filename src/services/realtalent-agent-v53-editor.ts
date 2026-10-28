import type { AssistantAnswer, AssistantContext } from './realtalent-assistant'
import type { WorkspaceSnapshot } from '../domain/types'
import type { AgentWorkDocument } from './realtalent-agent-v53-work'
import { isWorkContinuation } from './realtalent-agent-v53-work'
import { retrieveAgentKnowledge } from './realtalent-agent-v53-knowledge'
import { rankRelevantCRMContext } from './realtalent-agent-v5-cognitive'
import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'
import { evaluateAgentWork } from './realtalent-agent-v53-quality'

const safe=(value:string)=>value.slice(0,9000)
export async function classifyDocumentFollowup(prompt:string,work:AgentWorkDocument,
  fetcher:typeof runtimeFetch=runtimeFetch):Promise<boolean>{
  if(isWorkContinuation(prompt,work))return true
  if(prompt.length>240 || /^(quem|quantos|qual a meta|liste|calcule|crie uma tarefa|agende|envie|registre)/i.test(prompt))return false
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5500)
  try{
    const response=await fetcher(env.agentGatewayUrl+'/tools/classify-work',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({prompt:prompt.slice(0,320),kind:work.kind,title:work.title,summary:work.body.slice(0,600)}),
    })
    if(!response.ok)return false
    const data=await response.json() as {ok?:boolean,intent?:string,confidence?:number}
    return data.ok===true&&data.intent==='revise'&&typeof data.confidence==='number'&&data.confidence>=0.8
  }catch{return false}finally{clearTimeout(timer)}
}
type RevisionResponse={ok?:boolean;body?:unknown;strategy?:unknown;notes?:unknown;model?:unknown}
export async function reviseAgentWork(prompt:string,work:AgentWorkDocument,snapshot:WorkspaceSnapshot,
  context:AssistantContext,fetcher:typeof runtimeFetch=runtimeFetch):Promise<AssistantAnswer>{
  const facts=[...rankRelevantCRMContext(prompt,snapshot,context),
    ...retrieveAgentKnowledge(prompt,snapshot,context)].slice(0,7)
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000)
  let newBody='',reason='',proposedStrategy=work.strategy
  try{
    const response=await fetcher(env.agentGatewayUrl+'/tools/revise-work',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({request:prompt.slice(0,1700),
        document:{title:work.title,body:safe(work.body),channel:work.channel,
          strategy:work.strategy,revisionCount:work.revisions.length},
        facts}),
    })
    if(response.ok){
      const payload=await response.json() as RevisionResponse
      if(payload.ok && typeof payload.body==='string')newBody=payload.body.trim().slice(0,9000)
      if(payload.strategy && typeof payload.strategy==='object'){
        // The runtime cannot manufacture citations; only retain previously
        // vetted sources. Any new strategy is explicitly contextual.
        const row=payload.strategy as {audience?:unknown;approach?:unknown;rationale?:unknown}
        if(typeof row.approach==='string'&&typeof row.rationale==='string'){
          proposedStrategy={
            audience:typeof row.audience==='string'?row.audience.slice(0,160):work.strategy?.audience??'Público a confirmar',
            approach:row.approach.slice(0,250),rationale:row.rationale.slice(0,550),
            alternatives:[],assumptions:['A adequação ao segmento deve ser validada com clientes reais.'],
            evidence:'contextual',sources:[],
          }
        }
      }
    }
  }catch(error){reason=error instanceof Error&&error.name==='AbortError'?'O modelo demorou para responder.':'O modelo de revisão não está disponível.'}
  finally{clearTimeout(timer)}
  const base:AssistantAnswer={
    id:'work-edit:'+Date.now(),intent:'crm_capability',title:work.title,
    text:'',items:[],facts:[],suggestedPrompts:['Deixe a abertura mais consultiva','Adapte o roteiro ao público'],
    toolOutput:{kind:'script',title:work.title,body:newBody||work.body,channel:work.channel,
      grounded:Boolean(work.leadId),leadId:work.leadId,strategy:proposedStrategy},
    generatedAt:new Date().toISOString(),
  }
  const check=evaluateAgentWork(base,work.body)
  const meaningfullyChanged=newBody.length>=180&&newBody!==work.body&&
    !check.warnings.some(w=>w.includes('afirma pesquisa externa'))
  if(!meaningfullyChanged){
    base.toolOutput={kind:'script',title:work.title,body:work.body,channel:work.channel,
      grounded:Boolean(work.leadId),leadId:work.leadId,strategy:work.strategy}
    base.title='Roteiro preservado — revisão não concluída'
    base.text=(reason||'Não consegui gerar uma revisão verificável nesta tentativa.')+
      ' Mantive a versão anterior. Conecte o Ollama ao runtime ou tente novamente; não vou substituir o texto por um modelo genérico.'
    return base
  }
  base.text='Atualizei o roteiro existente, mantendo o documento ativo e criando uma nova versão. '+
    'A recomendação é contextual; não foi feita pesquisa externa nesta edição.'
  base.facts=check.warnings
  return base
}
