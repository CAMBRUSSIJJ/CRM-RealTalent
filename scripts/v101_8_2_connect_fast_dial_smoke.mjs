import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(), port=Number(process.env.REALTALENT_CONNECT_SMOKE_PORT||4402), phoneStore=path.join('/tmp',`rt-phone-v10182-${port}.json`), runtimeStore=path.join('/tmp',`rt-runtime-v10182-${port}.json`), base=`http://127.0.0.1:${port}`
for(const f of [phoneStore,runtimeStore]) try{fs.rmSync(f,{force:true})}catch{}
let server,stderr=''; const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const request=async(url,opts={})=>{const response=await fetch(base+url,opts); const text=await response.text(); let data={}; try{data=JSON.parse(text)}catch{} return {response,data,text}}
function launch(){server=spawn(process.execPath,['scripts/realtalent-connect-server.mjs'],{cwd:root,stdio:['ignore','ignore','pipe'],env:{...process.env,REALTALENT_CONNECT_PORT:String(port),REALTALENT_CRM_PORT:'4188',REALTALENT_CONNECT_HOST:'127.0.0.1',REALTALENT_PHONE_STORE:phoneStore,REALTALENT_CONNECT_RUNTIME_STORE:runtimeStore,TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_FROM_NUMBER:'',REALTALENT_AGENT_PHONE_NUMBER:''}});server.stderr.on('data',c=>stderr+=String(c))}
async function stop(){if(!server||server.exitCode!==null)return;await new Promise(resolve=>{const t=setTimeout(()=>{try{server.kill('SIGKILL')}catch{};resolve()},1800);server.once('exit',()=>{clearTimeout(t);resolve()});try{server.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function waitReady(){for(let i=0;i<40;i++){try{const {response,data}=await request('/api/voice/v1/health');if(response.ok&&['101.8.2','101.8.3'].includes(data.releaseVersion))return data}catch{}await sleep(100)}throw new Error('Connect V101.8.2 não iniciou: '+stderr)}
const nextMessage=(ws,timeout=1800)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout websocket')),timeout);const handler=(e)=>{clearTimeout(t);ws.removeEventListener('message',handler);resolve(JSON.parse(String(e.data)))};ws.addEventListener('message',handler)})
try{
 launch(); await waitReady()
 const pairing=await request('/api/phone/v1/pairing?workspaceId=qa-v10182'); if(!pairing.response.ok||!pairing.data.code) throw new Error('pairing indisponível')
 const paired=await request('/api/phone/v1/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:pairing.data.code,name:'Phone Fast Dial QA',platform:'Android QA',workspaceId:'qa-v10182'})}); if(paired.response.status!==201) throw new Error('pareamento falhou')
 const {token,deviceId}=paired.data
 const phoneWs=new WebSocket(`ws://127.0.0.1:${port}/api/phone/v1/ws?token=${encodeURIComponent(token)}`); const hello=await nextMessage(phoneWs); if(hello.type!=='hello') throw new Error('phone websocket falhou')
 const commandPromise=nextMessage(phoneWs)
 const call=await request('/api/voice/v1/calls',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schema:'realtalent.voice.call.v1',direction:'outbound',requestId:'fast-1',workspaceId:'qa-v10182',leadId:'lead-fast',phone:'51999999999',deviceId:`connect:phone:${deviceId}`,displayName:'Lead Fast Dial',companyName:'RealTalent',playbookName:'Power Queue',sessionId:'queue-fast',objective:'Validar discagem rápida',fastDial:true})}); if(call.response.status!==201||!call.data.callId) throw new Error(call.data.error||'chamada Fast Dial não criada')
 const message=await commandPromise; if(message.command?.fastDial!==true||message.command?.sessionId!=='queue-fast'||message.command?.displayName!=='Lead Fast Dial') throw new Error('flag/contexto Fast Dial não chegou ao Phone')
 const state=await request('/api/phone/v1/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,callId:call.data.callId,state:'ringing'})}); if(!state.response.ok) throw new Error('Phone não atualizou estado ringing')
 const current=await request(`/api/voice/v1/calls/${encodeURIComponent(call.data.callId)}`); if(current.data.state!=='ringing') throw new Error('estado Fast Dial não retornou ao CRM')
 try{phoneWs.close()}catch{}; console.log('RealTalent Connect V101.8.2 Fast Dial smoke: OK (pair → WS → fastDial command → ringing sync).'); await stop()
}catch(error){await stop();console.error(`RealTalent Connect V101.8.2 Fast Dial smoke: FALHOU — ${error instanceof Error?error.message:String(error)}`);if(stderr.trim())console.error(stderr.trim());process.exit(1)}finally{for(const f of [phoneStore,runtimeStore])try{fs.rmSync(f,{force:true})}catch{}}
