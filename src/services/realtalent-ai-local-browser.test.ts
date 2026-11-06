import {beforeEach,describe,expect,it,vi} from 'vitest'

vi.mock('../lib/env',()=>({env:{agentGatewayUrl:'/api/runtime/agent'}}))
import {env} from '../lib/env'

import {forgetLocalAiPairing,localAiPairingPresent,pairLocalAi,tryLocalAiBrowserRequest,getLocalAiBrowserState,
  localAiOnlyEnabled,setLocalAiOnlyEnabled} from './realtalent-ai-local-browser'

const token='a'.repeat(64)
let memory:Map<string,string>
beforeEach(()=>{
  env.agentGatewayUrl='/api/runtime/agent'
  memory=new Map()
  vi.stubGlobal('window',{localStorage:{
    getItem:(key:string)=>memory.get(key)??null,
    setItem:(key:string,value:string)=>{memory.set(key,value)},
    removeItem:(key:string)=>{memory.delete(key)},
  }})
  vi.restoreAllMocks()
})
describe('RealTalent local browser connector',()=>{
  it('pairs with one-time 6-digit code without exposing master runtime secret',async()=>{
    const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({ok:true,token}),{status:200}))
    vi.stubGlobal('fetch',fetcher)
    expect((await pairLocalAi('654321')).ok).toBe(true)
    expect(localAiPairingPresent()).toBe(true)
    expect(localAiOnlyEnabled()).toBe(true)
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:8798/browser/pair')
    const call=fetcher.mock.calls[0][1] as RequestInit
    expect(call.body).toBe('{"code":"654321"}')
    expect(JSON.stringify(call)).not.toContain('REALTALENT_AGENT_RUNTIME_TOKEN')
    forgetLocalAiPairing()
    expect(localAiPairingPresent()).toBe(false)
  })
  it('uses localhost only for allowed read-only Agent routes',async()=>{
    memory.set('realtalent:ai:browser-pairing:v1',token)
    const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response('{"ok":true}',{status:200}))
    vi.stubGlobal('fetch',fetcher)
    await tryLocalAiBrowserRequest('/api/runtime/agent/tools/chat',{method:'POST',body:'{}'})
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:8798/browser/tools/chat')
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials:'omit',headers:expect.objectContaining({'x-realtalent-browser-token':token}),
    })
    expect(await tryLocalAiBrowserRequest('/api/runtime/agent/capabilities/execute',{method:'POST'})).toBeNull()
    expect(await tryLocalAiBrowserRequest('/api/runtime/prospecting/tools/chat',{method:'POST'})).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('allows the company-ask endpoint through the authenticated browser bridge on hosted CRM',async()=>{
    memory.set('realtalent:ai:browser-pairing:v1',token)
    setLocalAiOnlyEnabled(true)
    const fetcher=vi.fn(async()=>new Response('{"ok":true}',{status:200}))
    vi.stubGlobal('fetch',fetcher)
    const result=await tryLocalAiBrowserRequest('/api/runtime/agent/tools/company-ask',{
      method:'POST',body:'{"company":"Salento Barbearia"}',
    })
    expect(result?.status).toBe(200)
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:8798/browser/tools/company-ask')
  })
  it('bypasses an outdated paired browser bridge only for the read-only company route in local Vite',async()=>{
    env.agentGatewayUrl='http://127.0.0.1:8791'
    memory.set('realtalent:ai:browser-pairing:v1',token)
    setLocalAiOnlyEnabled(true)
    vi.stubGlobal('window',{location:{origin:'http://127.0.0.1:5174'},
      localStorage:{
        getItem:(key:string)=>memory.get(key)??null,
        setItem:(key:string,value:string)=>{memory.set(key,value)},
        removeItem:(key:string)=>{memory.delete(key)},
      }})
    const fetcher=vi.fn(async()=>new Response('{}',{status:200}))
    vi.stubGlobal('fetch',fetcher)
    const result=await tryLocalAiBrowserRequest('http://127.0.0.1:8791/tools/company-ask',{
      method:'POST',body:'{}',
    })
    expect(result).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
    const unrelated=await tryLocalAiBrowserRequest('http://127.0.0.1:8791/capabilities/execute',{
      method:'POST',body:'{}',
    })
    expect(unrelated?.status).toBe(503)
  })
  it('returns offline after a network outage and preserves pairing for restart',async()=>{
    memory.set('realtalent:ai:browser-pairing:v1',token)
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline')}))
    expect(await getLocalAiBrowserState()).toBe('offline')
    expect(localAiPairingPresent()).toBe(true)
  })
  it('revokes stale pairing after 401 from local Agent',async()=>{
    memory.set('realtalent:ai:browser-pairing:v1',token)
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:401})))
    expect(await getLocalAiBrowserState()).toBe('not_paired')
    expect(localAiPairingPresent()).toBe(false)
  })
  it('never falls back to a paid cloud model when local-only is enabled and Linux is offline',async()=>{
    memory.set('realtalent:ai:browser-pairing:v1',token)
    setLocalAiOnlyEnabled(true)
    const fetcher=vi.fn(async()=>{throw new Error('linux_offline')})
    vi.stubGlobal('fetch',fetcher)
    const response=await tryLocalAiBrowserRequest('/api/runtime/agent/tools/chat',{method:'POST',body:'{}'})
    expect(response?.status).toBe(503)
    expect((await response?.json())?.error).toBe('local_ai_offline')
    expect(fetcher).toHaveBeenCalledTimes(1)
    const denied=await tryLocalAiBrowserRequest('/api/runtime/agent/capabilities/execute',{method:'POST'})
    expect(denied?.status).toBe(503)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('stays offline after a stale token is revoked, without quietly billing a cloud API',async()=>{
    memory.set('realtalent:ai:browser-pairing:v1',token)
    setLocalAiOnlyEnabled(true)
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:401})))
    const first=await tryLocalAiBrowserRequest('/api/runtime/agent/tools/health')
    expect(first?.status).toBe(503)
    expect(localAiPairingPresent()).toBe(false)
    expect(localAiOnlyEnabled()).toBe(true)
    const later=await tryLocalAiBrowserRequest('/api/runtime/agent/tools/chat',{method:'POST',body:'{}'})
    expect(later?.status).toBe(503)
  })
  it('can explicitly restore the prior cloud fallback when a user opts out of local-only',async()=>{
    memory.set('realtalent:ai:browser-pairing:v1',token)
    setLocalAiOnlyEnabled(false)
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline')}))
    expect(await tryLocalAiBrowserRequest('/api/runtime/agent/tools/chat',{method:'POST',body:'{}'})).toBeNull()
  })

})
