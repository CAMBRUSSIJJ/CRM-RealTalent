import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4406
const agentPort = 4346
const stateDir = path.join(os.tmpdir(), `rt-h6-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let overpassCalls = 0

const provider = http.createServer((req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${providerPort}`)
  if (u.pathname === '/search') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify([{ boundingbox: ['-30.05','-29.75','-51.35','-51.00'], lat: '-29.90', lon: '-51.17', display_name: 'Canoas, RS' }]))
  }
  if (u.pathname === '/overpass') {
    overpassCalls += 1
    req.resume(); req.on('end', async () => {
      if (overpassCalls > 1) await sleep(240)
      res.setHeader('content-type', 'application/json')
      const elements = overpassCalls === 1 ? [{ type: 'node', id: 601, lat: -29.90, lon: -51.17, tags: {
        name: 'Barbearia Progressiva', shop: 'hairdresser', 'addr:city': 'Canoas', 'addr:street': 'Rua Central', 'addr:housenumber': '10',
        phone: '+55 51 3333-5555', email: 'contato@progressiva.test', website: `http://127.0.0.1:${providerPort}/empresa`
      } }] : []
      res.end(JSON.stringify({ elements }))
    }); return
  }
  if (u.pathname === '/robots.txt') { res.setHeader('content-type','text/plain'); return res.end('User-agent: *\nAllow: /\n') }
  if (u.pathname === '/empresa' || u.pathname === '/contato') {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    return res.end(`<html><body><h1>Barbearia Progressiva</h1><a href="/contato">Contato</a><a href="tel:+555133335555">(51) 3333-5555</a><a href="mailto:contato@progressiva.test">contato@progressiva.test</a><a href="https://instagram.com/progressivabarber">Instagram</a><p>CNPJ 12.345.678/0001-90</p></body></html>`)
  }
  if (u.pathname === '/cnpj/12345678000190') {
    res.setHeader('content-type','application/json')
    return res.end(JSON.stringify({ razao_social:'BARBEARIA PROGRESSIVA LTDA', nome_fantasia:'BARBEARIA PROGRESSIVA', municipio:'CANOAS', uf:'RS', cnae_fiscal_descricao:'Cabeleireiros e barbearias', descricao_situacao_cadastral:'ATIVA' }))
  }
  res.statusCode = 404; res.end('x')
})

await new Promise((resolve,reject)=>provider.listen(providerPort,'127.0.0.1',resolve).once('error',reject))
await fs.rm(stateDir,{recursive:true,force:true})
const child = spawn(process.execPath,['scripts/realtalent-prospecting-agent.mjs'],{
  env:{...process.env,REALTALENT_PROSPECTING_AGENT_TEST_MODE:'1',REALTALENT_PROVIDER_RETRIES:'1',REALTALENT_PROSPECTING_AGENT_PORT:String(agentPort),REALTALENT_PROSPECTING_AGENT_STATE_DIR:stateDir,REALTALENT_NOMINATIM_URL:`http://127.0.0.1:${providerPort}/search`,REALTALENT_OVERPASS_URLS:`http://127.0.0.1:${providerPort}/overpass`,REALTALENT_WEB_SEARCH_ENABLED:'0',REALTALENT_CNPJ_API_URL:`http://127.0.0.1:${providerPort}/cnpj`},
  stdio:['ignore','ignore','inherit']
})

async function health(){for(let i=0;i<60;i++){try{const j=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`).then(r=>r.json());if(['101.10.3-H6','101.10.3-H8','101.10.3-H9','101.10.4'].includes(j.version))return j}catch{}await sleep(100)}throw new Error('health H6 não respondeu')}
async function latest(){return (await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=h6`).then(r=>r.json())).jobs?.[0]}

try {
  await health()
  const created = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'h6',segment:'Barbearias',regions:['Canoas, RS'],targetMode:'max',targetQuantity:1000,areaMode:'city',radiusKm:15,searchMode:'coverage',enrichWeb:true,enrichCnpj:true,browserFallback:false})})
  if(!created.ok) throw new Error(await created.text())
  const createdJob=(await created.json()).job
  let progressive=null
  let statusWhenPublished=''
  for(let i=0;i<120;i++){
    const job=await latest()
    const batch=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs/${createdJob.id}/review?afterRevision=0&limit=50`).then(r=>r.json())
    if(batch.entries?.length){progressive=batch;statusWhenPublished=job?.status||'';break}
    await sleep(50)
  }
  if(!progressive?.entries?.length) throw new Error('nenhuma empresa foi publicada progressivamente')
  if(!['running','paused','queued'].includes(statusWhenPublished)) throw new Error(`empresa só apareceu após fechamento: ${statusWhenPublished}`)
  const candidate=progressive.entries[0]
  if(candidate.company!=='Barbearia Progressiva'||candidate.qualityStatus!=='ready') throw new Error('candidato progressivo inválido')
  if(!(candidate.reviewRevision>0)||!candidate.reviewPublishedAt) throw new Error('revisão incremental sem cursor persistente')
  const ackRes=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs/${createdJob.id}/review/ack`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:progressive.revision})})
  if(!ackRes.ok) throw new Error(await ackRes.text())
  const ackJob=(await ackRes.json()).job
  if(ackJob.reviewStream.acknowledgedRevision!==progressive.revision) throw new Error('ack não persistiu cursor')
  const empty=await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs/${createdJob.id}/review?afterRevision=${progressive.revision}`).then(r=>r.json())
  if(empty.entries?.length) throw new Error('batch já confirmado reapareceu')
  let finalJob=null
  for(let i=0;i<240;i++){const j=await latest();if(j&&['completed','failed'].includes(j.status)){finalJob=j;break}await sleep(75)}
  if(!finalJob||finalJob.status!=='completed') throw new Error(`job não concluiu: ${finalJob?.status}`)
  if(finalJob.clientImportedAt) throw new Error('ack progressivo marcou job inteiro como importado')
  if(finalJob.reviewStream.acknowledgedRevision!==progressive.revision) throw new Error('cursor foi perdido no fechamento')
  console.log(`H6 Progressive Processing smoke: publicado durante ${statusWhenPublished} · revisão ${progressive.revision} confirmada · job concluiu depois · sem reentrega`)
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve)=>provider.close(resolve))
  await fs.rm(stateDir,{recursive:true,force:true})
}
