import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4465
const agentPort = 4395
const stateDir = path.join(os.tmpdir(), `rt-h15-strict-scope-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let overpassBody = ''
let webRequests = 0

const provider = http.createServer((req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${providerPort}`)
  if (u.pathname === '/search') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify([{ boundingbox: ['-32.20','-31.90','-52.30','-52.00'], lat: '-32.03', lon: '-52.10', display_name: 'Rio Grande, RS' }]))
  }
  if (u.pathname === '/overpass') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      overpassBody += decodeURIComponent(body)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ elements: [
        { type:'node', id:1501, lat:-32.03, lon:-52.10, tags:{ name:'Barbearia Porto', shop:'hairdresser', hairdresser:'barber', 'addr:city':'Rio Grande', phone:'+55 53 99999-1501' } },
        { type:'node', id:1502, lat:-32.04, lon:-52.11, tags:{ name:'Salão Bella', shop:'hairdresser', 'addr:city':'Rio Grande', phone:'+55 53 99999-1502' } },
        { type:'node', id:1503, lat:-32.02, lon:-52.09, tags:{ name:'Barbearia Pelotas', shop:'hairdresser', hairdresser:'barber', 'addr:city':'Pelotas', phone:'+55 53 99999-1503' } },
      ] }))
    })
    return
  }
  if (u.pathname === '/web') {
    webRequests += 1
    res.setHeader('content-type', 'text/html; charset=utf-8')
    const variants = [
      `<a class="result__a" href="http://127.0.0.1:${providerPort}/blog/top10">10 melhores barbearias de Rio Grande</a>`,
      `<a class="result__a" href="http://127.0.0.1:${providerPort}/barber-beta">Barbearia Beta Rio Grande - Site oficial</a>`,
      `<a class="result__a" href="http://127.0.0.1:${providerPort}/salao-rg">Salão de Beleza Glamour Rio Grande</a>`,
      `<a class="result__a" href="http://127.0.0.1:${providerPort}/barber-pelotas">Barbearia Central Pelotas</a>`,
      `<a class="result__a" href="http://127.0.0.1:${providerPort}/barber-beta">Barbearia Beta Rio Grande - Site oficial</a>`,
    ]
    return res.end(`<html><body>${variants[(webRequests - 1) % variants.length]}</body></html>`)
  }
  if (u.pathname === '/robots.txt') { res.setHeader('content-type','text/plain'); return res.end('User-agent: *\nAllow: /\n') }
  if (u.pathname === '/barber-beta') { res.setHeader('content-type','text/html; charset=utf-8'); return res.end('<html><body><h1>Barbearia Beta</h1><p>Barbearia masculina em Rio Grande - RS. Corte e barba.</p><a href="tel:+5553999991504">(53) 99999-1504</a></body></html>') }
  if (u.pathname === '/salao-rg') { res.setHeader('content-type','text/html; charset=utf-8'); return res.end('<html><body><h1>Salão de Beleza Glamour</h1><p>Salão de beleza e estética em Rio Grande - RS.</p><a href="tel:+5553999991505">(53) 99999-1505</a></body></html>') }
  if (u.pathname === '/barber-pelotas') { res.setHeader('content-type','text/html; charset=utf-8'); return res.end('<html><body><h1>Barbearia Central</h1><p>Barbearia em Pelotas - RS.</p><a href="tel:+5553999991506">(53) 99999-1506</a></body></html>') }
  if (u.pathname === '/blog/top10') { res.setHeader('content-type','text/html; charset=utf-8'); return res.end('<html><body><article>Ranking editorial: 10 melhores barbearias de Rio Grande. Lista informativa.</article></body></html>') }
  res.statusCode = 404; res.end('x')
})

