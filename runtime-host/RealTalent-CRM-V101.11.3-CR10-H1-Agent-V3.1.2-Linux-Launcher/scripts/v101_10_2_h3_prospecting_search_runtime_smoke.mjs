import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4397
const agentPort = 4337
const stateDir = path.join(os.tmpdir(), `realtalent-prospecting-h3-smoke-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const provider = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${providerPort}`)
  if (url.pathname === '/search') {
    if ((url.searchParams.get('q') || '').includes('SemGeo')) { res.statusCode = 503; return res.end('offline') }
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify([{ boundingbox: ['-30.0', '-29.8', '-51.3', '-51.0'], display_name: 'Canoas, RS, Brasil' }]))
  }
  if (url.pathname === '/overpass') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const query = new URLSearchParams(body).get('data') || ''
      const fallbackRegion = query.includes('SemGeo')
      const city = fallbackRegion ? 'SemGeo' : 'Canoas'
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ elements: [
        { type: 'node', id: 1, lat: -29.9, lon: -51.1, tags: { name: `Barbearia Alpha ${city}`, shop: 'hairdresser', hairdresser: 'barber', 'addr:city': city, phone: '(51) 99999-1111' } },
        { type: 'node', id: 2, lat: -29.91, lon: -51.11, tags: { name: `Barbearia Beta ${city}`, shop: 'hairdresser', hairdresser: 'barber', 'addr:city': city, phone: '(51) 99999-2222' } },
      ] }))
    })
    return
  }
  if (url.pathname === '/html/' || url.pathname === '/html') {
    res.setHeader('content-type', 'text/html')
    return res.end(`<html><a class="result__a" href="http://127.0.0.1:${providerPort}/biz3">Barbearia Gamma - Canoas</a></html>`)
  }
  if (url.pathname === '/robots.txt') { res.setHeader('content-type', 'text/plain'); return res.end('User-agent: *\nAllow: /') }
  if (url.pathname === '/biz3') { res.setHeader('content-type', 'text/html'); return res.end('<html><body>Barbearia Gamma telefone (51) 98888-3333 gamma@exemplo.com.br</body></html>') }
  res.statusCode = 404
  res.end('not found')
})

const listen = () => new Promise((resolve, reject) => provider.listen(providerPort, '127.0.0.1', resolve).once('error', reject))
const close = () => new Promise((resolve) => provider.close(resolve))

async function waitHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`)
      const j = await r.json()
      if (r.ok && ['101.10.2-H3','101.10.3','101.10.3-H1','101.10.3-H4','101.10.3-H5','101.10.3-H6','101.10.3-H8','101.10.3-H9','101.10.4'].includes(j.version) && j.providers?.openstreetmap && j.providers?.webDiscovery) return j
    } catch {}
    await sleep(100)
  }
  throw new Error('health H3 não respondeu')
}

async function createJob(workspaceId, region, targetQuantity) {
  const response = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId, segment: 'Barbearias', regions: [region], targetQuantity, enrichWeb: true, enrichCnpj: false, browserFallback: false }),
  })
  if (!response.ok) throw new Error(`create job ${response.status}`)
  return (await response.json()).job
}

async function waitJob(workspaceId) {
  for (let i = 0; i < 120; i += 1) {
    const response = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=${encodeURIComponent(workspaceId)}`)
    const job = (await response.json()).jobs?.[0]
    if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) return job
    await sleep(100)
  }
  throw new Error(`job ${workspaceId} não concluiu`)
}

await listen()
await fs.rm(stateDir, { recursive: true, force: true })
const child = spawn(process.execPath, ['scripts/realtalent-prospecting-agent.mjs'], {
  env: {
    ...process.env,
    REALTALENT_PROSPECTING_AGENT_TEST_MODE: '1',
    REALTALENT_PROSPECTING_AGENT_PORT: String(agentPort),
    REALTALENT_PROSPECTING_AGENT_STATE_DIR: stateDir,
    REALTALENT_NOMINATIM_URL: `http://127.0.0.1:${providerPort}/search`,
    REALTALENT_OVERPASS_URLS: `http://127.0.0.1:${providerPort}/overpass`,
    REALTALENT_WEB_SEARCH_URL: `http://127.0.0.1:${providerPort}/html/`,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})

try {
  await waitHealth()
  await createJob('h3-search', 'Canoas, RS', 3)
  const search = await waitJob('h3-search')
  if (search.status !== 'completed' || search.results.length !== 3) throw new Error(`busca híbrida inválida: ${search.status}/${search.results.length}`)
  if (!search.results.some((item) => item.provider === 'web_discovery' && item.email === 'gamma@exemplo.com.br')) throw new Error('web discovery/enrichment não entrou na busca')

  await createJob('h3-area-fallback', 'SemGeo, RS', 2)
  const fallback = await waitJob('h3-area-fallback')
  if (fallback.status !== 'completed' || fallback.results.length !== 2) throw new Error(`fallback de área inválido: ${fallback.status}/${fallback.results.length}`)
  if (!fallback.warnings.some((item) => item.includes('coordenadas') || item.includes('Planejamento territorial') || item.includes('Nominatim'))) throw new Error('fallback não registrou falha de geocodificação')

  console.log('Prospecting H3 runtime smoke: OSM + web discovery + enrichment + fallback sem Nominatim OK')
} finally {
  child.kill('SIGTERM')
  await close()
  await fs.rm(stateDir, { recursive: true, force: true })
}
