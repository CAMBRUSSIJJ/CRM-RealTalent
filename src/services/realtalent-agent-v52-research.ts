import type { GeneratedCommercialScript } from './realtalent-agent-v41-scripts'
import { env } from '../lib/env'
import { runtimeFetch } from './realtalent-runtime-transport'

export interface ResearchSource { title:string; url:string }
export interface CommercialStrategy {
  audience:string
  approach:string
  rationale:string
  alternatives:string[]
  assumptions:string[]
  evidence:'external'|'contextual'
  sources:ResearchSource[]
}
export interface ResearchedCommercialScript { body:string;strategy:CommercialStrategy }

const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const words=(text:string)=>normalize(text).replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ')
const bounded=(text:string,max=160)=>text.replace(/\s+/g,' ').trim().slice(0,max)

/** Reuse the most recent strategic brief when the user replies to the
 * seller/offer clarification. Never attach it to an unrelated conversation. */
export function resumeScriptResearchPrompt(prompt:string,conversationContext=''):string{
  const entries=[...conversationContext.matchAll(/Usuário:\s*([^\n]{5,360})\nRealTalent:\s*Antes do roteiro:/g)]
  const last=entries.at(-1)
  if(!last)return prompt
  const lastExchange=conversationContext.slice(last.index??0)
  if(/\nUsuário:/g.test(lastExchange.slice(last[0].length)))return prompt
  const next=normalize(prompt)
  if(!/^(?:quero|eu|e para|seria para|para|vendo|vendemos|ofereco|oferecemos|o servico|o produto)\b/.test(next))return prompt
  return `${last[1]}. Esclarecimento: ${prompt}`.slice(0,1550)
}

export function diagnoseScriptResearchRequest(prompt:string):{
  targeted:boolean; missingPerspective:boolean; audience:string; question:string
}{
  const text=words(prompt)
  const targeted=/\b(voltad[oa]s? para|especific[oa]s? para|direcionad[oa]s? para|para (?:os |as |um |uma )?(?:jardineir\w*|autonom\w*|profission\w*|prestador\w*|empresa\w*|condomini\w*|clinica\w*|dentista\w*|arquiteto\w*)|publico.alvo|nicho|segmento)\b/.test(text)
  const niche=[...text.matchAll(/\bpara (?:os |as |um |uma )?([a-z]{5,}(?:\s+[a-z]{5,})?)/g)].at(-1)?.[1]??''
  const audience=bounded(niche || (targeted?'segmento citado na solicitação':''),65)
  const sellsTo=/\b(?:vender|vendendo|oferecer|oferecendo|comercializar|oferta de)\b.{0,80}\b(?:para|aos|as|a)\b/.test(text)
  const sellsAs=/\b(?:para|como) (?:um |uma )?(?:jardineiro|profissional|prestador)\b.{0,90}\b(?:vender|captar|conquistar|conseguir|oferecer)\b|\b(?:jardineir|profission)\w*\b.{0,50}\b(?:clientes|vender seus servicos|vender jardinagem)\b/.test(text)
  const offer=/\b(?:meu produto|minha solucao|meu servico|ofereco|vendemos|servico de|produto de|contrato de|manutencao de|prestacao de)\b/.test(text)
  // "prestação de serviço" describes a market category, not the offer being sold.
  const explicitOffer=offer && !(/prestacao de servico/.test(text)&&!/\b(?:meu produto|minha solucao|meu servico|ofereco|vendemos|servico de|produto de|contrato de|manutencao de)\b/.test(text))
  const missingPerspective=targeted && !(sellsAs || (sellsTo && explicitOffer))
  return {
    targeted,missingPerspective,audience,
    question:'Antes de escolher uma abordagem: você quer vender algo PARA esse público ou criar um roteiro PARA que esses profissionais vendam seus próprios serviços? Se for vender a eles, qual serviço ou produto você oferece?',
  }
}

const safeSources=(raw:unknown):ResearchSource[]=>{
  if(!Array.isArray(raw))return []
  return raw.flatMap((value):ResearchSource[]=>{
    if(!value||typeof value!=='object')return []
    const row=value as {title?:unknown;url?:unknown}
    if(typeof row.url!=='string'||typeof row.title!=='string')return []
    try{
      const url=new URL(row.url)
      if(url.protocol!=='https:' && url.protocol!=='http:')return []
      if(['localhost','127.0.0.1','::1'].includes(url.hostname)||url.username||url.password)return []
      return [{title:bounded(row.title,135),url:url.toString().slice(0,550)}]
    }catch{return []}
  }).slice(0,5)
}
const nonEmpty=(value:unknown,max=750)=>typeof value==='string'?bounded(value,max):''
export function parseResearchedScript(payload:unknown):ResearchedCommercialScript|null{
  if(!payload||typeof payload!=='object')return null
  const data=payload as Record<string,unknown>
  const body=typeof data.body==='string'?data.body.trim():''
  const strategy=data.strategy && typeof data.strategy==='object'?data.strategy as Record<string,unknown>:null
  if(!data.ok||body.length<160||body.length>9500||!strategy)return null
  const approach=nonEmpty(strategy.approach,280),rationale=nonEmpty(strategy.rationale,650)
  if(!approach||!rationale)return null
  const evidence=data.researchStatus==='external'?'external':'contextual'
  const sources=evidence==='external'?safeSources(data.sources):[]
  return {body,strategy:{
    audience:nonEmpty(strategy.audience,160)||'Público descrito na solicitação',
    approach,rationale,
    alternatives:Array.isArray(strategy.alternatives)?strategy.alternatives.map(x=>nonEmpty(x,220)).filter(Boolean).slice(0,3):[],
    assumptions:Array.isArray(strategy.assumptions)?strategy.assumptions.map(x=>nonEmpty(x,200)).filter(Boolean).slice(0,4):[],
    evidence:sources.length?'external':'contextual',
    sources,
  }}
}

export async function researchCommercialScript(
  prompt:string,draft:GeneratedCommercialScript,facts:string[]=[],
  fetcher:typeof runtimeFetch=runtimeFetch,
):Promise<ResearchedCommercialScript|null>{
  const diagnosis=diagnoseScriptResearchRequest(prompt)
  if(!diagnosis.targeted || diagnosis.missingPerspective)return null
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),22000)
  try{
    const response=await fetcher(`${env.agentGatewayUrl}/tools/research-script`,{
      method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        request:prompt.slice(0,1300),draft:draft.body.slice(0,6800),
        facts:facts.slice(0,5),channel:draft.kind,topic:diagnosis.audience,
      }),
    })
    if(!response.ok)return null
    return parseResearchedScript(await response.json())
  }catch{return null}
  finally{clearTimeout(timer)}
}