await new Promise((resolve,reject)=>provider.listen(providerPort,'127.0.0.1',resolve).once('error',reject))
await fs.rm(stateDir,{recursive:true,force:true})
const child = spawn(process.execPath,['scripts/realtalent-prospecting-agent.mjs'],{
  env:{...process.env,REALTALENT_PROSPECTING_AGENT_TEST_MODE:'1',REALTALENT_PROVIDER_RETRIES:'1',REALTALENT_PROSPECTING_AGENT_PORT:String(agentPort),REALTALENT_PROSPECTING_AGENT_STATE_DIR:stateDir,REALTALENT_NOMINATIM_URL:`http://127.0.0.1:${providerPort}/search`,REALTALENT_OVERPASS_URLS:`http://127.0.0.1:${providerPort}/overpass`,REALTALENT_WEB_SEARCH_URL:`http://127.0.0.1:${providerPort}/web`,REALTALENT_CNPJ_API_URL:`http://127.0.0.1:${providerPort}/cnpj`},
  stdio:['ignore','ignore','inherit']
})
async function health(){for(let i=0;i<80;i++){try{const j=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`).then(r=>r.json());if(j.ok)return j}catch{}await sleep(80)}throw new Error('health H15 não respondeu')}
async function waitJob(){for(let i=0;i<500;i++){const j=(await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=h15`).then(r=>r.json())).jobs?.[0];if(j&&['completed','failed'].includes(j.status))return j;await sleep(40)}throw new Error('timeout H15')}
try {
  const h=await health()
  if(!h.providers?.strictScope || !h.strictScope?.categoryGate || !h.strictScope?.localityGate || !h.strictScope?.contentGate) throw new Error('health não expõe Strict Scope Engine')
  const created=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'h15',segment:'barbearias',regions:['Rio Grande, RS'],categoryMode:'exact',targetMode:'max',targetQuantity:1000,areaMode:'city',radiusKm:15,searchMode:'fast',enrichWeb:false,enrichCnpj:false,browserFallback:false})})
  if(!created.ok) throw new Error(await created.text())
  const job=await waitJob()
  if(job.status!=='completed') throw new Error(`job ${job.status}: ${job.error||job.message}`)
  const names=(job.results||[]).map((x)=>x.company||x.name)
  if(!names.includes('Barbearia Porto')) throw new Error(`barbearia OSM válida ausente: ${names.join(' | ')}`)
  if(!names.some((n)=>/Barbearia Beta/i.test(n))) throw new Error(`barbearia web válida ausente: ${names.join(' | ')}`)
  if(names.some((n)=>/Salão Bella|Glamour/i.test(n))) throw new Error(`salão entrou em busca exata de barbearias: ${names.join(' | ')}`)
  if(names.some((n)=>/Pelotas/i.test(n))) throw new Error(`empresa fora da cidade entrou: ${names.join(' | ')}`)
  if(names.some((n)=>/10 melhores|ranking/i.test(n))) throw new Error(`artigo/listicle entrou como empresa: ${names.join(' | ')}`)
  if(Number(job.stats?.scopeRejectedCategory||0)<1) throw new Error('nenhuma rejeição de categoria contabilizada')
  if(Number(job.stats?.scopeRejectedLocation||0)<1) throw new Error('nenhuma rejeição geográfica contabilizada')
  if(Number(job.stats?.webRejectedDocuments||0)<1) throw new Error('documento editorial não foi rejeitado')
  if(!Array.isArray(job.rejections)||!job.rejections.some((x)=>x.type==='category')||!job.rejections.some((x)=>x.type==='location')) throw new Error('auditoria de rejeições incompleta')
  if(!/hairdresser.*barber|barber.*hairdresser/i.test(overpassBody)) throw new Error('consulta OSM não usa filtro exato de barber')
  if(webRequests<1) throw new Error('fallback web não executou')
  console.log(`H15 Strict Prospecting Scope smoke: resultados=${names.join(', ')} · categoria rejeitada=${job.stats.scopeRejectedCategory} · localização rejeitada=${job.stats.scopeRejectedLocation} · documentos rejeitados=${job.stats.webRejectedDocuments}`)
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve)=>provider.close(resolve))
  await fs.rm(stateDir,{recursive:true,force:true})
}
