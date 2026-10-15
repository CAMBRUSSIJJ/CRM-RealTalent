import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rt-agent-v110-id-'))
const config=path.join(root,'config'),state=path.join(root,'state')
fs.mkdirSync(path.join(state,'realtalent-agent'),{recursive:true});fs.mkdirSync(path.join(config,'realtalent-agent'),{recursive:true})
const port=8810
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(port),REALTALENT_AGENT_HOST:'127.0.0.1',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`,sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wait(){for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await sleep(50)}throw new Error('gateway não iniciou\n'+logs)}
async function json(url,opt={}){const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});const x=await r.json().catch(()=>({}));return{r,x}}
const claim=(systemKey, userId='u1', workspaceId='ws1')=>({source:'crm',workspace:{id:workspaceId,name:'Workspace Teste',role:systemKey==='administrator'?'admin':'member'},user:{id:userId},access:{profileId:`system-${systemKey}`,systemKey,profileName:systemKey==='administrator'?'Administrador':systemKey==='manager'?'Gestor':'Vendedor',teamIds:['team-1'],teamRole:systemKey==='manager'?'leader':'member',rules:[{resource:'contacts',scope:systemKey==='seller'?'own':'team',actions:['view','create','edit']},{resource:'settings',scope:systemKey==='administrator'?'all':'none',actions:systemKey==='administrator'?['view','edit']:[]}]}})
let ok=0,total=0;const check=(label,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${label}`);if(pass)ok++}
try{
  await wait()
  let z=await json('/health');check('health V1.10 + IDENTITY',z.r.ok&&z.x.version==='3.1'&&z.x.modes?.includes('IDENTITY'))
  z=await json('/identity');check('fallback local sem claim',z.r.ok&&z.x.identity?.active===false&&z.x.identity?.assurance==='local-fallback')
  z=await json('/identity/sync',{method:'POST',body:JSON.stringify(claim('seller'))});check('Vendedor sincroniza como operator',z.r.ok&&z.x.actor?.role==='operator'&&z.x.capabilities?.canBuilder===false)
  z=await json('/identity');check('escopo own preservado',z.r.ok&&z.x.identity?.capabilities?.scopes?.contacts?.scope==='own')
  z=await json('/identity/check',{method:'POST',body:JSON.stringify({operation:'qa.run',target:'crm',risk:'low'})});check('Vendedor pode QA read-only',z.r.ok&&z.x.allowed===true)
  z=await json('/identity/check',{method:'POST',body:JSON.stringify({operation:'builder.run',target:'crm',risk:'high'})});check('Vendedor não pode Builder',z.r.status===403&&z.x.allowed===false&&/Administrador/.test(z.x.error||''))
  z=await json('/identity/check',{method:'POST',body:JSON.stringify({operation:'engineering.investigate',target:'crm',risk:'medium'})});check('Vendedor não pode Autonomous Engineering',z.r.status===403&&z.x.allowed===false)
  z=await json('/identity/check',{method:'POST',body:JSON.stringify({operation:'program.create',target:'strategic-program',risk:'high'})});check('Vendedor não pode Program',z.r.status===403&&z.x.allowed===false)
  z=await json('/governance/approvals/request',{method:'POST',body:JSON.stringify({operation:'selftest.high',target:'crm',risk:'high'})});const approval=z.x.approval?.id
  z=await json(`/governance/approvals/${approval}/approve`,{method:'POST',body:'{}'});check('Vendedor não aprova HIGH',z.r.status===400&&/não pode decidir/.test(z.x.error||''))
  z=await json('/identity/sync',{method:'POST',body:JSON.stringify(claim('manager','u2'))});check('Gestor sincroniza como manager',z.r.ok&&z.x.actor?.role==='manager'&&z.x.capabilities?.canEngineering===true&&z.x.capabilities?.canBuilder===false)
  z=await json('/identity/check',{method:'POST',body:JSON.stringify({operation:'engineering.investigate',target:'crm',risk:'medium'})});check('Gestor pode investigar',z.r.ok&&z.x.allowed===true)
  z=await json('/identity/check',{method:'POST',body:JSON.stringify({operation:'builder.run',target:'crm',risk:'high'})});check('Gestor não executa Builder',z.r.status===403&&z.x.allowed===false)
  z=await json(`/governance/approvals/${approval}/approve`,{method:'POST',body:JSON.stringify({note:'aprovado pelo gestor'})});check('Gestor aprova HIGH',z.r.ok&&z.x.approval?.decidedBy?.role==='manager'&&z.x.approval?.decidedBy?.id==='u2')
  z=await json('/identity/sync',{method:'POST',body:JSON.stringify(claim('administrator','u3','ws-admin'))});check('Admin sincroniza como admin',z.r.ok&&z.x.actor?.role==='admin'&&z.x.actor?.workspaceId==='ws-admin')
  z=await json('/identity/check',{method:'POST',body:JSON.stringify({operation:'builder.run',target:'crm',risk:'high'})});check('Admin pode Builder',z.r.ok&&z.x.allowed===true)
  z=await json('/identity/check',{method:'POST',body:JSON.stringify({operation:'governance.rollback',target:'snapshot',risk:'critical'})});check('Admin pode governança crítica',z.r.ok&&z.x.allowed===true)
  z=await json('/governance/audit/verify');check('audit identity hash íntegro',z.r.ok&&z.x.verification?.ok===true)
  const identityPath=path.join(state,'realtalent-agent','identity-context.json');check('identity store chmod 600',fs.existsSync(identityPath)&&((fs.statSync(identityPath).mode&0o777)===0o600))
  z=await json('/identity/clear',{method:'POST',body:'{}'});check('clear restaura fallback',z.r.ok&&z.x.identity?.active===false)
}finally{child.kill('SIGTERM');await sleep(80);fs.rmSync(root,{recursive:true,force:true})}
console.log(`\nIdentity & Team Governance V1.10: ${ok}/${total} PASS`);if(ok!==total)process.exit(1)
