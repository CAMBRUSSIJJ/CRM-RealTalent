import {describe,it,expect,vi} from 'vitest'
import {OllamaNdjsonParser,streamLocalConversation} from './realtalent-agent-v61-stream'
describe('Agent V6.1 streaming chat',()=>{
  it('reads incremental chunks and NDJSON split across boundaries',()=>{
    const messages:string[]=[]
    const p=new OllamaNdjsonParser(msg=>messages.push(msg))
    p.push('{"type":"delta","text":"Olá')
    p.push('!"}\n{"type":"delta","text":" Como posso ajudar?"}\n{"type":"done","model":"qwen3:8b"}\n')
    expect(messages).toEqual(['Olá!','Olá! Como posso ajudar?'])
    expect(p.result()).toEqual({text:'Olá! Como posso ajudar?',model:'qwen3:8b'})
  })
  it('does not accept incomplete stream as successful response',()=>{
    const p=new OllamaNdjsonParser(()=>{})
    p.push('{"type":"delta","text":"Resposta parcial"}\n')
    expect(p.result()).toBeNull()
  })
  it('delivers user-visible partial answer from a real ReadableStream',async()=>{
    const fetcher=vi.fn(async()=>({ok:true,body:new ReadableStream<Uint8Array>({
      start(c){
        const encode=new TextEncoder()
        c.enqueue(encode.encode('{"type":"delta","text":"Primeira "}\n'))
        c.enqueue(encode.encode('{"type":"delta","text":"ideia."}\n{"type":"done","model":"qwen3:8b"}\n'))
        c.close()
      }
    })} as Response))
    const received:string[]=[]
    const reply=await streamLocalConversation('explique a estratégia','histórico',v=>received.push(v),fetcher)
    expect(reply?.text).toBe('Primeira ideia.')
    expect(received).toHaveLength(2)
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
