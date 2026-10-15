import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4408
const agentPort = 4348
const stateDir = path.join(os.tmpdir(), `rt-h8-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const overpassBodies = []
const webQueries = []

const provider = http.createServer((req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${providerPort}`)
  if (u.pathname === '/search') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify([{ boundingbox: ['-30.0','-29.8','-51.3','-51.0'], lat: '-29.9', lon: '-51.15', display_name: 'Canoas, RS' }]))
  }
  if (u.pathname === '/overpass') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      overpassBodies.push(decodeURIComponent(body))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ elements: [{ type: 'node', id: 801, lat: -29.90, lon: -51.15, tags: { name: 'Clima Sul Refrigeração', craft: 'hvac', 'addr:city': 'Canoas', phone: '+55 51 3333-8080', website: `http://127.0.0.1:${providerPort}/clima` } }] }))
    }); return
  }
  if (u.pathname === '/web') {
    webQueries.push(u.searchParams.get('q') || '')
    res.setHeader('content-type', 'text/html; charset=utf-8')
    return res.end(`<html><body><a class="result__a" href="http://127.0.0.1:${providerPort}/clima">Clima Sul Refrigeração - Site Oficial</a></body></html>`)
  }
  if (u.pathname === '/robots.txt') { res.setHeader('content-type','text/plain'); return res.end('User-agent: *\nAllow: /\n') }
  if (u.pathname === '/clima') { res.setHeader('content-type','text/html; charset=utf-8'); return res.end('<html><body><h1>Clima Sul Refrigeração</h1><a href="tel:+555133338080">Contato</a></body></html>') }
  res.statusCode = 404; res.end('x')
})

await new Promise((resolve,reject)=>provider.listen(providerPort,'127.0.0.1',resolve).once('error',reject))
await fs.rm(stateDir,{recursive:true,force:true})
const child = spawn(process.execPath,['scripts/realtalent-prospecting-agent.mjs'],{
  env:{...process.env,REALTALENT_PROSPECTING_AGENT_TEST_MODE:'1',REALTALENT_PROVIDER_RETRIES:'1',REALTALENT_PROSPECTING_AGENT_PORT:String(agentPort),REALTALENT_PROSPECTING_AGENT_STATE_DIR:stateDir,REALTALENT_NOMINATIM_URL:`http://127.0.0.1:${providerPort}/search`,REALTALENT_OVERPASS_URLS:`http://127.0.0.1:${providerPort}/overpass`,REALTALENT_WEB_SEARCH_URL:`http://127.0.0.1:${providerPort}/web`,REALTALENT_CNPJ_API_URL:`http://127.0.0.1:${providerPort}/cnpj`},
  stdio:['ignore','ignore','inherit']
})

async function health(){for(let i=0;i<60;i++){try{const j=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`).then(r=>r.json());if(['101.10.3-H8','101.10.3-H9','101.10.4'].includes(j.version))return j}catch{}await sleep(100)}throw new Error('health H8 não respondeu')}
async function waitJob(){for(let i=0;i<260;i++){const j=(await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=h8`).then(r=>r.json())).jobs?.[0];if(j&&['completed','failed'].includes(j.status))return j;await sleep(60)}throw new Error('timeout H8')}

try {
  const h = await health()
  if (!h.providers?.searchOntology || h.ontology?.version !== '1.0.0' || Number(h.ontology?.intents) < 15) throw new Error('health não expõe ontologia H8')
  const created = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'h8',segment:'empresa de climatização',regions:['Canoas, RS'],targetMode:'max',targetQuantity:1000,areaMode:'city',radiusKm:15,searchMode:'fast',enrichWeb:false,enrichCnpj:false,browserFallback:false})})
  if(!created.ok) throw new Error(await created.text())
  const job = await waitJob()
  if(job.status!=='completed') throw new Error(`job ${job.status}: ${job.error||job.message}`)
  if(job.plan?.ontology?.intentId!=='hvac') throw new Error(`intenção errada: ${job.plan?.ontology?.intentId}`)
  if(job.plan.ontology.confidence < 90) throw new Error(`confiança baixa: ${job.plan.ontology.confidence}`)
  if(!job.plan.ontology.cnaes?.some((item)=>item.code==='4322-3/02')) throw new Error('CNAE HVAC ausente')
  if(!job.plan.expandedQueries?.some((item)=>String(item).toLowerCase()==='hvac')) throw new Error('HVAC não entrou na expansão')
  if(!overpassBodies.some((body)=>body.includes('craft')&&body.includes('hvac'))) throw new Error('OSM não recebeu regra craft=hvac')
  if(!webQueries.some((q)=>/HVAC/i.test(q)) || !webQueries.some((q)=>/climatização/i.test(q))) throw new Error(`web planner estrito não preservou termos canônicos da ontologia: ${webQueries.join(' | ')}`)
  if(!job.results.some((item)=>item.company==='Clima Sul Refrigeração')) throw new Error('empresa HVAC não chegou aos resultados')
  console.log(`H8 Search Ontology smoke: intent=${job.plan.ontology.intentId} · confiança=${job.plan.ontology.confidence}% · CNAE=4322-3/02 · OSM craft=hvac · ${webQueries.length} consultas web expandidas`)
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve)=>provider.close(resolve))
  await fs.rm(stateDir,{recursive:true,force:true})
}
