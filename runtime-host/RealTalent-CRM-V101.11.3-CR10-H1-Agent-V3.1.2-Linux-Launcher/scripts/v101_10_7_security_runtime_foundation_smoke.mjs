import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import { spawn } from 'node:child_process'
const root=process.cwd(); const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-security-'))
const token='rt-security-'+Math.random().toString(36).slice(2)+Date.now()
const checks=[]; const ok=(label,value)=>{checks.push([label,Boolean(value)]); console.log(`${value?'OK  ':'FAIL'} ${label}`)}
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const wait=async(url,headers={})=>{for(let i=0;i<40;i++){try{const r=await fetch(url,{headers});if(r.status<500)return r}catch{} await new Promise(r=>setTimeout(r,100))}throw new Error(`timeout ${url}`)}
const requestWithHost=(port,pathName,headers={})=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:pathName,headers},resolve);req.on('error',reject);req.end()})
const children=[]
const launch=(entry,env)=>{const child=spawn(process.execPath,[entry],{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});children.push(child);return child}
const cleanup=()=>{for(const c of children)try{c.kill('SIGTERM')}catch{};try{fs.rmSync(temp,{recursive:true,force:true})}catch{}}
process.on('exit',cleanup); process.on('SIGINT',()=>{cleanup();process.exit(130)})
try{
  const cp=await freePort(), gp=await freePort(), crmPort=await freePort()
  fs.writeFileSync(path.join(temp,'communications.json'),'{}\n')
  launch('scripts/realtalent-connect-server.mjs',{REALTALENT_CONNECT_PORT:String(cp),REALTALENT_CRM_PORT:String(crmPort),REALTALENT_RUNTIME_TOKEN:token,REALTALENT_PHONE_STORE:path.join(temp,'phones.json'),REALTALENT_CONNECT_RUNTIME_STORE:path.join(temp,'calls.json'),REALTALENT_CONNECT_NETWORK_CONFIG:path.join(temp,'network.json')})
  const auth={'x-realtalent-runtime-token':token}
  let r=await wait(`http://127.0.0.1:${cp}/api/voice/v1/health`)
  ok('Connect rejeita API sem token',r.status===401)
  r=await fetch(`http://127.0.0.1:${cp}/api/voice/v1/health`,{headers:auth}); ok('Connect aceita token runtime',r.status===200)
  const h=await r.json(); ok('Connect inicia local-only',h.networkAccess?.enabled===false&&h.security?.runtimeAuth===true)
  r=await requestWithHost(cp,'/api/voice/v1/health',{...auth,host:'evil.example'}); ok('Connect bloqueia Host indevido',r.statusCode===421)
  r=await fetch(`http://127.0.0.1:${cp}/api/phone/v1/pairing?workspaceId=smoke`,{headers:auth}); const pair=await r.json(); ok('pairing protegido responde com token',r.ok&&/^\d{6}$/.test(pair.code||''))
  for(let i=0;i<5;i++) await fetch(`http://127.0.0.1:${cp}/api/phone/v1/pair`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'smoke',code:'000000'})})
  r=await fetch(`http://127.0.0.1:${cp}/api/phone/v1/pair`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'smoke',code:'000000'})}); ok('pairing bloqueia brute force',r.status===429&&Number(r.headers.get('retry-after'))>=1)

  launch('scripts/realtalent-communications-gateway.mjs',{REALTALENT_COMMUNICATIONS_PORT:String(gp),REALTALENT_CRM_PORT:String(crmPort),REALTALENT_RUNTIME_TOKEN:token,REALTALENT_COMMUNICATIONS_CONFIG:path.join(temp,'communications.json'),REALTALENT_COMMUNICATIONS_STORE:path.join(temp,'store.json'),REALTALENT_COMMUNICATIONS_KEY_FILE:path.join(temp,'key')})
  r=await wait(`http://127.0.0.1:${gp}/api/communications/health`); ok('Communications rejeita API sem token',r.status===401)
  r=await fetch(`http://127.0.0.1:${gp}/api/communications/health`,{headers:auth}); ok('Communications aceita token runtime',r.status===200)
  const gh=await r.json(); ok('Communications anuncia fail-closed',gh.security?.webhooksFailClosed===true)
  r=await fetch(`http://127.0.0.1:${gp}/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}); ok('Webhook Meta sem secret falha fechado',r.status===503)
  r=await fetch(`http://127.0.0.1:${gp}/oauth/google/callback?error_description=${encodeURIComponent('<script>alert(1)</script>')}`); const html=await r.text(); ok('OAuth escapa HTML de erro',r.status===400&&html.includes('&lt;script&gt;')&&!html.includes('<script>'))
  r=await requestWithHost(gp,'/api/communications/health',{...auth,host:'evil.example'}); ok('Communications bloqueia Host indevido',r.statusCode===421)
} finally { cleanup() }
const failed=checks.filter(([,v])=>!v);console.log(`\nSecurity runtime smoke: ${checks.length-failed.length}/${checks.length}`);process.exit(failed.length?1:0)
