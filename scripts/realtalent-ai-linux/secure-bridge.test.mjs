import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const BRIDGE=fileURLToPath(new URL('./secure-bridge.mjs',import.meta.url))
const secret='mock-secret--'.repeat(6)
const agentPort=19122, bridgePort=19128
const wait=ms=>new Promise(r=>setTimeout(r,ms))
test('Bridge secure: unauthorized, authorized, restricted and streamed',async()=>{
  const mock=http.createServer((req,res)=>{
    res.setHeader('content-type',req.url==='/tools/chat-stream'?'text/event-stream':'application/json')
    if(req.url==='/tools/chat-stream'){res.write('data: start\n\n');setTimeout(()=>res.end('data: end\n\n'),30);return}
    res.end(JSON.stringify({ok:true,path:req.url,method:req.method}))
  })
  await new Promise(resolve=>mock.listen(agentPort,'127.0.0.1',resolve))
  const child=spawn(process.execPath,[BRIDGE],{env:{...process.env,
    REALTALENT_AGENT_RUNTIME_TOKEN:secret,
    REALTALENT_BRIDGE_PORT:String(bridgePort),
    REALTALENT_AGENT_PORT:String(agentPort)
  },stdio:'ignore'})
  try{
    let started=false
    for(let i=0;i<60;i++){
      try{const r=await fetch('http://127.0.0.1:'+bridgePort+'/tools/health');if(r.status===401){started=true;break}}catch{}
      await wait(100)
    }
    assert.ok(started,'bridge should start')
    const url='http://127.0.0.1:'+bridgePort
    const unauth=await fetch(url+'/tools/health')
    assert.equal(unauth.status,401)
    const headers={'x-realtalent-agent-token':secret}
    const ok=await fetch(url+'/tools/health',{headers})
    assert.equal(ok.status,200)
    assert.deepEqual(await ok.json(),{ok:true,path:'/tools/health',method:'GET'})
    const forbidden=await fetch(url+'/ai/status',{headers})
    assert.equal(forbidden.status,404)
    const stream=await fetch(url+'/tools/chat-stream',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({message:'teste'})})
    assert.equal(stream.status,200)
    assert.equal(await stream.text(),'data: start\n\ndata: end\n\n')
  }finally{
    child.kill('SIGTERM')
    await new Promise(resolve=>mock.close(resolve))
  }
})
