import {describe,expect,it,vi} from 'vitest'
import {getAgentRuntimeHealth} from './realtalent-agent-v56-health'
import type {runtimeFetch} from './realtalent-runtime-transport'

const respond=(status:number,data:unknown)=>({ok:status>=200&&status<300,status,json:async()=>data} as Response)
const transport=(handler:(url:string)=>Response)=>vi.fn(async(input:string)=>handler(input)) as unknown as typeof runtimeFetch

describe('Agent Runtime cloud health compatibility',()=>{
  it('falls back from local /tools/health to legacy cloud /ai/status',async()=>{
    const fn=transport(url=>url.endsWith('/tools/health')?respond(404,{}):respond(200,{
      ok:true,provider:'ollama',model:'qwen3:8b',local:{model:'qwen3:8b',online:true,models:['qwen3:8b']},
    }))
    const result=await getAgentRuntimeHealth(fn)
    expect(result.runtimeConnected).toBe(true)
    expect(result.modelInstalled).toBe(true)
    expect(result.connected).toBe(true)
    expect(result.model).toBe('qwen3:8b')
  })
  it('reports authentication error without calling other endpoints',async()=>{
    const fn=transport(()=>respond(401,{ok:false,error:'unauthorized_runtime'}))
    const result=await getAgentRuntimeHealth(fn)
    expect(result.runtimeConnected).toBe(false)
    expect(result.issue).toMatch(/autenticação/i)
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('does not report a model installed just because Ollama responds',async()=>{
    const fn=transport(url=>url.endsWith('/tools/health')?respond(404,{}):respond(200,{
      ok:true,local:{online:true,model:'qwen3:8b',models:['qwen3:4b']},
    }))
    const result=await getAgentRuntimeHealth(fn)
    expect(result.connected).toBe(true)
    expect(result.modelInstalled).toBe(false)
    expect(result.issue).toMatch(/não está instalado/)
  })
  it('preserves the current local health contract',async()=>{
    const fn=transport(()=>respond(200,{ok:true,ollamaConnected:true,model:'qwen3:8b',modelInstalled:true,researchConfigured:true}))
    const result=await getAgentRuntimeHealth(fn)
    expect(result).toMatchObject({runtimeConnected:true,connected:true,modelInstalled:true,researchConfigured:true,issue:''})
  })
})
