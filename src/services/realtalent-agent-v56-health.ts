import {env} from '../lib/env'
import {runtimeFetch} from './realtalent-runtime-transport'

export interface AgentRuntimeHealth{
  connected:boolean
  model:string
  modelInstalled:boolean
  researchConfigured:boolean
}
export async function getAgentRuntimeHealth():Promise<AgentRuntimeHealth>{
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500)
    try{
      const response=await runtimeFetch(env.agentGatewayUrl+'/tools/health',{method:'GET',signal:controller.signal})
      if(!response.ok)throw Error('health unavailable')
      const data=await response.json() as {ok?:boolean,ollamaConnected?:unknown,model?:unknown,modelInstalled?:unknown,researchConfigured?:unknown}
      if(data.ok!==true)throw Error('invalid health')
      return {connected:data.ollamaConnected===true,model:typeof data.model==='string'?data.model.slice(0,80):'desconhecido',
        modelInstalled:data.modelInstalled===true,researchConfigured:data.researchConfigured===true}
    }finally{clearTimeout(timer)}
  }catch{return {connected:false,model:'indisponível',modelInstalled:false,researchConfigured:false}}
}
