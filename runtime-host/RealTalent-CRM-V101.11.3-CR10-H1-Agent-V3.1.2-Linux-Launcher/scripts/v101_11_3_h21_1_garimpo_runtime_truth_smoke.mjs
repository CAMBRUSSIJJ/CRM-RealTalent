import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 49331
const agentPort = 49332
const stateDir = path.join(os.tmpdir(), `rt-h21-1-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let exactCalls = 0
let coverageCalls = 0

const provider = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${providerPort}`)
  if (url.pathname === '/search') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify([{ boundingbox: ['-32.05', '-32.00', '-52.15', '-52.05'], lat: '-32.025', lon: '-52.10', display_name: 'Rio Grande, RS' }]))
  }
  if (url.pathname === '/overpass') {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      const decoded = decodeURIComponent(raw)
      const expanded = decoded.includes('["shop"="hairdresser"](')
      if (expanded) coverageCalls += 1
      else exactCalls += 1
      const exact = { type: 'node', id: 1001, lat: -32.025, lon: -52.10, tags: { name: 'Barbearia Alpha', shop: 'hairdresser', hairdresser: 'barber', 'addr:city': 'Rio Grande', phone: '(53) 99999-1001' } }
      const payload = expanded
        ? { elements: [
            exact,
            { type: 'node', id: 1002, lat: -32.026, lon: -52.101, tags: { name: 'Studio Davi', shop: 'hairdresser', 'addr:city': 'Rio Grande', phone: '(53) 99999-1002' } },
            { type: 'node', id: 1003, lat: -32.027, lon: -52.102, tags: { name: 'Salão de Beleza Bela', shop: 'hairdresser', 'addr:city': 'Rio Grande' } },
          ] }
        : { elements: [exact] }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(payload))
    })
    return
  }
  res.statusCode = 404
  res.end('not found')
})

const listen = () => new Promise((resolve, reject) => provider.listen(providerPort, '127.0.0.1', resolve).once('error', reject))
const close = () => new Promise((resolve) => provider.close(resolve))
async function waitHealth() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`)
      const data = await response.json()
      if (response.ok && data.providers?.coverageExpansion && data.providers?.runtimeTruth) return data
    } catch {}
    await sleep(100)
  }
  throw new Error('Agent H21.1 não respondeu com coverageExpansion/runtimeTruth')
}
async function waitJob(workspaceId) {
  for (let i = 0; i < 240; i += 1) {
    const response = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=${encodeURIComponent(workspaceId)}`)
    const job = (await response.json()).jobs?.[0]
    if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) return job
    await sleep(100)
  }
  throw new Error('Job H21.1 não concluiu')
}

await listen()
await fs.rm(stateDir, { recursive: true, force: true })
const child = spawn(process.execPath, ['scripts/realtalent-prospecting-agent.mjs'], {
  env: {
    ...process.env,
    REALTALENT_PROSPECTING_AGENT_TEST_MODE: '1',
    REALTALENT_PROVIDER_RETRIES: '1',
    REALTALENT_WEB_SEARCH_ENABLED: '0',
    REALTALENT_PROSPECTING_AGENT_PORT: String(agentPort),
    REALTALENT_PROSPECTING_AGENT_STATE_DIR: stateDir,
    REALTALENT_NOMINATIM_URL: `http://127.0.0.1:${providerPort}/search`,
    REALTALENT_OVERPASS_URLS: `http://127.0.0.1:${providerPort}/overpass`,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})

try {
  await waitHealth()
  const create = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      workspaceId: 'h21-runtime-truth', segment: 'Barbearia', regions: ['Rio Grande, RS'], targetMode: 'max', targetQuantity: 50,
      areaMode: 'radius', radiusKm: 5, searchMode: 'coverage', categoryMode: 'exact', enrichWeb: false, enrichCnpj: false, browserFallback: false,
    }),
  })
  if (!create.ok) throw new Error(`create ${create.status}`)
  const job = await waitJob('h21-runtime-truth')
  if (job.status !== 'completed') throw new Error(`status ${job.status}: ${job.error || job.message}`)
  if (exactCalls < 1 || coverageCalls < 1) throw new Error(`esperava varredura exata + cobertura; exact=${exactCalls} coverage=${coverageCalls}`)
  const names = job.results.map((item) => item.company || item.name)
  if (!names.includes('Barbearia Alpha')) throw new Error('resultado exato não preservado')
  const davi = job.results.find((item) => (item.company || item.name) === 'Studio Davi')
  if (!davi) throw new Error('candidato de cobertura não entrou')
  if (!davi.coverageCandidate || davi.qualityStatus !== 'attention') throw new Error('candidato de cobertura deveria exigir revisão')
  if (names.includes('Salão de Beleza Bela')) throw new Error('categoria explicitamente conflitante não deveria entrar')
  if (!job.runtime || job.runtime.runId !== job.id || job.runtime.phase !== 'completed') throw new Error('runtime truth não fechou a execução')
  if (!job.runtime.events?.some((event) => event.type === 'coverage_expansion')) throw new Error('timeline não registrou expansão de cobertura')
  if ((job.processing?.validation ?? 0) < job.results.length) throw new Error('contador de validação não reflete etapas processadas')
  console.log(`H21.1 runtime truth smoke: ${job.results.length} empresas · cobertura extra=${coverageCalls} · Studio Davi=attention · rejeição explícita preservada · timeline=${job.runtime.events.length} OK`)
} finally {
  child.kill('SIGTERM')
  await sleep(80)
  await close()
  await fs.rm(stateDir, { recursive: true, force: true })
}
