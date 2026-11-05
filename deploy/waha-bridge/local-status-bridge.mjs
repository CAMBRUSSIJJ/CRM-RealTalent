#!/usr/bin/env node
// Minimal safe WAHA-to-RealTalent heartbeat bridge. Node >= 22.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const home=os.homedir();
const file=path.join(home,'.config/realtalent-waha-bridge','.env');
function env(p) {
  if(!fs.existsSync(p)) return {};
  return Object.fromEntries(fs.readFileSync(p,'utf8').split(/\r?\n/)
    .filter(s=>/^[A-Za-z_][A-Za-z0-9_]*=/.test(s))
    .map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1).trim()]}));
}
const c={...env(file)};
const local=env(path.join(home,'.local/share/realtalent-waha-gows/.env'));
if(!c.WAHA_API_KEY)c.WAHA_API_KEY=local.WAHA_API_KEY;
const org=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(c.ORGANIZATION_ID||'');
const api=c.SUPABASE_URL||'';
if(!org || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(api) ||
   !c.SUPABASE_SERVICE_ROLE_KEY || !c.WAHA_API_KEY) {
  console.error('Configure a ponte pelo script install.sh. Nenhuma credencial será exibida.');
  process.exit(1);
}
const base='http://127.0.0.1:4385';
const auth={apikey:c.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+c.SUPABASE_SERVICE_ROLE_KEY,'content-type':'application/json'};
const session=c.WAHA_SESSION||'realtalent';
if(!/^[A-Za-z0-9_-]{1,60}$/.test(session))throw Error('Sessão inválida.');
const statusMap={WORKING:'open',SCAN_QR_CODE:'connecting',STARTING:'connecting',AUTHENTICATED:'connecting',FAILED:'error',STOPPED:'close',DISCONNECTED:'close'};
async function state(){
  const r=await fetch(base+'/api/sessions/'+session,{headers:{'X-Api-Key':c.WAHA_API_KEY},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('WAHA HTTP '+r.status);
  const v=await r.json();return {raw:v.status||'unknown',state:statusMap[v.status]||'unknown'};
}
async function heartbeat(){
  let s;
  try{s=await state()}catch{s={raw:'unavailable',state:'offline'}}
  const payload={organization_id:c.ORGANIZATION_ID,heartbeat_at:new Date().toISOString(),connection_state:s.state};
  if(s.state==='open')Object.assign(payload,{last_error:null,qr_base64:null,qr_expires_at:null});
  const r=await fetch(api.replace(/\/$/,'')+'/rest/v1/whatsapp_local_bridge?on_conflict=organization_id',{
    method:'POST',headers:{...auth,prefer:'resolution=merge-duplicates,return=minimal'},signal:AbortSignal.timeout(10000),
    body:JSON.stringify(payload)});
  if(!r.ok)throw Error('Supabase HTTP '+r.status);
  return s;
}
if(process.argv.includes('--check')) {
  try {
    const s=await state();
    const r=await fetch(api.replace(/\/$/,'')+'/rest/v1/whatsapp_local_bridge?select=organization_id&organization_id=eq.'+c.ORGANIZATION_ID,{headers:auth,signal:AbortSignal.timeout(10000)});
    if(!r.ok||!Array.isArray(await r.json()))throw Error('Supabase não acessível');
    console.log('WAHA:',s.raw,'| Supabase: acessível | Envio automático: desligado');
  }catch(e){console.error('Falha de diagnóstico:',e.message);process.exitCode=1}
} else {
  console.log('WAHA → RealTalent: ponte de status iniciada. Não modifica a sessão, não envia mensagens.');
  while(true){
    try {const s=await heartbeat();console.log('Estado no CRM:',s.state)}
    catch(e){console.error('Conexão pendente:',e.message)}
    await delay(12000);
  }
}
