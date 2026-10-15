import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4414
const agentPort = 4354
const stateDir = path.join(os.tmpdir(), `rt-v101104-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let webRequests = 0

const provider = http.createServer((req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${providerPort}`)
  if (u.pathname === '/search') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify([{ boundingbox: ['-30.00','-29.80','-51.30','-51.00'], lat: '-29.92', lon: '-51.18', display_name: 'Canoas, RS' }]))
  }
  if (u.pathname === '/overpass') {
    let body=''; req.on('data',(c)=>body+=c); req.on('end',()=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({elements:[{type:'node',id:10401,lat:-29.90,lon:-51.16,tags:{name:'Barbearia Local OSM',shop:'hairdresser',hairdresser:'barber','addr:city':'Canoas',phone:'+55 51 3333-1040'}}]}))}); return
  }
  if (u.pathname === '/web') {
    webRequests += 1
    res.setHeader('content-type', 'text/html; charset=utf-8')
    return res.end(`<html><body>
      <a class="result__a" href="http://localhost:${providerPort}/blog/melhores-barbearias">10 melhores barbearias de Canoas</a>
      <a class="result__a" href="http://127.0.0.1:${providerPort}/alpha">Barbearia Alpha Canoas - Site oficial</a>
    </body></html>`)
  }
  if (u.pathname === '/robots.txt') { res.setHeader('content-type','text/plain'); return res.end('User-agent: *\nAllow: /\n') }
  if (u.pathname === '/alpha') { res.setHeader('content-type','text/html; charset=utf-8'); return res.end('<html><body><h1>Barbearia Alpha</h1><p>Canoas RS</p><a href="tel:+555199887766">(51) 99887-7766</a><a href="mailto:contato@alpha.test">contato@alpha.test</a></body></html>') }
  if (u.pathname === '/blog/melhores-barbearias') { res.setHeader('content-type','text/html; charset=utf-8'); return res.end('<html><body><article>Ranking editorial das dez melhores barbearias da cidade. Conteúdo informativo, não é estabelecimento.</article></body></html>') }
  res.statusCode=404; res.end('x')
})

await new Promise((resolve,reject)=>provider.listen(providerPort,'0.0.0.0',resolve).once('error',reject))
await fs.rm(stateDir,{recursive:true,force:true})
const child=spawn(process.execPath,['scripts/realtalent-prospecting-agent.mjs'],{env:{...process.env,REALTALENT_PROSPECTING_AGENT_TEST_MODE:'1',REALTALENT_PROVIDER_RETRIES:'1',REALTALENT_PROSPECTING_AGENT_PORT:String(agentPort),REALTALENT_PROSPECTING_AGENT_STATE_DIR:stateDir,REALTALENT_NOMINATIM_URL:`http://127.0.0.1:${providerPort}/search`,REALTALENT_OVERPASS_URLS:`http://127.0.0.1:${providerPort}/overpass`,REALTALENT_WEB_SEARCH_URL:`http://127.0.0.1:${providerPort}/web`},stdio:['ignore','ignore','inherit']})
async function health(){for(let i=0;i<80;i++){try{const j=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`).then(r=>r.json());if(j.version==='101.10.4')return j}catch{}await sleep(80)}throw new Error('health V101.10.4 não respondeu')}
async function waitJob(){for(let i=0;i<400;i++){const j=(await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=v101104`).then(r=>r.json())).jobs?.[0];if(j&&['completed','failed'].includes(j.status))return j;await sleep(50)}throw new Error('timeout V101.10.4')}
try {
  const h=await health(); if(!h.providers?.placeFirstSearch) throw new Error('health não expõe Place-First Search')
  const customCenter={lat:-29.89,lon:-51.14}
  const created=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'v101104',segment:'barbearias',regions:['Canoas, RS'],targetMode:'max',targetQuantity:1000,areaMode:'radius',radiusKm:8,searchMode:'fast',searchCenter:customCenter,enrichWeb:false,enrichCnpj:false,browserFallback:false})})
  if(!created.ok) throw new Error(await created.text())
  const job=await waitJob(); if(job.status!=='completed') throw new Error(`job ${job.status}: ${job.error||job.message}`)
  if(Math.abs(Number(job.plan?.geometry?.center?.lat)-customCenter.lat)>0.0001 || Math.abs(Number(job.plan?.geometry?.center?.lon)-customCenter.lon)>0.0001) throw new Error('centro customizado do raio não controlou a geometria')
  if(!job.results.some((item)=>item.company==='Barbearia Local OSM'&&item.placeType==='physical_place')) throw new Error('local OSM não chegou como physical_place')
  if(!job.results.some((item)=>/Barbearia Alpha/i.test(item.company)&&item.placeType==='service_business')) throw new Error('site empresarial legítimo não virou LocalCandidate')
  if(job.results.some((item)=>/10 melhores|ranking|melhores barbearias/i.test(item.company))) throw new Error('artigo/ranking entrou como empresa')
  if(Number(job.stats?.webRejectedDocuments||0)<1) throw new Error('documentos Web rejeitados não foram contabilizados')
  if(Number(job.stats?.webPlaceCandidates||0)<1) throw new Error('LocalCandidates Web não foram contabilizados')
  if(webRequests<1) throw new Error('Web planner não foi executado')
  console.log(`V101.10.4 Local Discovery smoke: ${job.results.length} empresas · web locais=${job.stats.webPlaceCandidates} · documentos rejeitados=${job.stats.webRejectedDocuments} · centro=${job.plan.geometry.center.lat},${job.plan.geometry.center.lon}`)
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve)=>provider.close(resolve))
  await fs.rm(stateDir,{recursive:true,force:true})
}
