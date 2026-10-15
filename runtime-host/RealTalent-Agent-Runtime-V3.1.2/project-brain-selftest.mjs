import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { buildProjectIndex, updateProjectIndex, projectBrainContext, projectBrainGraph, impactAnalysis } from './project-awareness.mjs'

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rt-brain-v17-'))
const config=path.join(temp,'config'),state=path.join(temp,'state'),crm=path.join(temp,'crm'),blue=path.join(temp,'blue')
for(const d of [config,state,crm,blue])fs.mkdirSync(d,{recursive:true})
const put=(root,rel,text)=>{const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text)}
put(crm,'package.json',JSON.stringify({name:'realtalent-crm',version:'test'}))
put(crm,'src/domain/contact.ts',`export interface ContactRecord { id:string; name:string }\nexport type ContactStatus='active'|'inactive'`)
put(crm,'src/services/contact-repository.ts',`import type { ContactRecord } from '../domain/contact'\nexport async function loadContacts(supabase:any){ return supabase.from('contacts').select('*') as Promise<ContactRecord[]> }\nexport async function scoreContact(supabase:any){ return supabase.rpc('score_contact') }`)
put(crm,'src/features/contacts/ContactsPage.tsx',`import { loadContacts } from '../../services/contact-repository'\nexport function ContactsPage(){ return null }`)
put(crm,'src/app/router.tsx',`import { ContactsPage } from '../features/contacts/ContactsPage'\nexport const routes=[{path:'/contacts',element:ContactsPage}]\nexport function go(navigate:any){ navigate('/contacts') }`)
put(crm,'supabase/migrations/001_contacts.sql',`create table if not exists public.contacts(id uuid primary key);\ncreate or replace function public.score_contact() returns int language sql as $$ select 1 $$;`)
put(blue,'package.json',JSON.stringify({name:'blue-ocean-service-studio',version:'test'}))
put(blue,'src/domain/ServiceGraph.ts',`export interface ServiceNode { id:string }\nexport function serviceGraph(){ return [] as ServiceNode[] }`)
put(blue,'src/views/BlueprintView.tsx',`import { serviceGraph } from '../domain/ServiceGraph'\nexport function BlueprintView(){return serviceGraph()}`)
const cfgDir=path.join(config,'realtalent-agent');fs.mkdirSync(cfgDir,{recursive:true});fs.writeFileSync(path.join(cfgDir,'workspaces.json'),JSON.stringify({crm,blue_ocean:blue}))

let ok=0,total=0;const check=(name,pass)=>{total++;console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
const full=buildProjectIndex({product:'crm',workspace:crm})
check('índice V2 / Project Brain 1.7',full.version===2&&full.brainVersion==='1.7.0')
check('Architecture Graph agrega módulos',full.graphs.architecture.nodes.some(x=>x.name==='features/contacts')&&full.graphs.architecture.edges.length>=2)
check('Route Graph detecta /contacts',full.graphs.routes.routes.some(x=>x.path==='/contacts'&&x.definedBy.length))
check('Data Graph detecta ContactRecord',full.graphs.data.entities.some(x=>x.name==='ContactRecord'&&x.referencedBy.some(p=>p.includes('contact-repository'))))
check('UI Component Graph detecta ContactsPage',full.graphs.ui.components.some(x=>x.name==='ContactsPage'))
check('Supabase Graph detecta tabela + RPC',full.graphs.supabase.tables.some(x=>x.name==='contacts')&&full.graphs.supabase.rpcs.some(x=>x.name==='score_contact'))
check('Feature Graph detecta contacts',full.graphs.features.modules.some(x=>x.name==='features/contacts'))
const inc1=updateProjectIndex({product:'crm',workspace:crm})
check('sync incremental reutiliza arquivos',inc1.sync.mode==='incremental'&&inc1.sync.reused>=4&&inc1.sync.changed===0)
await new Promise(r=>setTimeout(r,20));put(crm,'src/services/contact-repository.ts',`import type { ContactRecord } from '../domain/contact'\nexport async function loadContacts(supabase:any){ return supabase.from('contacts').select('*') as Promise<ContactRecord[]> }\nexport async function saveContact(supabase:any,row:ContactRecord){ return supabase.from('contacts').upsert(row) }\nexport async function scoreContact(supabase:any){ return supabase.rpc('score_contact') }`)
const inc2=updateProjectIndex({product:'crm',workspace:crm})
check('sync incremental reprocessa somente mudança',inc2.sync.mode==='incremental'&&inc2.sync.changed===1&&inc2.sync.reused>=4&&inc2.fingerprint!==full.fingerprint)
const ctx=projectBrainContext({product:'crm',workspace:crm,query:'ContactsPage contacts ContactRecord',limit:6})
check('retrieval combina busca + grafos',ctx.search.some(x=>x.path.includes('ContactsPage'))&&ctx.graph.dataEntities.some(x=>x.name==='ContactRecord')&&ctx.graph.tables.some(x=>x.name==='contacts'))
const impact=impactAnalysis({product:'crm',workspace:crm,target:'src/domain/contact.ts',depth:3})
check('impacto atravessa data/repository/UI',impact.affectedFiles.some(x=>x.includes('contact-repository'))&&impact.affectedFiles.some(x=>x.includes('ContactsPage'))&&impact.affectedGraph.dataEntities.includes('ContactRecord'))
const supa=projectBrainGraph({product:'crm',workspace:crm,type:'supabase'})
check('API interna de grafo retorna Supabase Graph',supa.value.tables.some(x=>x.name==='contacts'))

const agentPort=18650+Math.floor(Math.random()*200)
const child=spawn(process.execPath,[new URL('./gateway.mjs',import.meta.url).pathname],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_STATE_HOME:state,REALTALENT_AGENT_PORT:String(agentPort),REALTALENT_AGENT_HOST:'127.0.0.1',REALTALENT_AI_PROVIDER:'ollama',OLLAMA_URL:'http://127.0.0.1:19999',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c)
const base=`http://127.0.0.1:${agentPort}`,sleep=ms=>new Promise(r=>setTimeout(r,ms))
for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)break}catch{}await sleep(40)}
const json=async(url,opt={})=>{const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});let x={};try{x=await r.json()}catch{}return {r,x}}
try{
  let z=await json('/health');check('gateway expõe V1.7 + Project Brain',z.r.ok&&z.x.version==='3.1'&&z.x.projectAwareness?.projectBrain===true&&z.x.projectAwareness?.incrementalIndex===true)
  z=await json('/project-brain/sync',{method:'POST',body:JSON.stringify({product:'all'})});check('endpoint sync atualiza dois produtos',z.r.ok&&z.x.synced?.length===2&&z.x.synced.every(x=>x.ok))
  z=await json('/project-brain/graph?product=crm&type=routes');check('endpoint graph expõe Route Graph',z.r.ok&&z.x.graph?.value?.routes?.some(x=>x.path==='/contacts'))
  z=await json('/project-awareness/status');check('status expõe estatísticas dos grafos',z.r.ok&&z.x.projectAwareness?.products?.crm?.graphStats?.dataEntities>=1&&z.x.projectAwareness?.products?.crm?.sync?.mode)
} finally {child.kill('SIGTERM')}
console.log(`\nProject Brain V1.7: ${ok}/${total} testes aprovados.`)
if(ok!==total){console.error(logs.slice(-5000));process.exit(1)}
