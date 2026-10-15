import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4398
const agentPort = 4338
const stateDir = path.join(os.tmpdir(), `realtalent-prospecting-v101103-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let overpassCalls = 0
let webCalls = 0

const provider = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${providerPort}`)
  if (url.pathname === '/search') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify([{ boundingbox: ['-30.05','-29.75','-51.30','-50.95'], lat: '-29.917', lon: '-51.184', display_name: 'Canoas, RS, Brasil' }]))
  }
  if (url.pathname === '/overpass') {
    overpassCalls += 1
    req.resume(); req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ elements: [
        { type:'node', id:1, lat:-29.91, lon:-51.18, tags:{ name:'Barbearia Alpha', shop:'hairdresser', 'addr:city':'Canoas', phone:'(51) 99999-1111' } },
        { type:'node', id:2, lat:-29.92, lon:-51.19, tags:{ name:'Barbearia Beta', shop:'hairdresser', 'addr:city':'Canoas', phone:'(51) 99999-2222' } },
      ] }))
    }); return
  }
  if (url.pathname === '/html/' || url.pathname === '/html') {
    webCalls += 1
    res.setHeader('content-type', 'text/html')
    return res.end(`<html><a class="result__a" href="http://127.0.0.1:${providerPort}/gamma">Barbearia Gamma - Canoas</a></html>`)
  }
  if (url.pathname === '/robots.txt') { res.setHeader('content-type','text/plain'); return res.end('User-agent: *\nAllow: /') }
  if (url.pathname === '/alpha') { res.setHeader('content-type','text/html'); return res.end('<html><body>Barbearia Alpha contato alpha@exemplo.com.br Instagram @alpha</body></html>') }
  if (url.pathname === '/gamma') { res.setHeader('content-type','text/html'); return res.end('<html><body>Barbearia Gamma telefone (51) 98888-3333 gamma@exemplo.com.br Instagram @gamma</body></html>') }
  res.statusCode=404; res.end('not found')
})
const listen=()=>new Promise((resolve,reject)=>provider.listen(providerPort,'127.0.0.1',resolve).once('error',reject))
const close=()=>new Promise((resolve)=>provider.close(resolve))

async function waitHealth(){
  for(let i=0;i<60;i+=1){try{const r=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`);const j=await r.json();if(r.ok&&['101.10.3','101.10.3-H1','101.10.3-H4','101.10.3-H5','101.10.3-H6','101.10.3-H8','101.10.3-H9','101.10.4'].includes(j.version))return j}catch{} await sleep(100)}
  throw new Error('health V101.10.3/H1 não respondeu')
}
async function waitJob(workspaceId){
  for(let i=0;i<180;i+=1){const r=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=${encodeURIComponent(workspaceId)}`);const j=(await r.json()).jobs?.[0];if(j&&['completed','failed','cancelled'].includes(j.status))return j;await sleep(100)}
  throw new Error('job não concluiu')
}

await listen(); await fs.rm(stateDir,{recursive:true,force:true})
const child=spawn(process.execPath,['scripts/realtalent-prospecting-agent.mjs'],{env:{...process.env,REALTALENT_PROSPECTING_AGENT_TEST_MODE:'1',REALTALENT_PROSPECTING_AGENT_PORT:String(agentPort),REALTALENT_PROSPECTING_AGENT_STATE_DIR:stateDir,REALTALENT_NOMINATIM_URL:`http://127.0.0.1:${providerPort}/search`,REALTALENT_OVERPASS_URLS:`http://127.0.0.1:${providerPort}/overpass`,REALTALENT_WEB_SEARCH_URL:`http://127.0.0.1:${providerPort}/html/`},stdio:['ignore','ignore','inherit']})
try{
  await waitHealth()
  const create=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'v101103-engine',segment:'Barbearias',regions:['Canoas, RS'],targetMode:'max',targetQuantity:50,areaMode:'radius',radiusKm:15,searchMode:'fast',enrichWeb:true,enrichCnpj:false,browserFallback:false})})
  if(!create.ok) throw new Error(`create ${create.status}`)
  const job=await waitJob('v101103-engine')
  if(job.status!=='completed') throw new Error(`status ${job.status}: ${job.error||job.message}`)
  if(job.results.length<3) throw new Error(`esperava >=3 empresas únicas; recebeu ${job.results.length}`)
  if(!job.plan?.expandedQueries?.some((q)=>q.toLowerCase().includes('barber'))) throw new Error('Search Planner não expandiu consultas')
  if(!Array.isArray(job.plan?.cells)||job.plan.cells.length<1) throw new Error('Territory Engine não criou células')
  if(job.coverage?.territoryPercent!==100) throw new Error(`cobertura territorial ${job.coverage?.territoryPercent}`)
  if(typeof job.coverage?.saturationPercent!=='number') throw new Error('saturação ausente')
  if(!job.results.every((x)=>typeof x.completenessPercent==='number'&&typeof x.confidencePercent==='number')) throw new Error('scores de qualidade ausentes')
  if(!job.results.some((x)=>Array.isArray(x.evidence)&&x.evidence.length>0)) throw new Error('proveniência ausente')
  if(!job.processing||job.processing.validation<3) throw new Error('pipeline de processamento não concluiu candidatos')
  if(overpassCalls<1||webCalls<1) throw new Error(`providers insuficientes OSM=${overpassCalls} web=${webCalls}`)
  const raw=JSON.parse(await fs.readFile(path.join(stateDir,'state.json'),'utf8'))
  if(![2,3,4,5,6,7].includes(raw.schemaVersion)) throw new Error('state schema não migrou para v2 ou sucessor')
  console.log(`Garimpo V101.10.3 runtime smoke: ${job.results.length} únicas · cobertura ${job.coverage.territoryPercent}% · saturação ${job.coverage.saturationPercent}% · OSM ${overpassCalls} · Web ${webCalls} OK`)
} finally { child.kill('SIGTERM'); await close(); await fs.rm(stateDir,{recursive:true,force:true}) }
