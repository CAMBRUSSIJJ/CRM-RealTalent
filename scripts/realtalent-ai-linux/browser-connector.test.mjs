import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {issuePairingCode} from './browser-connector.mjs'

const directory=mkdtempSync(path.join(tmpdir(),'realtalent-browser-auth-'))
process.env.REALTALENT_AI_CONFIG_DIR=directory
const gatewayPort=19321,bridgePort=19322
const url='http://127.0.0.1:'+bridgePort
const validOrigin='https://crm-real-talent.vercel.app'
const originHeaders={Origin:validOrigin}
const secret='real-runtime-secret-'.repeat(4)
const fixture=fileURLToPath(new URL('./secure-bridge.mjs',import.meta.url))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const mock=http.createServer((req,res)=>{
  if(req.url==='/tools/chat-stream'){
    res.writeHead(200,{'content-type':'application/x-ndjson'})
    res.write('{"type":"delta","text":"Olá"}\n')
    setTimeout(()=>res.end('{"type":"done","model":"qwen3:8b"}\n'),20)
  }else{
    res.writeHead(200,{'content-type':'application/json'})
    res.end(JSON.stringify({ok:true,ollamaConnected:true,modelInstalled:true,model:'qwen3:8b',path:req.url}))
  }
})
test('browser pair: origin, preflight, authentication, read-only and streaming',async()=>{
  await new Promise(resolve=>mock.listen(gatewayPort,'127.0.0.1',resolve))
  const child=spawn(process.execPath,[fixture],{env:{...process.env,
    REALTALENT_AGENT_RUNTIME_TOKEN:secret,
    REALTALENT_BRIDGE_PORT:String(bridgePort),REALTALENT_AGENT_PORT:String(gatewayPort),
  },stdio:'ignore'})
  try{
    let online=false
    for(let i=0;i<50;i++){
      try{const r=await fetch(url+'/browser/ping',{headers:originHeaders});if(r.status===200){online=true;break}}catch{}
      await delay(100)
    }
    assert.ok(online,'bridge should start')
    const preflight=await fetch(url+'/browser/pair',{method:'OPTIONS',
      headers:{...originHeaders,'Access-Control-Request-Private-Network':'true'}})
    assert.equal(preflight.status,204)
    assert.equal(preflight.headers.get('access-control-allow-private-network'),'true')
    const v101=await fetch(url+'/browser/ping',{headers:{Origin:'http://127.0.0.1:5174'}})
    assert.equal(v101.status,200,'modern V101 WAHA preview localhost should be authorized')
    const v101localhost=await fetch(url+'/browser/ping',{headers:{Origin:'http://localhost:5174'}})
    assert.equal(v101localhost.status,200,'localhost variant should also be authorized')
    const evil=await fetch(url+'/browser/ping',{headers:{Origin:'https://untrusted.example'}})
    assert.equal(evil.status,403)
    const missingOrigin=await fetch(url+'/browser/ping')
    assert.equal(missingOrigin.status,403)
    const noPair=await fetch(url+'/browser/tools/health',{headers:originHeaders})
    assert.equal(noPair.status,401)
    const {code}=issuePairingCode()
    const bad=await fetch(url+'/browser/pair',{method:'POST',headers:{...originHeaders,'Content-Type':'application/json'},
      body:JSON.stringify({code:'000xxx'})})
    assert.equal(bad.status,400)
    const pair=await fetch(url+'/browser/pair',{method:'POST',headers:{...originHeaders,'Content-Type':'application/json'},
      body:JSON.stringify({code})})
    assert.equal(pair.status,200)
    const {token}=await pair.json()
    assert.match(token,/^[0-9a-f]{64}$/)
    const reused=await fetch(url+'/browser/pair',{method:'POST',headers:{...originHeaders,'Content-Type':'application/json'},body:JSON.stringify({code})})
    assert.equal(reused.status,403)
    const headers={...originHeaders,'x-realtalent-browser-token':token}
    const health=await fetch(url+'/browser/tools/health',{headers})
    assert.equal(health.status,200)
    assert.equal((await health.json()).model,'qwen3:8b')
    assert.equal(health.headers.get('access-control-allow-origin'),validOrigin)
    const denied=await fetch(url+'/browser/capabilities/execute',{method:'POST',headers})
    assert.equal(denied.status,404)
    const streamed=await fetch(url+'/browser/tools/chat-stream',{method:'POST',headers:{
      ...headers,'Content-Type':'application/json'},body:JSON.stringify({prompt:'Olá'})})
    assert.equal(streamed.status,200)
    assert.match(await streamed.text(),/qwen3:8b/)
    const stolen=await fetch(url+'/browser/tools/health',{headers:{...headers,Origin:'http://localhost:4188'}})
    assert.equal(stolen.status,401,'session must be origin-bound')
  }finally{
    child.kill('SIGTERM')
    await new Promise(resolve=>mock.close(resolve))
    rmSync(directory,{force:true,recursive:true})
  }
})
