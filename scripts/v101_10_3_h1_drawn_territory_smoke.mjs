import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4399
const agentPort = 4339
const stateDir = path.join(os.tmpdir(), `realtalent-prospecting-v101103-h1-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let overpassCalls = 0
let webCalls = 0
let broadWebCalls = 0

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
        { type:'node', id:1, lat:-29.91, lon:-51.18, tags:{ name:'Barbearia Dentro A', shop:'hairdresser', 'addr:city':'Canoas', phone:'(51) 99999-1111' } },
        { type:'node', id:2, lat:-29.925, lon:-51.165, tags:{ name:'Barbearia Dentro B', shop:'hairdresser', 'addr:city':'Canoas', phone:'(51) 99999-2222' } },
        { type:'node', id:3, lat:-29.80, lon:-51.00, tags:{ name:'Barbearia Fora', shop:'hairdresser', 'addr:city':'Canoas', phone:'(51) 99999-3333' } },
      ] }))
    }); return
  }
  if (url.pathname === '/html/' || url.pathname === '/html') {
    webCalls += 1
    if (/Barbearias/i.test(url.searchParams.get('q') || '')) broadWebCalls += 1
    res.setHeader('content-type', 'text/html')
    return res.end('<html><body>não deveria ser usado em polígono estrito</body></html>')
  }
  if (url.pathname === '/robots.txt') { res.setHeader('content-type','text/plain'); return res.end('User-agent: *\nAllow: /') }
  res.statusCode=404; res.end('not found')
})
const listen=()=>new Promise((resolve,reject)=>provider.listen(providerPort,'127.0.0.1',resolve).once('error',reject))
const close=()=>new Promise((resolve)=>provider.close(resolve))
async function waitHealth(){for(let i=0;i<60;i+=1){try{const r=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`);const j=await r.json();if(r.ok&&['101.10.3-H1','101.10.3-H4','101.10.3-H5','101.10.3-H6','101.10.3-H8','101.10.3-H9','101.10.4'].includes(j.version))return j}catch{} await sleep(100)}throw new Error('health H1 não respondeu')}
async function waitJob(workspaceId){for(let i=0;i<180;i+=1){const r=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=${encodeURIComponent(workspaceId)}`);const j=(await r.json()).jobs?.[0];if(j&&['completed','failed','cancelled'].includes(j.status))return j;await sleep(100)}throw new Error('job H1 não concluiu')}

await listen(); await fs.rm(stateDir,{recursive:true,force:true})
const child=spawn(process.execPath,['scripts/realtalent-prospecting-agent.mjs'],{env:{...process.env,REALTALENT_PROSPECTING_AGENT_TEST_MODE:'1',REALTALENT_PROSPECTING_AGENT_PORT:String(agentPort),REALTALENT_PROSPECTING_AGENT_STATE_DIR:stateDir,REALTALENT_NOMINATIM_URL:`http://127.0.0.1:${providerPort}/search`,REALTALENT_OVERPASS_URLS:`http://127.0.0.1:${providerPort}/overpass`,REALTALENT_WEB_SEARCH_URL:`http://127.0.0.1:${providerPort}/html/`},stdio:['ignore','ignore','inherit']})
try{
  await waitHealth()
  const preview=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/territory/preview?region=${encodeURIComponent('Canoas, RS')}`).then(async(r)=>({ok:r.ok,body:await r.json()}))
  if(!preview.ok||!preview.body?.bbox||preview.body.displayName!=='Canoas, RS, Brasil') throw new Error('preview territorial inválido')
  const polygon=[{lat:-29.94,lon:-51.20},{lat:-29.94,lon:-51.15},{lat:-29.89,lon:-51.15},{lat:-29.89,lon:-51.20}]
  const create=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'v101103-h1-map',segment:'Barbearias',regions:['Canoas, RS'],targetMode:'max',targetQuantity:50,areaMode:'map',radiusKm:15,searchMode:'coverage',mapPolygon:polygon,enrichWeb:true,enrichCnpj:false,browserFallback:false})})
  if(!create.ok) throw new Error(`create ${create.status}: ${await create.text()}`)
  const job=await waitJob('v101103-h1-map')
  if(job.status!=='completed') throw new Error(`status ${job.status}: ${job.error||job.message}`)
  if(job.input?.mapPolygon?.length!==4) throw new Error('polígono não persistido')
  if(job.plan?.geometry?.type!=='polygon'||job.plan.geometry.polygon?.length!==4) throw new Error('geometria do plano ausente')
  if(!job.plan?.cells?.length) throw new Error('polígono não gerou células')
  if(job.results.some((item)=>item.company==='Barbearia Fora')) throw new Error('resultado fora do polígono não foi filtrado')
  if(!job.results.some((item)=>item.company==='Barbearia Dentro A')||!job.results.some((item)=>item.company==='Barbearia Dentro B')) throw new Error('resultados internos não foram preservados')
  if(!(job.coverage?.areaKm2>1&&job.coverage.areaKm2<100)) throw new Error(`área do polígono inválida: ${job.coverage?.areaKm2}`)
  if(job.coverage?.territoryPercent!==100) throw new Error(`cobertura ${job.coverage?.territoryPercent}`)
  if(job.coverage?.totalSources!==1||job.coverage?.completedSources!==1) throw new Error('modo polígono deveria usar descoberta territorial estrita antes de enrichment')
  if(overpassCalls<1) throw new Error('Overpass não executou')
  if(broadWebCalls!==0) throw new Error(`busca web ampla executou fora da geometria: ${broadWebCalls}`)
  console.log(`Garimpo V101.10.3-H1 polygon smoke: ${job.results.length} internas · ${job.plan.cells.length} células · ${job.coverage.areaKm2} km² · Web ampla ${broadWebCalls} · enrichment web ${webCalls-broadWebCalls} OK`)
} finally { child.kill('SIGTERM'); await close(); await fs.rm(stateDir,{recursive:true,force:true}) }
