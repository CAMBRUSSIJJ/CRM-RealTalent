import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const providerPort = 4405
const agentPort = 4345
const stateDir = path.join(os.tmpdir(), `rt-h5-${process.pid}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socialEnabled = false

const provider = http.createServer((req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${providerPort}`)
  if (u.pathname === '/search') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify([{ boundingbox: ['-30.0','-29.8','-51.3','-51.0'], lat: '-29.9', lon: '-51.15', display_name: 'Canoas, RS' }]))
  }
  if (u.pathname === '/overpass') {
    req.resume(); req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ elements: [{ type: 'node', id: 501, lat: -29.90, lon: -51.15, tags: { name: 'Barbearia Alpha', shop: 'hairdresser', 'addr:city': 'Canoas', 'addr:street': 'Rua Central' } }] }))
    }); return
  }
  if (u.pathname === '/web') {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    return res.end(`<html><body><a class="result__a" href="http://127.0.0.1:${providerPort}/alpha">Barbearia Alpha - Site Oficial</a></body></html>`)
  }
  if (u.pathname === '/robots.txt') {
    res.setHeader('content-type', 'text/plain')
    return res.end('User-agent: *\nAllow: /\n')
  }
  if (u.pathname === '/alpha' || u.pathname === '/contato') {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    const social = socialEnabled ? '<a href="https://instagram.com/barbeariaalpha">Instagram</a>' : ''
    return res.end(`<html><body><h1>Barbearia Alpha</h1><a href="/contato">Contato</a><a href="tel:+555133334444">(51) 3333-4444</a><a href="mailto:contato@alpha.test">contato@alpha.test</a><p>CNPJ 12.345.678/0001-90</p>${social}</body></html>`)
  }
  if (u.pathname === '/cnpj/12345678000190') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ razao_social: 'BARBEARIA ALPHA LTDA', nome_fantasia: 'BARBEARIA ALPHA', municipio: 'CANOAS', uf: 'RS', cnae_fiscal_descricao: 'Cabeleireiros e barbearias', descricao_situacao_cadastral: 'ATIVA', email: '', ddd_telefone_1: '' }))
  }
  res.statusCode = 404; res.end('x')
})

await new Promise((resolve, reject) => provider.listen(providerPort, '127.0.0.1', resolve).once('error', reject))
await fs.rm(stateDir, { recursive: true, force: true })
const child = spawn(process.execPath, ['scripts/realtalent-prospecting-agent.mjs'], {
  env: {
    ...process.env,
    REALTALENT_PROSPECTING_AGENT_TEST_MODE: '1',
    REALTALENT_PROVIDER_RETRIES: '1',
    REALTALENT_PROSPECTING_AGENT_PORT: String(agentPort),
    REALTALENT_PROSPECTING_AGENT_STATE_DIR: stateDir,
    REALTALENT_NOMINATIM_URL: `http://127.0.0.1:${providerPort}/search`,
    REALTALENT_OVERPASS_URLS: `http://127.0.0.1:${providerPort}/overpass`,
    REALTALENT_WEB_SEARCH_URL: `http://127.0.0.1:${providerPort}/web`,
    REALTALENT_CNPJ_API_URL: `http://127.0.0.1:${providerPort}/cnpj`,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})

async function health() {
  for (let i = 0; i < 60; i += 1) {
    try { const j = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/health`).then((r) => r.json()); if (['101.10.3-H5','101.10.3-H6','101.10.3-H8','101.10.3-H9','101.10.4'].includes(j.version)) return j } catch {}
    await sleep(100)
  }
  throw new Error('health H5 não respondeu')
}
async function waitJob() {
  for (let i = 0; i < 220; i += 1) {
    const j = (await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs?workspaceId=h5`).then((r) => r.json())).jobs?.[0]
    if (j && ['completed','failed'].includes(j.status)) return j
    await sleep(100)
  }
  throw new Error('timeout job H5')
}

try {
  const h = await health()
  if (!h.providers.websiteDiscovery || !h.providers.cnpjDiscovery || !h.providers.contactDiscovery || !h.providers.socialDiscovery) throw new Error('health não expõe discovery jobs')
  const response = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId: 'h5', segment: 'Barbearias', regions: ['Canoas, RS'], targetMode: 'quantity', targetQuantity: 1, areaMode: 'city', radiusKm: 15, searchMode: 'fast', enrichWeb: true, enrichCnpj: true, browserFallback: false }),
  })
  if (!response.ok) throw new Error(await response.text())
  let job = await waitJob()
  if (job.status !== 'completed') throw new Error(`job ${job.status}: ${job.error || job.message}`)
  const candidate = job.results.find((item) => item.company === 'Barbearia Alpha')
  if (!candidate) throw new Error('candidato não encontrado')
  if (!candidate.website?.includes('/alpha')) throw new Error(`website não descoberto: ${candidate.website}`)
  if (!String(candidate.phone).includes('3333')) throw new Error(`telefone não descoberto: ${candidate.phone}`)
  if (String(candidate.cnpj).replace(/\D/g, '') !== '12345678000190') throw new Error(`CNPJ não descoberto: ${candidate.cnpj}`)
  for (const id of ['website','contacts','cnpj']) if (candidate.enrichmentTasks?.[id]?.status !== 'completed') throw new Error(`${id} não concluiu: ${candidate.enrichmentTasks?.[id]?.status}`)
  if (candidate.enrichmentTasks?.social?.status !== 'attention') throw new Error(`social deveria pedir atenção: ${candidate.enrichmentTasks?.social?.status}`)
  const before = Object.fromEntries(['website','contacts','cnpj'].map((id) => [id, candidate.enrichmentTasks[id].attempts]))
  socialEnabled = true
  const retry = await fetch(`http://127.0.0.1:${agentPort}/api/prospecting-agent/jobs/${job.id}/candidates/${candidate.candidateId}/enrichment/social/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  if (!retry.ok) throw new Error(await retry.text())
  job = (await retry.json()).job
  const updated = job.results.find((item) => item.candidateId === candidate.candidateId)
  if (updated.enrichmentTasks.social.status !== 'completed' || !updated.instagram) throw new Error('reprocessamento social não concluiu')
  for (const id of ['website','contacts','cnpj']) if (updated.enrichmentTasks[id].attempts !== before[id]) throw new Error(`${id} foi repetido indevidamente`)
  console.log(`H5 Enrichment Jobs smoke: website=${updated.enrichmentTasks.website.status} · contacts=${updated.enrichmentTasks.contacts.status} · cnpj=${updated.enrichmentTasks.cnpj.status} · social=${updated.enrichmentTasks.social.status} · retry isolado OK`)
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => provider.close(resolve))
  await fs.rm(stateDir, { recursive: true, force: true })
}
