import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const root=process.cwd()
const port=Number(process.env.REALTALENT_CONNECT_SMOKE_PORT||4391)
const phoneStore=path.join('/tmp',`realtalent-phone-smoke-${port}.json`)
try{fs.rmSync(phoneStore,{force:true})}catch{}
const server=spawn(process.execPath,['scripts/realtalent-connect-server.mjs'],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,REALTALENT_CONNECT_PORT:String(port),REALTALENT_CRM_PORT:'4187',REALTALENT_CONNECT_HOST:'127.0.0.1',REALTALENT_PHONE_STORE:phoneStore,TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_FROM_NUMBER:'',REALTALENT_AGENT_PHONE_NUMBER:''}})
let stderr='',stdout='';server.stderr.on('data',c=>stderr+=String(c));server.stdout.on('data',c=>stdout+=String(c))
const stop=()=>{if(!server.killed)server.kill('SIGTERM');try{fs.rmSync(phoneStore,{force:true})}catch{}};process.on('exit',stop)
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const base=`http://127.0.0.1:${port}`
async function request(url,opts={}){const response=await fetch(base+url,opts);const data=await response.json().catch(()=>({}));return {response,data}}
try{
  let ready=false
  for(let i=0;i<30;i++){try{const {response,data}=await request('/api/voice/v1/health');if(response.ok&&data.version==='101.2.0'){ready=true;break}}catch{} await sleep(100)}
  if(!ready) throw new Error(`Connect não iniciou. ${stderr||stdout}`)
  const blocked=await request('/api/voice/v1/capabilities',{headers:{origin:'http://example.invalid'}});if(blocked.response.status!==403)throw new Error('origin guard não bloqueou origem externa')
  const pairing=await request('/api/phone/v1/pairing');if(!pairing.response.ok||!pairing.data.code)throw new Error('pairing indisponível')
  const paired=await request('/api/phone/v1/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:pairing.data.code,name:'Runtime QA Phone',platform:'qa'})});if(paired.response.status!==201)throw new Error('pareamento falhou')
  const {token,deviceId}=paired.data
  await request(`/api/phone/v1/poll?token=${encodeURIComponent(token)}`)
  const devices=await request('/api/phone/v1/devices');if(!devices.data.devices?.some(d=>d.id===deviceId&&d.available))throw new Error('phone não ficou disponível')
  const call=await request('/api/voice/v1/calls',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schema:'realtalent.voice.call.v1',direction:'outbound',workspaceId:'qa',leadId:'lead-qa',phone:'51999999999',deviceId:`connect:phone:${deviceId}`,displayName:'Lead QA'})});if(call.response.status!==201||!call.data.callId)throw new Error(call.data.error||'chamada phone não criada')
  const poll=await request(`/api/phone/v1/poll?token=${encodeURIComponent(token)}`);if(poll.data.command?.callId!==call.data.callId)throw new Error('comando não chegou ao phone')
  await request('/api/phone/v1/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,callId:call.data.callId,state:'connected'})})
  let status=await request(`/api/voice/v1/calls/${encodeURIComponent(call.data.callId)}`);if(status.data.state!=='connected')throw new Error('estado connected não sincronizou')
  await request('/api/phone/v1/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,callId:call.data.callId,state:'ended'})})
  status=await request(`/api/voice/v1/calls/${encodeURIComponent(call.data.callId)}`);if(status.data.state!=='ended')throw new Error('estado ended não sincronizou')
  console.log('RealTalent Connect smoke V101.2: OK (pairing → device → call → connected → ended; origin guard 403).')
  stop()
}catch(error){stop();console.error(`RealTalent Connect smoke V101.2: FALHOU — ${error instanceof Error?error.message:String(error)}`);if(stderr.trim())console.error(stderr.trim());process.exit(1)}
