import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4409
const agentPort = 4349
const stateDir = path.join(os.tmpdir(), `rt-h9-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let overpassCalls = 0

function parseBox(body) {
  const query = new URLSearchParams(body).get('data') || ''
  const match = query.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/)
  if (!match) return { south:-29.95, west:-51.20, north:-29.85, east:-51.10 }
  return { south:Number(match[1]), west:Number(match[2]), north:Number(match[3]), east:Number(match[4]) }
}

const provider = http.createServer((req,res)=>{
  const u=new URL(req.url||'/',`http://127.0.0.1:${providerPort}`)
  if(u.pathname==='/search') { res.setHeader('content-type','application/json'); return res.end(JSON.stringify([{boundingbox:['-30.05','-29.75','-51.35','-50.95'],lat:'-29.90',lon:'-51.15',display_name:'Canoas, RS'}])) }
  if(u.pathname==='/overpass') {
    let body=''; req.on('data',(c)=>{body+=c}); req.on('end',()=>{
      overpassCalls += 1
      const b=parseBox(body); const width=Math.abs(b.east-b.west); const lat=(b.south+b.north)/2; const lon=(b.west+b.east)/2
      const dense=width>0.03; const count=dense?20:1; const elements=[]
      for(let i=0;i<count;i++) elements.push({type:'node',id:overpassCalls*100+i,lat:lat+(i-1.5)*0.0002,lon:lon+(i-1.5)*0.0002,tags:{name:`Empresa ${overpassCalls}-${i}`,shop:'hairdresser','addr:city':'Canoas',phone:`+55 51 9${String(overpassCalls).padStart(4,'0')}${String(i).padStart(4,'0')}`}})
      if(overpassCalls===1) elements[0]={type:'node',id:999999,lat:b.north-0.00001,lon:b.east-0.00001,tags:{name:'FORA DO RAIO',shop:'hairdresser','addr:city':'Canoas'}}
      res.setHeader('content-type','application/json'); res.end(JSON.stringify({elements}))
    }); return
  }
  res.statusCode=404;res.end('x')
})

await new Promise((resolve,reject)=>provider.listen(providerPort,'127.0.0.1',resolve).once('error',reject))
await fs.rm(stateDir,{recursive:true,force:true})
const child=spawn(process.execPath,['scripts/realtalent-prospecting-agent.mjs'],{env:{...process.env,REALTALENT_PROSPECTING_AGENT_TEST_MODE:'1',REALTALENT_PROVIDER_RETRIES:'1',REALTALENT_PROSPECTING_AGENT_PORT:String(agentPort),REALTALENT_PROSPECTING_AGENT_STATE_DIR:stateDir,REALTALENT_NOMINATIM_URL:`http://127.0.0.1:${providerPort}/search`,REALTALENT_OVERPASS_URLS:`http://127.0.0.1:${providerPort}/overpass`,REALTALENT_WEB_SEARCH_ENABLED:'0',REALTALENT_DENSE_CELL_THRESHOLD:'20',REALTALENT_MAX_SUBDIVISION_LEVEL:'2',REALTALENT_MAX_SEARCH_CELLS:'64',REALTALENT_MIN_SUBDIVISION_AREA_KM2:'0.05'},stdio:['ignore','ignore','inherit']})
async function health(){for(let i=0;i<80;i++){try{const j=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`).then(r=>r.json());if(['101.10.3-H9','101.10.4'].includes(j.version))return j}catch{}await sleep(80)}throw new Error('health H9 não respondeu')}
async function waitJob(){for(let i=0;i<500;i++){const j=(await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=h9`).then(r=>r.json())).jobs?.[0];if(j&&['completed','failed'].includes(j.status))return j;await sleep(40)}throw new Error('timeout H9')}
try{
  const h=await health(); if(!h.providers?.territoryEngine2||h.territoryEngine?.version!=='2.0.0'||h.territoryEngine?.maxSubdivisionLevel!==2) throw new Error('health não expõe Territory Engine 2.0')
  const created=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'h9',segment:'barbearia',regions:['Canoas, RS'],targetMode:'max',targetQuantity:1000,areaMode:'radius',radiusKm:5,searchMode:'fast',enrichWeb:false,enrichCnpj:false,browserFallback:false})})
  if(!created.ok) throw new Error(await created.text())
  const job=await waitJob(); if(job.status!=='completed') throw new Error(`job ${job.status}: ${job.error||job.message}`)
  if(job.plan?.geometry?.type!=='circle'||job.plan.geometry.polygon?.length<24) throw new Error('raio não virou geometria circular')
  if((job.coverage?.deepestSubdivisionLevel||0)<2) throw new Error(`subdivisão não chegou ao nível 2: ${job.coverage?.deepestSubdivisionLevel}`)
  if((job.coverage?.subdivisionCount||0)<2) throw new Error(`poucas subdivisões: ${job.coverage?.subdivisionCount}`)
  if((job.coverage?.successfulTerritoryPercent||0)!==100) throw new Error(`cobertura final não é 100%: ${job.coverage?.successfulTerritoryPercent}`)
  if(!(job.coverage?.successfulAreaKm2>55&&job.coverage?.successfulAreaKm2<95)) throw new Error(`área ponderada inesperada: ${job.coverage?.successfulAreaKm2}`)
  if(Math.abs((job.coverage?.areaKm2||0)-78.5)>2) throw new Error(`área circular planejada incorreta: ${job.coverage?.areaKm2}`)
  if(job.results.some((item)=>item.company==='FORA DO RAIO')) throw new Error('resultado fora do raio não foi filtrado')
  if(overpassCalls<8) throw new Error(`subdivisão recursiva gerou poucas consultas: ${overpassCalls}`)
  console.log(`H9 Territory Engine 2.0 smoke: ${overpassCalls} consultas OSM · nível ${job.coverage.deepestSubdivisionLevel} · ${job.coverage.subdivisionCount} subdivisões · ${job.coverage.successfulAreaKm2} km² ponderados · fora-do-raio filtrado`)
}finally{child.kill('SIGTERM');await new Promise((resolve)=>provider.close(resolve));await fs.rm(stateDir,{recursive:true,force:true})}
