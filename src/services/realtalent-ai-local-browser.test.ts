import {beforeEach,describe,expect,it,vi} from 'vitest'

vi.mock('../lib/env',()=>({env:{agentGatewayUrl:'/api/runtime/agent'}}))

import {forgetLocalAiPairing,localAiPairingPresent,pairLocalAi,tryLocalAiBrowserRequest,getLocalAiBrowserState} from './realtalent-ai-local-browser'

const token='a'.repeat(64)
let memory:Map<string,string>
beforeEach(()=>{
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
})
