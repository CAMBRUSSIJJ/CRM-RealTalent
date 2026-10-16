import fs from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd()
const statusFile=process.env.RT_LOCAL_SUPABASE_STATUS_FILE||path.join(root,'.supabase-local-status.env')
const cr3File=path.join(root,'.env.cr3.local')
const unquote=(value='')=>{const v=String(value).trim();return ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))?v.slice(1,-1):v}
const parse=(text)=>Object.fromEntries(text.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')&&x.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i).trim(),unquote(line.slice(i+1))]}))
const status=parse(await fs.readFile(statusFile,'utf8'))
const cr3Text=await fs.readFile(cr3File,'utf8')
const cr3=parse(cr3Text)
const apiUrl=status.API_URL||status.SUPABASE_URL
const secret=status.SERVICE_ROLE_KEY||status.SECRET_KEY||status.SUPABASE_SERVICE_ROLE_KEY||status.SUPABASE_SECRET_KEY
if(!apiUrl||!secret||!cr3.CR3_WORKSPACE_ID)throw new Error('fixture de comunicação: configuração local incompleta')
const endpoint=new URL(apiUrl)
if(!['127.0.0.1','localhost','::1'].includes(endpoint.hostname))throw new Error(`fixture de comunicação recusou endpoint não local: ${endpoint.hostname}`)
const headers={apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'}
const call=async(pathname,options={})=>{const r=await fetch(`${apiUrl.replace(/\/$/,'')}${pathname}`,{...options,headers:{...headers,...(options.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(`${options.method||'GET'} ${pathname}: ${r.status} ${data?.message||String(data).slice(0,240)}`);return data}
const query=new URLSearchParams({select:'id',organization_id:`eq.${cr3.CR3_WORKSPACE_ID}`,provider:'eq.whatsapp_cloud',external_account_id:'eq.cr3-local-whatsapp',limit:'1'}).toString()
let rows=await call(`/rest/v1/integration_connected_accounts?${query}`)
let accountId=rows?.[0]?.id
if(!accountId){
  rows=await call('/rest/v1/integration_connected_accounts?select=id',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organization_id:cr3.CR3_WORKSPACE_ID,provider:'whatsapp_cloud',external_account_id:'cr3-local-whatsapp',display_name:'CR3 WhatsApp Local',status:'connected',has_credential:true,access_mode:'organization',connection_mode:'demo',capabilities:{messages:true}})})
  accountId=rows?.[0]?.id
}
if(!accountId)throw new Error('fixture de comunicação: conta local não criada')
const filtered=cr3Text.split(/\r?\n/).filter(line=>!line.startsWith('CR3_COMMUNICATION_ACCOUNT_ID='))
filtered.push(`CR3_COMMUNICATION_ACCOUNT_ID=${JSON.stringify(accountId)}`,'')
await fs.writeFile(cr3File,filtered.join('\n'),{mode:0o600})
console.log('LOCAL COMMUNICATION FIXTURE PASS')
console.log(`Conta sintética local: ${accountId}`)
