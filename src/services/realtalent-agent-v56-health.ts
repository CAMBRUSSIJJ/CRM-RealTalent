import {env} from '../lib/env'
import {runtimeFetch} from './realtalent-runtime-transport'

export interface AgentRuntimeHealth{
  connected:boolean
  runtimeConnected:boolean
  model:string
  modelInstalled:boolean
  researchConfigured:boolean
  issue:string
}

const unreachable=(issue:string):AgentRuntimeHealth=>({
  connected:false,runtimeConnected:false,model:'indisponível',
  modelInstalled:false,researchConfigured:false,issue,
})

const modelPresent=(available:string[],configured:string)=>{
  const normalized=configured.trim().toLowerCase()
  return Boolean(normalized)&&available.some(model=>{
    const name=model.trim().toLowerCase()
    return name===normalized||(normalized.endsWith(':latest')&&name===normalized.slice(0,-7))
  })
}

/**
 * Cloud Runtime (Oct/2026) supports /ai/status; newer local gateways provide
 * /tools/health. Never infer model availability from a gateway HTTP 200 alone.
 * The Vercel proxy authenticates requests; browsers must not receive runtime secrets.
 */
export async function getAgentRuntimeHealth(transport:typeof runtimeFetch=runtimeFetch):Promise<AgentRuntimeHealth>{
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),8500)
  const base=env.agentGatewayUrl.replace(/\/$/,'')
  try{
    let response=await transport(base+'/tools/health',{method:'GET',signal:controller.signal})
    if([404,405,501].includes(response.status)){
      response=await transport(base+'/ai/status',{method:'GET',signal:controller.signal})
      if(!response.ok){
        if(response.status===401||response.status===403)return unreachable('Acesso negado pelo Agent. Verifique a autenticação Vercel ↔ Railway.')
        return unreachable(response.status===404?'Gateway incompatível: endpoints de diagnóstico ausentes.':'Agent não respondeu: HTTP '+response.status+'.')
      }
      const data=await response.json() as {
        ok?:boolean; provider?:string; model?:string; local?:{online?:boolean;model?:string;models?:string[]}
      }
      if(data.ok!==true)return unreachable('O Agent retornou um diagnóstico inválido.')
      const model=String(data.local?.model||data.model||'não configurado').slice(0,80)
      const list=Array.isArray(data.local?.models)?data.local.models.filter((name):name is string=>typeof name==='string'):[]
      const online=data.local?.online===true
      return {connected:online,runtimeConnected:true,model,modelInstalled:online&&modelPresent(list,model),
        researchConfigured:false,issue:!online?'O Agent respondeu, mas o Ollama não está acessível.':
          !modelPresent(list,model)?'Ollama respondeu, mas o modelo configurado não está instalado.':''}
    }
    if(!response.ok){
      if(response.status===401||response.status===403)return unreachable('Acesso negado pelo Agent. Verifique a autenticação Vercel ↔ Railway.')
      return unreachable('O Agent não respondeu: HTTP '+response.status+'.')
    }
    const data=await response.json() as {ok?:boolean;ollamaConnected?:unknown;model?:unknown;modelInstalled?:unknown;researchConfigured?:unknown}
    if(data.ok!==true)return unreachable('O Agent retornou um diagnóstico inválido.')
    const online=data.ollamaConnected===true
    const installed=data.modelInstalled===true
    return {connected:online,runtimeConnected:true,model:typeof data.model==='string'?data.model.slice(0,80):'desconhecido',
      modelInstalled:installed,researchConfigured:data.researchConfigured===true,
      issue:!online?'O Agent respondeu, mas o Ollama não está acessível.':!installed?'O modelo configurado não foi encontrado no Ollama.':''}
  }catch(error){
    return unreachable(error instanceof Error&&error.name==='AbortError'?'Tempo limite ao consultar o Agent.':'Não foi possível acessar o Agent Runtime.')
  }finally{clearTimeout(timer)}
}
