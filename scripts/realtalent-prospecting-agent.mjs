#!/usr/bin/env node
import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID, timingSafeEqual } from 'node:crypto'

const VERSION = '101.10.4'
const H21_RUNTIME_VERSION = '101.11.3-H21.1'
// Compatibility lineage marker: const VERSION = '101.10.3-H9'
const HOST = process.env.REALTALENT_PROSPECTING_AGENT_HOST || '127.0.0.1'
const PORT = Number(process.env.REALTALENT_PROSPECTING_AGENT_PORT || 4319)
const RUNTIME_TOKEN = String(process.env.REALTALENT_PROSPECTING_RUNTIME_TOKEN || '').trim()
const ROOT = process.cwd()
const STATE_DIR = process.env.REALTALENT_PROSPECTING_AGENT_STATE_DIR || path.join(ROOT, '.realtalent-prospecting-agent')
const STATE_FILE = path.join(STATE_DIR, 'state.json')
const USER_AGENT = `RealTalent-Prospecting-Agent/${VERSION} (${os.platform()}; public-business-discovery)`
const TEST_MODE = process.env.REALTALENT_PROSPECTING_AGENT_TEST_MODE === '1'
const OVERPASS_ENDPOINTS = (process.env.REALTALENT_OVERPASS_URLS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter')
  .split(',').map((value) => value.trim()).filter(Boolean)
const NOMINATIM = process.env.REALTALENT_NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search'
const WEB_SEARCH = process.env.REALTALENT_WEB_SEARCH_URL || 'https://html.duckduckgo.com/html/'
const WEB_SEARCH_ENABLED = process.env.REALTALENT_WEB_SEARCH_ENABLED !== '0'
const CNPJ_API = process.env.REALTALENT_CNPJ_API_URL || 'https://brasilapi.com.br/api/cnpj/v1'
const PROVIDER_RETRIES = Math.max(1, Math.min(3, Number(process.env.REALTALENT_PROVIDER_RETRIES || 2)))
const providerRuntime = {
  nominatim: { state: 'idle', lastSuccessAt: null, lastError: null },
  overpass: { state: 'idle', lastSuccessAt: null, lastError: null },
  webSearch: { state: WEB_SEARCH_ENABLED ? 'idle' : 'disabled', lastSuccessAt: null, lastError: null },
}
const MAX_RESULTS = 1000
const MAX_EXISTING_KEYS = 15000
const MAX_BODY = 1_000_000
const MAX_SEARCH_CELLS = Math.max(64, Math.min(512, Number(process.env.REALTALENT_MAX_SEARCH_CELLS || 256)))
const MAX_SUBDIVISION_LEVEL = Math.max(1, Math.min(5, Number(process.env.REALTALENT_MAX_SUBDIVISION_LEVEL || 3)))
const MIN_SUBDIVISION_AREA_KM2 = Math.max(0.05, Number(process.env.REALTALENT_MIN_SUBDIVISION_AREA_KM2 || 0.35))
const DENSE_CELL_THRESHOLD = Math.max(20, Number(process.env.REALTALENT_DENSE_CELL_THRESHOLD || 80))
const SATURATION_WINDOW = 6
const COVERAGE_EXPANSION_VERSION = '21.1.0'
const COVERAGE_HINT_LIMIT = Math.max(4, Math.min(24, Number(process.env.REALTALENT_COVERAGE_HINT_LIMIT || 12)))
const ENRICHMENT_TASK_IDS = ['website', 'contacts', 'cnpj', 'social']
const ENRICHMENT_TASK_MAX_ATTEMPTS = { website: 3, contacts: 3, cnpj: 3, social: 2 }

const secureEqual = (a, b) => { const left=Buffer.from(String(a||'')); const right=Buffer.from(String(b||'')); return left.length===right.length && left.length>0 && timingSafeEqual(left,right) }
const suppliedRuntimeToken = (req) => String(req.headers['x-realtalent-prospecting-token'] || '').trim()
const hostIsLoopback = ['127.0.0.1','localhost','::1'].includes(String(HOST).trim().toLowerCase())
if (!hostIsLoopback && !RUNTIME_TOKEN) { console.error('REALTALENT_PROSPECTING_RUNTIME_TOKEN é obrigatório fora de loopback.'); process.exit(1) }

const now = () => new Date().toISOString()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')
const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const digits = (value) => clean(value).replace(/\D/g, '')
const domain = (value) => clean(value).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase()
const json = (res, body, status = 200) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

const html = (res, body, status = 200) => {
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(body)
}

function agentDashboardHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>RealTalent · Motor local de Garimpo</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17212b;background:#f5f6f4}*{box-sizing:border-box}body{margin:0;min-height:100vh}.shell{max-width:1040px;margin:0 auto;padding:36px 24px 60px}.top{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:24px}.brand{display:flex;align-items:center;gap:12px}.mark{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:#04342c;color:white;font-weight:800;font-size:20px}.brand strong,.brand span{display:block}.brand span{font-size:13px;color:#667085;margin-top:2px}.status{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #b9ddcf;background:#eefaf5;border-radius:999px;font-size:13px;font-weight:700;color:#116149}.dot{width:8px;height:8px;background:#1d9e75;border-radius:50%}.hero{background:white;border:1px solid #e2e6e3;border-radius:20px;padding:26px;box-shadow:0 8px 28px rgba(20,35,30,.06)}h1{font-size:28px;margin:0 0 8px}.hero p{color:#667085;margin:0;line-height:1.55}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px}.card{padding:16px;border:1px solid #e3e7e5;border-radius:14px;background:#fbfcfb}.card small{display:block;color:#667085;margin-bottom:6px}.card strong{font-size:18px}.section{margin-top:18px;background:white;border:1px solid #e2e6e3;border-radius:18px;padding:20px}.section header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.section h2{font-size:16px;margin:0}.btn{border:1px solid #d7deda;background:white;border-radius:9px;padding:8px 12px;font:inherit;font-weight:650;cursor:pointer}.jobs{display:grid;gap:8px}.job{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px;border:1px solid #e6e9e7;border-radius:12px}.job strong,.job span{display:block}.job span{font-size:12px;color:#667085;margin-top:3px}.pill{font-size:11px;border-radius:999px;padding:5px 8px;background:#eef2f0;color:#475467;font-weight:700}.empty{padding:24px;text-align:center;color:#667085;background:#fafbfa;border-radius:12px}.foot{margin-top:14px;color:#667085;font-size:12px}.foot code{background:#eef1ef;padding:2px 5px;border-radius:5px}@media(max-width:760px){.grid{grid-template-columns:1fr 1fr}.job{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<main class="shell">
<div class="top"><div class="brand"><div class="mark">RT</div><div><strong>RealTalent</strong><span>Motor local de Garimpo</span></div></div><div class="status"><span class="dot"></span> Agent conectado</div></div>
<section class="hero"><h1>Motor local pronto</h1><p>Este serviço executa as buscas automáticas do Garimpo no Linux. Volte ao CRM, informe o segmento e a região e clique em <strong>Iniciar garimpo no Linux</strong>.</p><div class="grid"><div class="card"><small>Status</small><strong id="health">Conectado</strong></div><div class="card"><small>Na fila</small><strong id="queued">0</strong></div><div class="card"><small>Executando</small><strong id="running">0</strong></div><div class="card"><small>Navegador local</small><strong id="chromium">—</strong></div></div></section>
<section class="section"><header><h2>Atividade recente</h2><button class="btn" id="refresh">Atualizar</button></header><div id="jobs" class="jobs"><div class="empty">Nenhum job carregado.</div></div><div class="foot">A API fica restrita ao computador local em <code>127.0.0.1:${PORT}</code>. O Agent não resolve CAPTCHA nem faz login em sites.</div></section>
</main>
<script>
const esc=(v)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const labels={queued:'Na fila',running:'Executando',paused:'Pausado',completed:'Concluído',cancelled:'Cancelado',failed:'Falhou'};
async function refresh(){
 try{
  const [h,j]=await Promise.all([fetch('/api/prospecting-agent/health').then(r=>r.json()),fetch('/api/prospecting-agent/jobs').then(r=>r.json())]);
  document.querySelector('#health').textContent=h.ok?'Conectado':'Indisponível'; document.querySelector('#queued').textContent=h.queued??0; document.querySelector('#running').textContent=h.running??0; document.querySelector('#chromium').textContent=h.chromium?'Disponível':'HTTP';
  const jobs=(j.jobs||[]).slice(0,8);
  document.querySelector('#jobs').innerHTML=jobs.length?jobs.map(x=>'<div class="job"><div><strong>'+esc(x.input?.segment||'Garimpo')+'</strong><span>'+esc((x.input?.regions||[]).join(' · '))+'</span></div><div><strong>'+esc(x.results?.length||0)+' / '+esc(x.input?.targetQuantity||0)+'</strong><span>'+esc(x.message||'')+'</span></div><div class="pill">'+esc(labels[x.status]||x.status)+'</div></div>').join(''):'<div class="empty">Nenhum garimpo executado ainda.</div>'
 }catch(e){document.querySelector('#health').textContent='Erro'; document.querySelector('#jobs').innerHTML='<div class="empty">Não foi possível consultar o Agent.</div>'}
}
document.querySelector('#refresh').addEventListener('click',refresh); refresh(); setInterval(refresh,3500);
</script>
</body></html>`
}

const emptyCoverage = () => ({
  // territoryPercent remains the compatibility alias for SUCCESSFUL coverage.
  territoryPercent: 0,
  attemptedTerritoryPercent: 0,
  successfulTerritoryPercent: 0,
  failedTerritoryPercent: 0,
  saturationPercent: 0,
  saturationConfidence: 'low',
  areaKm2: 0,
  attemptedAreaKm2: 0,
  successfulAreaKm2: 0,
  failedAreaKm2: 0,
  subdivisionCount: 0,
  deepestSubdivisionLevel: 0,
  saturatedCells: 0,
  attemptedCells: 0,
  completedCells: 0,
  failedCells: 0,
  totalCells: 0,
  completedSources: 0,
  totalSources: WEB_SEARCH_ENABLED ? 2 : 1,
  validRuns: 0,
  failedRuns: 0,
  lastNewCounts: [],
})
const emptyProcessing = () => ({
  raw: 0,
  identity: 0,
  website: 0,
  contacts: 0,
  legal: 0,
  social: 0,
  validation: 0,
  ready: 0,
  attention: 0,
  failed: 0,
})
const emptyRuntimeTruth = (runId = '') => ({
  runId: clean(runId),
  version: COVERAGE_EXPANSION_VERSION,
  phase: 'queued',
  phaseLabel: 'Na fila',
  phaseStartedAt: now(),
  updatedAt: now(),
  currentSource: '',
  currentRegion: '',
  currentQuery: '',
  sourceStates: { osmExact: 'pending', osmCoverage: 'pending', web: WEB_SEARCH_ENABLED ? 'pending' : 'disabled', enrichment: 'pending' },
  counters: { discovered: 0, accepted: 0, ready: 0, attention: 0, rejectedCategory: 0, rejectedLocation: 0, duplicates: 0, queries: 0 },
  events: [],
})
const runtimePhaseLabels = {
  queued: 'Na fila', planning: 'Planejando território', discovering_osm: 'Descobrindo no mapa aberto', expanding_coverage: 'Ampliando cobertura', discovering_web: 'Descobrindo na web', enriching: 'Enriquecendo dados', finalizing: 'Validando resultados', completed: 'Concluído', paused: 'Pausado', cancelled: 'Cancelado', failed: 'Falhou',
}
function ensureRuntimeTruth(job) {
  if (!job.runtime || typeof job.runtime !== 'object') job.runtime = emptyRuntimeTruth(job.id)
  job.runtime.runId = clean(job.runtime.runId) || clean(job.id)
  job.runtime.version = COVERAGE_EXPANSION_VERSION
  job.runtime.events = Array.isArray(job.runtime.events) ? job.runtime.events.slice(-80) : []
  job.runtime.sourceStates = { ...emptyRuntimeTruth(job.id).sourceStates, ...(job.runtime.sourceStates || {}) }
  job.runtime.counters = { ...emptyRuntimeTruth(job.id).counters, ...(job.runtime.counters || {}) }
  return job.runtime
}
function syncRuntimeCounters(job) {
  const runtime = ensureRuntimeTruth(job)
  runtime.currentSource = clean(job.progress?.currentSource)
  runtime.currentRegion = clean(job.progress?.currentRegion)
  runtime.updatedAt = now()
  runtime.counters = {
    discovered: Number(job.stats?.discovered || 0),
    accepted: Number(job.stats?.unique || 0),
    ready: Number(job.processing?.ready || 0),
    attention: Number(job.processing?.attention || 0),
    rejectedCategory: Number(job.stats?.scopeRejectedCategory || 0),
    rejectedLocation: Number(job.stats?.scopeRejectedLocation || 0),
    duplicates: Number(job.stats?.duplicates || 0),
    queries: Number(job.stats?.queries || 0),
  }
  return runtime
}
function appendRuntimeEvent(job, type, message, meta = {}) {
  const runtime = syncRuntimeCounters(job)
  const normalizedMessage = clean(message)
  const previous = runtime.events[runtime.events.length - 1]
  if (previous?.type === type && previous?.message === normalizedMessage) return runtime
  runtime.events.push({ id: randomUUID(), type, message: normalizedMessage, at: now(), ...meta })
  runtime.events = runtime.events.slice(-80)
  return runtime
}
function setRuntimePhase(job, phase, message = '', sourceKey = '') {
  const runtime = ensureRuntimeTruth(job)
  if (runtime.phase !== phase) {
    runtime.phase = phase
    runtime.phaseLabel = runtimePhaseLabels[phase] || phase
    runtime.phaseStartedAt = now()
    appendRuntimeEvent(job, 'phase', message || runtime.phaseLabel, { phase })
  }
  if (sourceKey && runtime.sourceStates[sourceKey] !== 'running') runtime.sourceStates[sourceKey] = 'running'
  syncRuntimeCounters(job)
  return runtime
}
function finishRuntimeSource(job, sourceKey, ok = true) {
  const runtime = ensureRuntimeTruth(job)
  runtime.sourceStates[sourceKey] = ok ? 'completed' : 'failed'
  syncRuntimeCounters(job)
}
const defaultState = () => ({ schemaVersion: 7, jobs: [], campaigns: [], updatedAt: now() })

function newEnrichmentTask(id) {
  return {
    id, status: 'pending', attempts: 0, maxAttempts: ENRICHMENT_TASK_MAX_ATTEMPTS[id] || 2,
    lastError: null, message: '', lastRunAt: null, completedAt: null,
  }
}

function normalizeEnrichmentTasks(candidate) {
  const existing = candidate?.enrichmentTasks && typeof candidate.enrichmentTasks === 'object' ? candidate.enrichmentTasks : {}
  const tasks = {}
  for (const id of ENRICHMENT_TASK_IDS) {
    const raw = existing[id] || {}
    const base = newEnrichmentTask(id)
    tasks[id] = {
      ...base, ...raw, id,
      status: ['pending','running','retrying','completed','attention','failed','skipped'].includes(raw.status) ? raw.status : base.status,
      attempts: Math.max(0, Number(raw.attempts) || 0),
      maxAttempts: Math.max(1, Number(raw.maxAttempts) || base.maxAttempts),
      lastError: clean(raw.lastError) || null,
      message: clean(raw.message),
    }
  }
  return tasks
}

function normalizeCandidateEnrichment(candidate) {
  if (!candidate || typeof candidate !== 'object') return candidate
  return {
    ...candidate,
    candidateId: clean(candidate.candidateId) || randomUUID(),
    enrichmentTasks: normalizeEnrichmentTasks(candidate),
    enrichmentCache: candidate.enrichmentCache && typeof candidate.enrichmentCache === 'object' ? candidate.enrichmentCache : {},
    reviewRevision: Math.max(0, Number(candidate.reviewRevision) || 0),
    reviewPublishedAt: candidate.reviewPublishedAt || null,
    reviewReason: clean(candidate.reviewReason),
  }
}

function normalizeAgentJob(job) {
  return {
    ...job,
    status: job.status === 'running' ? 'queued' : job.status,
    message: job.status === 'running' ? 'Retomado após reinício do Agent.' : clean(job.message),
    input: {
      segment: clean(job.input?.segment),
      regions: Array.isArray(job.input?.regions) ? job.input.regions.map(clean).filter(Boolean) : [],
      targetQuantity: Math.min(MAX_RESULTS, Math.max(1, Number(job.input?.targetQuantity) || 50)),
      targetMode: job.input?.targetMode === 'max' ? 'max' : 'quantity',
      areaMode: ['radius', 'city', 'neighborhoods', 'map'].includes(job.input?.areaMode) ? job.input.areaMode : 'city',
      radiusKm: Math.min(100, Math.max(1, Number(job.input?.radiusKm) || 15)),
      searchMode: ['coverage', 'fast', 'economy'].includes(job.input?.searchMode) ? job.input.searchMode : 'fast',
      categoryMode: job.input?.categoryMode === 'related' ? 'related' : 'exact',
      mapPolygon: sanitizeMapPolygon(job.input?.mapPolygon),
      searchCenter: Number.isFinite(Number(job.input?.searchCenter?.lat)) && Number.isFinite(Number(job.input?.searchCenter?.lon))
        ? { lat: Number(job.input.searchCenter.lat), lon: Number(job.input.searchCenter.lon) } : null,
    },
    stats: { discovered: 0, unique: 0, duplicates: 0, websitesVisited: 0, queries: 0, withPhone: 0, withEmail: 0, withInstagram: 0, withWebsite: 0, withCnpj: 0, webDocuments: 0, webPlaceCandidates: 0, webRejectedDocuments: 0, scopeRejectedCategory: 0, scopeRejectedLocation: 0, scopeRejectedOther: 0, ...(job.stats || {}) },
    plan: {
      expandedQueries: Array.isArray(job.plan?.expandedQueries) ? job.plan.expandedQueries : [],
      ontology: job.plan?.ontology && typeof job.plan.ontology === 'object' ? job.plan.ontology : buildSearchOntologyPlan(job.input?.segment),
      cells: Array.isArray(job.plan?.cells) ? job.plan.cells.map((cell) => decorateTerritoryCell(cell, job.plan?.geometry || null)) : [],
      providerRuns: Array.isArray(job.plan?.providerRuns) ? job.plan.providerRuns : [],
      geometry: job.plan?.geometry || null,
      plannedAt: job.plan?.plannedAt || null,
    },
    coverage: (() => {
      const coverage = { ...emptyCoverage(), ...(job.coverage || {}) }
      const cells = Array.isArray(job.plan?.cells) ? job.plan.cells.map((cell) => decorateTerritoryCell(cell, job.plan?.geometry || null)) : []
      const metrics = leafTerritoryMetrics(cells)
      if (metrics.leaves.length) {
        const planned = Math.max(0.000001, metrics.planned)
        coverage.totalCells = metrics.leaves.length
        coverage.completedCells = metrics.leaves.filter((item) => item.status === 'completed').length
        coverage.failedCells = metrics.leaves.filter((item) => item.status === 'failed').length
        coverage.attemptedCells = coverage.completedCells + coverage.failedCells
        coverage.attemptedAreaKm2 = Math.round(metrics.attempted * 10) / 10
        coverage.successfulAreaKm2 = Math.round(metrics.completed * 10) / 10
        coverage.failedAreaKm2 = Math.round(metrics.failed * 10) / 10
        coverage.attemptedTerritoryPercent = Math.round(metrics.attempted / planned * 100)
        coverage.successfulTerritoryPercent = Math.round(metrics.completed / planned * 100)
        coverage.failedTerritoryPercent = Math.round(metrics.failed / planned * 100)
        coverage.territoryPercent = coverage.successfulTerritoryPercent
        coverage.subdivisionCount = cells.filter((item) => item.status === 'subdivided').length
        coverage.deepestSubdivisionLevel = Math.max(0, ...cells.map((item) => Number(item.level) || 0))
        coverage.saturatedCells = metrics.leaves.filter((item) => item.providerSaturated).length
      }
      return coverage
    })(),
    processing: { ...emptyProcessing(), ...(job.processing || {}) },
    rejections: Array.isArray(job.rejections) ? job.rejections.slice(-120) : [],
    reviewStream: {
      revision: Math.max(0, Number(job.reviewStream?.revision) || 0),
      acknowledgedRevision: Math.max(0, Number(job.reviewStream?.acknowledgedRevision) || 0),
      readyCandidates: Math.max(0, Number(job.reviewStream?.readyCandidates) || 0),
      lastPublishedAt: job.reviewStream?.lastPublishedAt || null,
      lastAcknowledgedAt: job.reviewStream?.lastAcknowledgedAt || null,
    },
    runtime: (() => {
      const runtime = { ...emptyRuntimeTruth(job.id), ...(job.runtime || {}) }
      runtime.runId = clean(runtime.runId) || clean(job.id)
      runtime.version = COVERAGE_EXPANSION_VERSION
      runtime.events = Array.isArray(runtime.events) ? runtime.events.slice(-80) : []
      runtime.sourceStates = { ...emptyRuntimeTruth(job.id).sourceStates, ...(runtime.sourceStates || {}) }
      runtime.counters = { ...emptyRuntimeTruth(job.id).counters, ...(runtime.counters || {}) }
      return runtime
    })(),
    results: Array.isArray(job.results) ? job.results.map(normalizeCandidateEnrichment) : [],
  }
}

let state = defaultState()
let processing = false
let persistPending = Promise.resolve()

async function loadState() {
  await fs.mkdir(STATE_DIR, { recursive: true })
  try {
    const parsed = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'))
    state = {
      schemaVersion: 7,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs.map(normalizeAgentJob) : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      updatedAt: now(),
    }
  } catch {
    state = defaultState()
    await saveState()
  }
}

function saveState() {
  state.updatedAt = now()
  persistPending = persistPending.then(async () => {
    const tmp = `${STATE_FILE}.tmp`
    await fs.mkdir(STATE_DIR, { recursive: true })
    await fs.writeFile(tmp, JSON.stringify(state, null, 2))
    await fs.rename(tmp, STATE_FILE)
  }).catch((error) => console.error('[prospecting-agent] persist:', error.message))
  return persistPending
}

function browserBinary() {
  for (const candidate of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' })
    if (result.status === 0 && clean(result.stdout)) return clean(result.stdout)
  }
  return null
}
const CHROMIUM = browserBinary()

function safePublicUrl(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    const local = host === 'localhost' || host.endsWith('.local') || host === '::1' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.')
    const match172 = host.match(/^172\.(\d+)\./)
    const private172 = Boolean(match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31)
    if ((local || private172) && !TEST_MODE) return null
    return url
  } catch { return null }
}

function readableFetchError(error, url) {
  const host = (() => { try { return new URL(url).hostname } catch { return 'fonte externa' } })()
  const cause = error && typeof error === 'object' ? error.cause : null
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
  const raw = error instanceof Error ? error.message : String(error)
  if (code === 'EAI_AGAIN' || code === 'ENOTFOUND') return `${host}: falha de DNS (${code})`
  if (code === 'ECONNREFUSED') return `${host}: conexão recusada`
  if (code === 'ETIMEDOUT' || raw.includes('aborted') || raw.includes('AbortError')) return `${host}: tempo limite excedido`
  return `${host}: ${code || raw || 'falha de rede'}`
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const safe = safePublicUrl(url)
  if (!safe) throw new Error('URL pública inválida ou bloqueada.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(safe, {
      ...options,
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: '*/*', ...(options.headers || {}) },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return response
      return await fetchWithTimeout(new URL(location, safe).toString(), options, timeoutMs)
    }
    return response
  } catch (error) {
    throw new Error(readableFetchError(error, safe.toString()))
  } finally { clearTimeout(timer) }
}

async function withRetries(label, task, attempts = PROVIDER_RETRIES) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await task(attempt) }
    catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(450 * attempt)
    }
  }
  throw lastError || new Error(`${label}: indisponível.`)
}

function markProvider(name, ok, error = null) {
  const slot = providerRuntime[name]
  if (!slot) return
  slot.state = ok ? 'ok' : 'error'
  slot.lastSuccessAt = ok ? now() : slot.lastSuccessAt
  slot.lastError = ok ? null : clean(error instanceof Error ? error.message : error)
}

async function readLimitedText(response, maxBytes = 850_000) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let output = ''
  let bytes = 0
  while (bytes < maxBytes) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    output += decoder.decode(value, { stream: true })
    if (bytes >= maxBytes) break
  }
  try { await reader.cancel() } catch {}
  return output
}

function stripHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
}

function socialLink(html, network) {
  const rx = new RegExp(`https?:\\/\\/(?:www\\.)?${network}\\.com\\/[^"'<>\\s]+`, 'i')
  return clean((html.match(rx) || [])[0] || '')
}

function contactLinks(html, baseUrl) {
  const links = []
  const rx = /href=["']([^"']+)["']/gi
  let match
  while ((match = rx.exec(html))) {
    const raw = match[1]
    if (!/(contato|contact|fale|sobre|about|empresa)/i.test(raw)) continue
    try {
      const url = new URL(raw, baseUrl)
      if (safePublicUrl(url.toString()) && url.hostname === new URL(baseUrl).hostname) links.push(url.toString())
    } catch {}
    if (links.length >= 3) break
  }
  return [...new Set(links)]
}

function extractContacts(html, baseUrl) {
  const text = stripHtml(html)
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || ''
  const phoneCandidates = text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-.\s]?\d{4}/g) || []
  const phone = phoneCandidates.map(clean).find((value) => digits(value).length >= 10) || ''
  const cnpjMatch = text.match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/)
  const cnpj = cnpjMatch ? digits(cnpjMatch[0]).slice(0, 14) : ''
  return {
    email,
    phone,
    cnpj,
    instagram: socialLink(html, 'instagram'),
    facebook: socialLink(html, 'facebook'),
    linkedin: socialLink(html, 'linkedin'),
    contactLinks: contactLinks(html, baseUrl),
    textLength: text.length,
    textSample: text.slice(0, 12000),
  }
}

async function robotsAllows(url) {
  try {
    const parsed = new URL(url)
    const response = await fetchWithTimeout(`${parsed.origin}/robots.txt`, { headers: { accept: 'text/plain' } }, 7000)
    if (!response.ok) return true
    const robots = await readLimitedText(response, 100_000)
    const pathName = parsed.pathname || '/'
    let applies = false
    for (const line of robots.split(/\r?\n/)) {
      const trimmed = line.split('#')[0].trim()
      if (!trimmed) continue
      const [keyRaw, ...rest] = trimmed.split(':')
      const key = keyRaw.trim().toLowerCase()
      const value = rest.join(':').trim()
      if (key === 'user-agent') applies = value === '*' || /realtalent/i.test(value)
      if (applies && key === 'disallow' && value && pathName.startsWith(value)) return false
    }
    return true
  } catch { return true }
}

function chromiumDump(url, timeoutMs = 15000) {
  if (!CHROMIUM || !safePublicUrl(url)) return Promise.resolve('')
  return new Promise((resolve) => {
    const child = spawn(CHROMIUM, ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--dump-dom', url], { stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, timeoutMs)
    child.stdout.on('data', (chunk) => { if (output.length < 900_000) output += chunk.toString('utf8') })
    child.on('error', () => { clearTimeout(timer); resolve('') })
    child.on('close', () => { clearTimeout(timer); resolve(output) })
  })
}

async function crawlWebsite(url, allowBrowser = true) {
  const safe = safePublicUrl(url)
  if (!safe) return { warnings: ['Website ignorado por segurança.'] }
  if (!(await robotsAllows(safe.toString()))) return { warnings: ['robots.txt bloqueou a coleta desta página.'] }
  let html = ''
  try {
    const response = await fetchWithTimeout(safe.toString(), { headers: { accept: 'text/html,application/xhtml+xml' } })
    const type = response.headers.get('content-type') || ''
    if (response.ok && type.includes('text/html')) html = await readLimitedText(response)
  } catch {}
  let extracted = extractContacts(html, safe.toString())
  if (allowBrowser && CHROMIUM && extracted.textLength < 250) {
    const browserHtml = await chromiumDump(safe.toString())
    if (browserHtml) { html = browserHtml; extracted = extractContacts(browserHtml, safe.toString()) }
  }
  for (const link of extracted.contactLinks.slice(0, 2)) {
    if (!(await robotsAllows(link))) continue
    try {
      const response = await fetchWithTimeout(link, { headers: { accept: 'text/html,application/xhtml+xml' } })
      if (!response.ok) continue
      const page = await readLimitedText(response, 450_000)
      const extra = extractContacts(page, link)
      extracted = {
        ...extracted,
        email: extracted.email || extra.email,
        phone: extracted.phone || extra.phone,
        cnpj: extracted.cnpj || extra.cnpj,
        instagram: extracted.instagram || extra.instagram,
        facebook: extracted.facebook || extra.facebook,
        linkedin: extracted.linkedin || extra.linkedin,
      }
      await sleep(180)
    } catch {}
  }
  return { ...extracted, warnings: [] }
}

async function enrichCnpj(cnpj) {
  const value = digits(cnpj).slice(0, 14)
  if (value.length !== 14) return null
  try {
    const response = await fetchWithTimeout(`${CNPJ_API.replace(/\/$/, '')}/${value}`, { headers: { accept: 'application/json' } }, 12000)
    if (!response.ok) return null
    return await response.json()
  } catch { return null }
}

const SEARCH_ONTOLOGY_VERSION = '1.0.0'
const STRICT_SCOPE_VERSION = '2.0.0'
const searchOntology = [
  {
    id: 'barber', label: 'Barbearias', intent: 'local_service',
    aliases: ['barbearia','barbearias','barber','barber shop','barbershop','cabeleireiro masculino','salão masculino','salao masculino','corte masculino'],
    strictTerms: ['barbearia','barber','barber shop','barbershop','cabeleireiro masculino','salão masculino','salao masculino'],
    rejectTerms: ['salão de beleza','salao de beleza','beauty salon','estética','estetica','spa','manicure','pedicure'],
    webTerms: ['barbearia','barber shop','barbershop','cabeleireiro masculino','salão masculino','corte masculino'],
    exactOsmFilters: [{ shop: 'hairdresser', hairdresser: 'barber' }],
    osmFilters: [{ shop: 'hairdresser', hairdresser: 'barber' }, { shop: 'hairdresser' }],
    osmNameTerms: ['barbearia','barber','barbershop'],
    cnaes: [{ code: '9602-5/01', label: 'Cabeleireiros, manicure e pedicure' }],
    providerCategories: ['barbearia','barber shop','hairdresser'],
  },
  {
    id: 'beauty_salon', label: 'Salões e estética', intent: 'local_service',
    aliases: ['salão de beleza','salao de beleza','cabeleireiro','cabeleireiros','estética','estetica','centro de estética','centro de estetica'],
    strictTerms: ['salão de beleza','salao de beleza','beauty salon','cabeleireiro','estética','estetica','centro de estética','centro de estetica'],
    rejectTerms: ['barbearia','barber','barbershop'],
    webTerms: ['salão de beleza','cabeleireiro','clínica de estética','centro de estética'],
    osmFilters: [{ shop: 'hairdresser' }, { shop: 'beauty' }], osmNameTerms: ['salão de beleza','cabeleireiro','estética'],
    cnaes: [{ code: '9602-5/01', label: 'Cabeleireiros, manicure e pedicure' }, { code: '9602-5/02', label: 'Atividades de estética e outros serviços de cuidados com a beleza' }],
    providerCategories: ['salão de beleza','beauty salon','estética'],
  },
  {
    id: 'restaurant', label: 'Restaurantes', intent: 'food_service',
    aliases: ['restaurante','restaurantes','restaurant','bistrô','bistro','gastronomia'],
    webTerms: ['restaurante','restaurant','bistrô','comida','gastronomia'],
    osmFilters: [{ amenity: 'restaurant' }], osmNameTerms: ['restaurante','restaurant','bistrô'],
    cnaes: [{ code: '5611-2/01', label: 'Restaurantes e similares' }], providerCategories: ['restaurante','restaurant'],
  },
  {
    id: 'fast_food', label: 'Lanchonetes e hamburguerias', intent: 'food_service',
    aliases: ['lanchonete','lanchonetes','fast food','hamburgueria','hamburguerias','burger'],
    webTerms: ['hamburgueria','lanchonete','fast food','burger'],
    osmFilters: [{ amenity: 'fast_food' }], osmNameTerms: ['hamburgueria','lanchonete','burger'],
    cnaes: [{ code: '5611-2/03', label: 'Lanchonetes, casas de chá, de sucos e similares' }], providerCategories: ['hamburgueria','fast food','lanchonete'],
  },
  {
    id: 'cafe', label: 'Cafeterias', intent: 'food_service',
    aliases: ['café','cafe','cafeteria','cafeterias','coffee','coffee shop'], webTerms: ['café','cafeteria','coffee shop'],
    osmFilters: [{ amenity: 'cafe' }], osmNameTerms: ['cafeteria','café','coffee'],
    cnaes: [{ code: '5611-2/03', label: 'Lanchonetes, casas de chá, de sucos e similares' }], providerCategories: ['cafeteria','coffee shop'],
  },
  {
    id: 'pharmacy', label: 'Farmácias e drogarias', intent: 'retail',
    aliases: ['farmácia','farmacia','farmácias','farmacias','drogaria','drogarias'], webTerms: ['farmácia','drogaria'],
    osmFilters: [{ amenity: 'pharmacy' }], osmNameTerms: ['farmácia','drogaria'],
    cnaes: [{ code: '4771-7/01', label: 'Comércio varejista de produtos farmacêuticos, sem manipulação de fórmulas' }], providerCategories: ['farmácia','pharmacy','drogaria'],
  },
  {
    id: 'dentist', label: 'Clínicas odontológicas', intent: 'health_service',
    aliases: ['dentista','dentistas','odontologia','odontológico','odontologico','clínica odontológica','clinica odontologica'], webTerms: ['dentista','odontologia','clínica odontológica'],
    osmFilters: [{ amenity: 'dentist' }], osmNameTerms: ['odontologia','dentista','odontológica'],
    cnaes: [{ code: '8630-5/04', label: 'Atividade odontológica' }], providerCategories: ['dentista','odontologia','dental clinic'],
  },
  {
    id: 'fitness', label: 'Academias e centros de treinamento', intent: 'local_service',
    aliases: ['academia','academias','fitness','crossfit','centro de treinamento','box de crossfit'], webTerms: ['academia','fitness','crossfit','centro de treinamento'],
    osmFilters: [{ leisure: 'fitness_centre' }, { leisure: 'sports_centre' }], osmNameTerms: ['academia','fitness','crossfit'],
    cnaes: [{ code: '9313-1/00', label: 'Atividades de condicionamento físico' }], providerCategories: ['academia','fitness center','crossfit'],
  },
  {
    id: 'pet', label: 'Pet shops e veterinárias', intent: 'local_service',
    aliases: ['pet shop','petshop','pet shops','veterinária','veterinaria','clínica veterinária','clinica veterinaria'], webTerms: ['pet shop','veterinária','clínica veterinária'],
    osmFilters: [{ shop: 'pet' }, { amenity: 'veterinary' }], osmNameTerms: ['pet shop','veterinária','veterinaria'],
    cnaes: [{ code: '7500-1/00', label: 'Atividades veterinárias' }, { code: '4789-0/04', label: 'Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação' }], providerCategories: ['pet shop','veterinary'],
  },
  {
    id: 'supermarket', label: 'Supermercados e mercados', intent: 'retail',
    aliases: ['supermercado','supermercados','mercado','mercados','minimercado','mercearia'], webTerms: ['supermercado','mercado','minimercado','mercearia'],
    osmFilters: [{ shop: 'supermarket' }, { shop: 'convenience' }], osmNameTerms: ['supermercado','mercado'],
    cnaes: [{ code: '4711-3/02', label: 'Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados' }], providerCategories: ['supermercado','grocery store'],
  },
  {
    id: 'hotel', label: 'Hotéis e pousadas', intent: 'hospitality',
    aliases: ['hotel','hotéis','hoteis','pousada','pousadas','hospedagem'], webTerms: ['hotel','pousada','hospedagem'],
    osmFilters: [{ tourism: 'hotel' }, { tourism: 'guest_house' }], osmNameTerms: ['hotel','pousada'],
    cnaes: [{ code: '5510-8/01', label: 'Hotéis' }], providerCategories: ['hotel','pousada','lodging'],
  },
  {
    id: 'car_repair', label: 'Oficinas mecânicas', intent: 'local_service',
    aliases: ['oficina','oficina mecânica','oficina mecanica','mecânica automotiva','mecanica automotiva','auto center'], webTerms: ['oficina mecânica','mecânica automotiva','auto center'],
    osmFilters: [{ shop: 'car_repair' }], osmNameTerms: ['oficina','mecânica','auto center'],
    cnaes: [{ code: '4520-0/01', label: 'Serviços de manutenção e reparação mecânica de veículos automotores' }], providerCategories: ['oficina mecânica','car repair'],
  },
  {
    id: 'bakery', label: 'Padarias', intent: 'food_retail', aliases: ['padaria','padarias','bakery','panificadora','panificadoras'],
    webTerms: ['padaria','panificadora','bakery'], osmFilters: [{ shop: 'bakery' }], osmNameTerms: ['padaria','panificadora'],
    cnaes: [{ code: '4721-1/02', label: 'Padaria e confeitaria com predominância de revenda' }], providerCategories: ['padaria','bakery'],
  },
  {
    id: 'real_estate', label: 'Imobiliárias', intent: 'professional_service',
    aliases: ['imobiliária','imobiliaria','imobiliárias','imobiliarias','corretora de imóveis','corretora de imoveis','real estate'], webTerms: ['imobiliária','corretora de imóveis','real estate'],
    osmFilters: [{ office: 'estate_agent' }], osmNameTerms: ['imobiliária','imobiliaria','imóveis'],
    cnaes: [{ code: '6821-8/01', label: 'Corretagem na compra e venda e avaliação de imóveis' }], providerCategories: ['imobiliária','real estate agency'],
  },
  {
    id: 'accounting', label: 'Escritórios de contabilidade', intent: 'professional_service',
    aliases: ['contabilidade','contador','contadores','escritório contábil','escritorio contabil','empresa contábil','empresa contabil'], webTerms: ['contabilidade','contador','escritório contábil'],
    osmFilters: [{ office: 'accountant' }], osmNameTerms: ['contabilidade','contábil','contador'],
    cnaes: [{ code: '6920-6/01', label: 'Atividades de contabilidade' }], providerCategories: ['contabilidade','accountant'],
  },
  {
    id: 'law', label: 'Escritórios de advocacia', intent: 'professional_service',
    aliases: ['advocacia','advogado','advogados','escritório de advocacia','escritorio de advocacia','law firm'], webTerms: ['advocacia','advogado','escritório de advocacia'],
    osmFilters: [{ office: 'lawyer' }], osmNameTerms: ['advocacia','advogado'],
    cnaes: [{ code: '6911-7/01', label: 'Serviços advocatícios' }], providerCategories: ['advocacia','law firm','lawyer'],
  },
  {
    id: 'hvac', label: 'Climatização e refrigeração', intent: 'technical_service',
    aliases: ['climatização','climatizacao','empresa de climatização','empresa de climatizacao','ar condicionado','ar-condicionado','instalação de ar condicionado','instalacao de ar condicionado','manutenção de ar condicionado','manutencao de ar condicionado','hvac','refrigeração','refrigeracao','refrigeração comercial','refrigeracao comercial'],
    webTerms: ['empresa de climatização','instalação de ar condicionado','manutenção de ar condicionado','HVAC','refrigeração comercial','climatização empresarial'],
    osmFilters: [{ craft: 'hvac' }], osmNameTerms: ['climatização','ar condicionado','refrigeração','HVAC'],
    cnaes: [{ code: '4322-3/02', label: 'Instalação e manutenção de sistemas centrais de ar condicionado, de ventilação e refrigeração' }],
    providerCategories: ['climatização','HVAC contractor','air conditioning contractor','refrigeração'],
  },
  {
    id: 'solar', label: 'Energia solar', intent: 'technical_service',
    aliases: ['energia solar','painel solar','painéis solares','paineis solares','fotovoltaica','fotovoltaico','empresa de energia solar'], webTerms: ['energia solar','instalação fotovoltaica','painel solar','empresa de energia solar'],
    osmFilters: [], osmNameTerms: ['solar','fotovoltaica','fotovoltaico'],
    cnaes: [{ code: '4321-5/00', label: 'Instalação e manutenção elétrica' }], providerCategories: ['energia solar','solar energy contractor'],
  },
  {
    id: 'cleaning', label: 'Empresas de limpeza', intent: 'business_service',
    aliases: ['empresa de limpeza','empresas de limpeza','limpeza profissional','limpeza empresarial','serviços de limpeza','servicos de limpeza'], webTerms: ['empresa de limpeza','limpeza empresarial','limpeza profissional','serviços de limpeza'],
    osmFilters: [], osmNameTerms: ['limpeza','clean'],
    cnaes: [{ code: '8121-4/00', label: 'Limpeza em prédios e em domicílios' }], providerCategories: ['empresa de limpeza','cleaning service'],
  },
  {
    id: 'security_systems', label: 'Segurança eletrônica', intent: 'technical_service',
    aliases: ['segurança eletrônica','seguranca eletronica','alarme','cftv','monitoramento eletrônico','monitoramento eletronico'], webTerms: ['segurança eletrônica','CFTV','monitoramento eletrônico','empresa de alarmes'],
    osmFilters: [{ shop: 'security' }], osmNameTerms: ['segurança eletrônica','CFTV','alarme'],
    cnaes: [{ code: '8020-0/01', label: 'Atividades de monitoramento de sistemas de segurança eletrônico' }], providerCategories: ['segurança eletrônica','security system supplier'],
  },
]

function ontologyMatchScore(input, alias) {
  const q = normalize(input); const a = normalize(alias)
  if (!q || !a) return 0
  if (q === a) return 100
  if (q.includes(a)) return Math.min(96, 82 + Math.min(14, a.length / Math.max(1, q.length) * 14))
  if (a.includes(q) && q.length >= 5) return 78
  const qt = new Set(q.split(/[^a-z0-9]+/).filter((token) => token.length > 2))
  const at = new Set(a.split(/[^a-z0-9]+/).filter((token) => token.length > 2))
  if (!qt.size || !at.size) return 0
  const common = [...qt].filter((token) => at.has(token)).length
  const coverage = common / Math.max(1, Math.min(qt.size, at.size))
  return coverage >= 1 ? 72 : coverage >= .67 ? 62 : 0
}

function resolveSearchIntent(segment) {
  const original = clean(segment)
  let best = null
  for (const entry of searchOntology) {
    for (const alias of [entry.label, ...entry.aliases]) {
      const score = ontologyMatchScore(original, alias)
      if (!best || score > best.score || (score === best.score && alias.length > best.alias.length)) best = { entry, score, alias }
    }
  }
  if (!best || best.score < 60) {
    return {
      id: 'generic', label: original || 'Segmento genérico', intent: 'generic', confidence: 40, matchedBy: original,
      aliases: [original].filter(Boolean), webTerms: [original].filter(Boolean), osmFilters: [], osmNameTerms: [original].filter(Boolean),
      cnaes: [], providerCategories: [original].filter(Boolean), ontologyVersion: SEARCH_ONTOLOGY_VERSION,
    }
  }
  return {
    ...best.entry,
    confidence: Math.round(best.score), matchedBy: best.alias, ontologyVersion: SEARCH_ONTOLOGY_VERSION,
  }
}

function uniqueTerms(values, limit = 12) {
  const seen = new Set(); const output = []
  for (const raw of values) {
    const term = clean(raw); const key = normalize(term)
    if (!key || seen.has(key)) continue
    seen.add(key); output.push(term)
    if (output.length >= limit) break
  }
  return output
}

function buildSearchOntologyPlan(segment) {
  const intent = resolveSearchIntent(segment)
  return {
    version: intent.ontologyVersion,
    intentId: intent.id,
    label: intent.label,
    intent: intent.intent,
    confidence: intent.confidence,
    matchedBy: intent.matchedBy,
    aliases: uniqueTerms(intent.aliases || [], 12),
    webTerms: uniqueTerms([clean(segment), ...(intent.webTerms || [])], 12),
    osmFilters: (intent.osmFilters || []).map((filter) => ({ ...filter })),
    osmNameTerms: uniqueTerms(intent.osmNameTerms || [], 6),
    cnaes: (intent.cnaes || []).map((item) => ({ ...item })),
    providerCategories: uniqueTerms(intent.providerCategories || [], 10),
    strictTerms: uniqueTerms(intent.strictTerms?.length ? intent.strictTerms : [...(intent.osmNameTerms || []), ...(intent.providerCategories || [])], 16),
    rejectTerms: uniqueTerms(intent.rejectTerms || [], 12),
    exactOsmFilters: (intent.exactOsmFilters || intent.osmFilters || []).map((filter) => ({ ...filter })),
    scopeVersion: STRICT_SCOPE_VERSION,
  }
}

function tagsForSegment(segment) {
  return resolveSearchIntent(segment).osmFilters || []
}

function expandSearchTerms(segment) {
  return buildSearchOntologyPlan(segment).webTerms
}

function sanitizeMapPolygon(value) {
  if (!Array.isArray(value)) return []
  const points = []
  for (const raw of value.slice(0, 120)) {
    const lat = Number(raw?.lat)
    const lon = Number(raw?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
    const point = { lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7 }
    if (!points.length || Math.abs(points.at(-1).lat - point.lat) > 1e-8 || Math.abs(points.at(-1).lon - point.lon) > 1e-8) points.push(point)
  }
  if (points.length > 2 && Math.abs(points[0].lat - points.at(-1).lat) < 1e-8 && Math.abs(points[0].lon - points.at(-1).lon) < 1e-8) points.pop()
  return points
}

function polygonBBox(polygon) {
  const points = sanitizeMapPolygon(polygon)
  if (points.length < 3) return null
  return {
    south: Math.min(...points.map((point) => point.lat)),
    north: Math.max(...points.map((point) => point.lat)),
    west: Math.min(...points.map((point) => point.lon)),
    east: Math.max(...points.map((point) => point.lon)),
  }
}

function pointInPolygon(point, polygon) {
  const points = sanitizeMapPolygon(polygon)
  if (points.length < 3 || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return false
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].lon; const yi = points[i].lat
    const xj = points[j].lon; const yj = points[j].lat
    const intersects = ((yi > point.lat) !== (yj > point.lat)) && (point.lon < (xj - xi) * (point.lat - yi) / ((yj - yi) || Number.EPSILON) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function pointInBBox(point, bbox) {
  return point.lat >= bbox.south && point.lat <= bbox.north && point.lon >= bbox.west && point.lon <= bbox.east
}

function orientation(a, b, c) {
  const value = (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon)
  if (Math.abs(value) < 1e-12) return 0
  return value > 0 ? 1 : -1
}

function onSegment(a, b, c) {
  return Math.min(a.lat, c.lat) - 1e-12 <= b.lat && b.lat <= Math.max(a.lat, c.lat) + 1e-12 && Math.min(a.lon, c.lon) - 1e-12 <= b.lon && b.lon <= Math.max(a.lon, c.lon) + 1e-12
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c); const o2 = orientation(a, b, d); const o3 = orientation(c, d, a); const o4 = orientation(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(a, c, b)) return true
  if (o2 === 0 && onSegment(a, d, b)) return true
  if (o3 === 0 && onSegment(c, a, d)) return true
  if (o4 === 0 && onSegment(c, b, d)) return true
  return false
}

function bboxIntersectsPolygon(bbox, polygon) {
  const points = sanitizeMapPolygon(polygon)
  if (points.length < 3) return true
  const center = { lat: (bbox.south + bbox.north) / 2, lon: (bbox.west + bbox.east) / 2 }
  const corners = [
    { lat: bbox.south, lon: bbox.west }, { lat: bbox.south, lon: bbox.east },
    { lat: bbox.north, lon: bbox.east }, { lat: bbox.north, lon: bbox.west },
  ]
  if (pointInPolygon(center, points) || corners.some((point) => pointInPolygon(point, points)) || points.some((point) => pointInBBox(point, bbox))) return true
  const edges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]])
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length]
    if (edges.some(([c, d]) => segmentsIntersect(a, b, c, d))) return true
  }
  return false
}

function polygonAreaKm2(polygon) {
  const points = sanitizeMapPolygon(polygon)
  if (points.length < 3) return 0
  const R = 6371.0088
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length]
    const lonDelta = (b.lon - a.lon) * Math.PI / 180
    const latA = a.lat * Math.PI / 180; const latB = b.lat * Math.PI / 180
    sum += lonDelta * (2 + Math.sin(latA) + Math.sin(latB))
  }
  return Math.abs(sum) * R * R / 2
}

function bboxAreaKm2(bbox) {
  const latMid = (bbox.south + bbox.north) / 2
  const heightKm = Math.abs(bbox.north - bbox.south) * 111.32
  const widthKm = Math.abs(bbox.east - bbox.west) * 111.32 * Math.max(0.15, Math.cos(latMid * Math.PI / 180))
  return Math.max(0, heightKm * widthKm)
}

function radiusBBox(lat, lon, radiusKm) {
  const latDelta = radiusKm / 111.32
  const lonDelta = radiusKm / (111.32 * Math.max(0.15, Math.cos(lat * Math.PI / 180)))
  return { south: lat - latDelta, north: lat + latDelta, west: lon - lonDelta, east: lon + lonDelta }
}

function circlePolygon(lat, lon, radiusKm, steps = 48) {
  const safeSteps = Math.max(24, Math.min(96, Math.round(steps)))
  const latDelta = radiusKm / 111.32
  const lonScale = 111.32 * Math.max(0.15, Math.cos(lat * Math.PI / 180))
  const points = []
  for (let index = 0; index < safeSteps; index += 1) {
    const angle = index / safeSteps * Math.PI * 2
    points.push({
      lat: lat + Math.sin(angle) * latDelta,
      lon: lon + Math.cos(angle) * (radiusKm / lonScale),
    })
  }
  return sanitizeMapPolygon(points)
}

function bboxPolygonCoverageRatio(bbox, polygon, samples = 7) {
  const points = sanitizeMapPolygon(polygon)
  if (points.length < 3) return 1
  if (!bboxIntersectsPolygon(bbox, points)) return 0
  const corners = [
    { lat: bbox.south, lon: bbox.west }, { lat: bbox.south, lon: bbox.east },
    { lat: bbox.north, lon: bbox.east }, { lat: bbox.north, lon: bbox.west },
  ]
  if (corners.every((point) => pointInPolygon(point, points))) return 1
  let inside = 0
  let total = 0
  for (let row = 0; row < samples; row += 1) {
    for (let col = 0; col < samples; col += 1) {
      const lat = bbox.south + ((row + 0.5) / samples) * (bbox.north - bbox.south)
      const lon = bbox.west + ((col + 0.5) / samples) * (bbox.east - bbox.west)
      total += 1
      if (pointInPolygon({ lat, lon }, points)) inside += 1
    }
  }
  if (!inside) return 1 / Math.max(1, total)
  return Math.max(1 / total, Math.min(1, inside / total))
}

function decorateTerritoryCell(cell, geometry = null) {
  const areaKm2 = cell?.bbox ? bboxAreaKm2(cell.bbox) : 0
  const polygon = geometry?.polygon || []
  const coverageRatio = cell?.bbox && polygon.length >= 3 ? bboxPolygonCoverageRatio(cell.bbox, polygon) : 1
  return {
    ...cell,
    areaKm2: Math.round(areaKm2 * 1000) / 1000,
    searchAreaKm2: Math.round(areaKm2 * coverageRatio * 1000) / 1000,
    coverageRatio: Math.round(coverageRatio * 1000) / 1000,
    subdivisionReason: clean(cell?.subdivisionReason),
    providerSaturated: Boolean(cell?.providerSaturated),
  }
}

function leafTerritoryMetrics(cells = []) {
  const leaves = cells.filter((item) => item.status !== 'subdivided')
  const weighted = leaves.some((item) => Number(item.searchAreaKm2) > 0)
  const weight = (item) => weighted ? Math.max(0, Number(item.searchAreaKm2) || 0) : 1
  const planned = leaves.reduce((sum, item) => sum + weight(item), 0)
  const completed = leaves.filter((item) => item.status === 'completed').reduce((sum, item) => sum + weight(item), 0)
  const failed = leaves.filter((item) => item.status === 'failed').reduce((sum, item) => sum + weight(item), 0)
  const attempted = completed + failed
  return { leaves, weighted, planned, completed, failed, attempted }
}

function splitBBox(bbox, rows, cols, parentId = null, level = 0, prefix = 'cell') {
  const cells = []
  const latStep = (bbox.north - bbox.south) / rows
  const lonStep = (bbox.east - bbox.west) / cols
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const south = bbox.south + row * latStep
      const north = row === rows - 1 ? bbox.north : south + latStep
      const west = bbox.west + col * lonStep
      const east = col === cols - 1 ? bbox.east : west + lonStep
      cells.push({
        id: `${prefix}-${row + 1}-${col + 1}-${randomUUID().slice(0, 6)}`,
        parentId,
        level,
        status: 'pending',
        bbox: { south, north, west, east },
        resultsFound: 0,
        uniqueResultsFound: 0,
        queries: 0,
        density: 0,
      })
    }
  }
  return cells
}

function planGrid(bbox, searchMode, radiusKm = 15) {
  if (searchMode === 'fast') return splitBBox(bbox, 1, 1)
  if (searchMode === 'economy') return splitBBox(bbox, 2, 2)
  const area = bboxAreaKm2(bbox)
  const desiredCellArea = radiusKm <= 5 ? 16 : radiusKm <= 15 ? 35 : 55
  const count = Math.min(MAX_SEARCH_CELLS, Math.max(4, Math.ceil(area / desiredCellArea)))
  const side = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(count))))
  return splitBBox(bbox, side, side)
}

function saturationScore(lastNewCounts, successfulTerritoryPercent, validRuns = 0, failedRuns = 0, complete = false) {
  const recent = lastNewCounts.slice(-SATURATION_WINDOW)
  if (!recent.length || validRuns <= 0) return { percent: Math.round(successfulTerritoryPercent * 0.35), confidence: 'low' }
  const average = recent.reduce((sum, value) => sum + value, 0) / recent.length
  const marginal = average <= 0.25 ? 100 : average <= 0.75 ? 96 : average <= 1.5 ? 90 : average <= 3 ? 80 : average <= 6 ? 68 : 52
  const validity = Math.round(validRuns / Math.max(1, validRuns + failedRuns) * 100)
  const score = Math.round(successfulTerritoryPercent * 0.5 + marginal * 0.3 + validity * 0.2)
  const enoughRuns = validRuns >= Math.min(3, SATURATION_WINDOW)
  const confidence = failedRuns === 0 && enoughRuns && successfulTerritoryPercent >= 90 ? 'high' : validity >= 75 && enoughRuns ? 'medium' : 'low'
  const cap = complete && failedRuns === 0 ? 99 : failedRuns > 0 ? 89 : 97
  return { percent: Math.min(cap, Math.max(0, score)), confidence }
}

function refreshCoverage(job) {
  const metrics = leafTerritoryMetrics(job.plan?.cells || [])
  const leafCells = metrics.leaves
  const total = Math.max(1, leafCells.length)
  const completed = leafCells.filter((item) => item.status === 'completed').length
  const failed = leafCells.filter((item) => item.status === 'failed').length
  const attempted = completed + failed
  const plannedArea = metrics.planned
  const percent = (value) => plannedArea > 0 ? Math.round(value / plannedArea * 100) : Math.round(value / total * 100)
  job.coverage.totalCells = leafCells.length
  job.coverage.completedCells = completed
  job.coverage.failedCells = failed
  job.coverage.attemptedCells = attempted
  job.coverage.attemptedAreaKm2 = Math.round(metrics.attempted * 10) / 10
  job.coverage.successfulAreaKm2 = Math.round(metrics.completed * 10) / 10
  job.coverage.failedAreaKm2 = Math.round(metrics.failed * 10) / 10
  job.coverage.attemptedTerritoryPercent = percent(metrics.attempted)
  job.coverage.successfulTerritoryPercent = percent(metrics.completed)
  job.coverage.failedTerritoryPercent = percent(metrics.failed)
  job.coverage.territoryPercent = job.coverage.successfulTerritoryPercent
  job.coverage.subdivisionCount = (job.plan?.cells || []).filter((item) => item.status === 'subdivided').length
  job.coverage.deepestSubdivisionLevel = Math.max(0, ...((job.plan?.cells || []).map((item) => Number(item.level) || 0)))
  job.coverage.saturatedCells = leafCells.filter((item) => item.providerSaturated).length
  const complete = attempted >= total && job.coverage.completedSources >= job.coverage.totalSources
  const saturation = saturationScore(job.coverage.lastNewCounts || [], job.coverage.successfulTerritoryPercent, job.coverage.validRuns || 0, job.coverage.failedRuns || 0, complete)
  job.coverage.saturationPercent = saturation.percent
  job.coverage.saturationConfidence = saturation.confidence
}

function recordCoverageRun(job, newUnique, cell = null, valid = true) {
  if (valid) {
    job.coverage.validRuns = Number(job.coverage.validRuns || 0) + 1
    job.coverage.lastNewCounts = [...(job.coverage.lastNewCounts || []), Math.max(0, newUnique)].slice(-SATURATION_WINDOW)
  } else job.coverage.failedRuns = Number(job.coverage.failedRuns || 0) + 1
  if (cell && cell.status !== 'failed') cell.status = 'completed'
  refreshCoverage(job)
}

async function geocodeRegion(region) {
  const endpoint = new URL(NOMINATIM)
  endpoint.searchParams.set('q', region)
  endpoint.searchParams.set('format', 'jsonv2')
  endpoint.searchParams.set('limit', '1')
  endpoint.searchParams.set('countrycodes', 'br')
  try {
    const result = await withRetries('Nominatim', async () => {
      const response = await fetchWithTimeout(endpoint.toString(), { headers: { accept: 'application/json' } }, 12000)
      if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`)
      const rows = await response.json()
      const first = Array.isArray(rows) ? rows[0] : null
      if (!first?.boundingbox) throw new Error(`Região não encontrada: ${region}`)
      const [south, north, west, east] = first.boundingbox.map(Number)
      return { south, north, west, east, lat: Number(first.lat), lon: Number(first.lon), displayName: first.display_name || region }
    })
    markProvider('nominatim', true)
    return result
  } catch (error) {
    markProvider('nominatim', false, error)
    throw error
  }
}

const overpassEscape = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
function overpassTargetChunks(segment, scope, categoryMode = 'exact') {
  const intent = resolveSearchIntent(segment)
  const chunks = []
  const filters = categoryMode === 'related' ? (intent.osmFilters || []) : (intent.exactOsmFilters || intent.osmFilters || [])
  for (const filter of filters) {
    const selector = Object.entries(filter).map(([key, value]) => `["${overpassEscape(key)}"="${overpassEscape(value)}"]`).join('')
    for (const type of ['node', 'way', 'relation']) chunks.push(`${type}${selector}${scope};`)
  }
  const nameTerms = uniqueTerms(intent.osmNameTerms?.length ? intent.osmNameTerms : [segment], 5)
  for (const term of nameTerms) {
    const needle = overpassEscape(term)
    for (const type of ['node', 'way', 'relation']) chunks.push(`${type}["name"~"${needle}",i]${scope};`)
  }
  return [...new Set(chunks)]
}

function overpassQuery(segment, bbox, categoryMode = 'exact') {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
  return `[out:json][timeout:30];(${overpassTargetChunks(segment, `(${box})`, categoryMode).join('')});out center tags;`
}

function regionLabel(region) {
  return clean(region).split(',')[0].trim()
}

function overpassAreaQuery(segment, region, categoryMode = 'exact') {
  const name = overpassEscape(regionLabel(region))
  const area = `area["boundary"="administrative"]["name"="${name}"]->.searchArea;`
  return `[out:json][timeout:30];${area}(${overpassTargetChunks(segment, '(area.searchArea)', categoryMode).join('')});out center tags;`
}

async function queryOverpassRaw(query) {
  const body = new URLSearchParams({ data: query }).toString()
  let lastError = null
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= PROVIDER_RETRIES; attempt += 1) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body,
        }, 35000)
        if (!response.ok) throw new Error(`Overpass HTTP ${response.status} em ${new URL(endpoint).hostname}`)
        const payload = await response.json()
        markProvider('overpass', true)
        return Array.isArray(payload.elements) ? payload.elements : []
      } catch (error) {
        lastError = error
        markProvider('overpass', false, error)
        if (attempt < PROVIDER_RETRIES) await sleep(500 * attempt)
      }
    }
  }
  throw lastError || new Error('Overpass indisponível.')
}

async function queryOverpass(segment, bbox, categoryMode = 'exact') {
  return await queryOverpassRaw(overpassQuery(segment, bbox, categoryMode))
}

async function queryOverpassByArea(segment, region, categoryMode = 'exact') {
  return await queryOverpassRaw(overpassAreaQuery(segment, region, categoryMode))
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function webResultUrl(rawHref, baseUrl) {
  try {
    const decoded = decodeHtmlEntities(rawHref)
    const url = new URL(decoded, baseUrl)
    if (url.hostname.includes('duckduckgo.com') && url.searchParams.get('uddg')) return url.searchParams.get('uddg')
    return url.toString()
  } catch { return '' }
}

const blockedDiscoveryHosts = /(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com|youtube\.com|tiktok\.com|x\.com|twitter\.com)$/i
function webResultSnippet(htmlText, fromIndex) {
  const tail = htmlText.slice(fromIndex, Math.min(htmlText.length, fromIndex + 2200))
  const match = tail.match(/<(?:a|div|span)\b[^>]*class=["'][^"']*(?:result__snippet|result-snippet)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i)
  return clean(stripHtml(match?.[1] || '')).slice(0, 800)
}
function parseWebSearchResults(htmlText, baseUrl, limit = 18) {
  const results = []
  const seenUrls = new Set()
  const rx = /<a\b[^>]*class=["'][^"']*(?:result__a|result-link)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = rx.exec(htmlText)) && results.length < limit) {
    const href = webResultUrl(match[1], baseUrl)
    const safe = safePublicUrl(href)
    if (!safe || blockedDiscoveryHosts.test(safe.hostname)) continue
    const url = safe.toString()
    const urlKey = url.replace(/#.*$/, '').replace(/\/$/, '').toLowerCase()
    if (!urlKey || seenUrls.has(urlKey)) continue
    const title = clean(stripHtml(match[2]))
    if (!title) continue
    seenUrls.add(urlKey)
    results.push({ title, url, snippet: webResultSnippet(htmlText, rx.lastIndex) })
  }
  return results
}

const webDirectoryHosts = /(^|\.)(tripadvisor\.[a-z.]+|yelp\.[a-z.]+|foursquare\.com|guiamais\.com\.br|telelistas\.net|solutudo\.com\.br|apontador\.com\.br|listamais\.com\.br|instagram\.com|facebook\.com|linkedin\.com)$/i
const webContentTitlePattern = /\b(melhores|top\s*\d+|lista|ranking|guia|como\s+escolher|dicas|not[ií]cias?|mat[eé]ria|artigo|blog|perto\s+de\s+mim|onde\s+encontrar|veja\s+\d+|conhe[cç]a\s+\d+)\b/i
const webContentPathPattern = /\/(blog|noticias?|news|artigos?|materias?|guia|ranking|lista|category|categoria|tag)\b/i

function scopeTerms(ontology) {
  return uniqueTerms(ontology?.strictTerms?.length ? ontology.strictTerms : [...(ontology?.osmNameTerms || []), ...(ontology?.providerCategories || [])], 16)
}

function exactTagMatch(tags, filters) {
  if (!tags || typeof tags !== 'object') return false
  return (filters || []).some((filter) => Object.entries(filter).every(([key, value]) => normalize(tags[key]) === normalize(value)))
}

function termMatchScore(text, terms) {
  const normalizedText = normalize(text)
  if (!normalizedText) return 0
  let best = 0
  for (const term of terms || []) {
    const needle = normalize(term)
    if (!needle) continue
    if (normalizedText === needle) best = Math.max(best, 100)
    else if (normalizedText.includes(needle)) best = Math.max(best, needle.length >= 8 ? 88 : 76)
  }
  return best
}

function categoryScopeDecision({ name = '', description = '', tags = null, bodyText = '', ontology = null, categoryMode = 'exact' } = {}) {
  if (categoryMode === 'related' || !ontology) return { accepted: true, score: 60, reason: 'categorias relacionadas habilitadas' }
  const strictTerms = scopeTerms(ontology)
  const rejectTerms = ontology.rejectTerms || []
  const exactFilters = ontology.exactOsmFilters || ontology.osmFilters || []
  const identityText = [name, description].filter(Boolean).join(' ')
  const tagText = tags && typeof tags === 'object' ? Object.entries(tags).map(([key, value]) => `${key} ${value}`).join(' ') : ''
  const body = clean(bodyText).slice(0, 12000)
  const exactTag = exactTagMatch(tags, exactFilters)
  const identityScore = termMatchScore(identityText, strictTerms)
  const tagScore = termMatchScore(tagText, strictTerms)
  const bodyScore = termMatchScore(body, strictTerms)
  const negativeIdentity = termMatchScore(identityText, rejectTerms)
  const negativeBody = termMatchScore(body, rejectTerms)
  const score = Math.max(exactTag ? 100 : 0, identityScore, tagScore >= 76 ? 82 : tagScore, bodyScore >= 76 ? 68 : bodyScore)
  if (negativeIdentity >= 76 && identityScore < 76 && !exactTag) return { accepted: false, score, reason: 'categoria conflitante no nome/tipo do estabelecimento' }
  if (negativeBody >= 88 && score < 76 && !exactTag) return { accepted: false, score, reason: 'conteúdo indica categoria diferente da solicitada' }
  return score >= 68
    ? { accepted: true, score, reason: exactTag ? 'categoria OSM exata' : identityScore >= 76 ? 'categoria confirmada pelo nome/tipo' : 'categoria confirmada pelo site' }
    : { accepted: false, score, reason: 'categoria solicitada não foi confirmada' }
}

function regionParts(region) {
  const parts = clean(region).split(',').map(clean).filter(Boolean)
  return { city: normalize(parts[0] || ''), state: normalize(parts[1] || '') }
}

function locationScopeDecision({ region = '', explicitCity = '', title = '', bodyText = '', provider = '' } = {}) {
  const expected = regionParts(region)
  const actual = normalize(explicitCity)
  if (actual && expected.city && actual !== expected.city) return { accepted: false, score: 0, reason: `cidade divergente: ${explicitCity}` }
  if (provider === 'openstreetmap_overpass') return { accepted: true, score: actual ? 100 : 92, reason: actual ? 'cidade confirmada pelo OSM' : 'coordenadas dentro do território consultado' }
  const titleText = normalize(title)
  const body = normalize(bodyText)
  if (!expected.city) return { accepted: true, score: 60, reason: 'região não especificada' }
  const stateVariants = expected.state ? [`${expected.city} ${expected.state}`, `${expected.city} - ${expected.state}`, `${expected.city}/${expected.state}`, `${expected.city}, ${expected.state}`] : []
  if (titleText.includes(expected.city) && !/rio grande do sul/.test(titleText.replace(expected.city, '').trim())) return { accepted: true, score: 90, reason: 'cidade confirmada no resultado web' }
  if (stateVariants.some((variant) => variant && body.includes(variant))) return { accepted: true, score: 86, reason: 'cidade/UF confirmadas no site' }
  if (body.includes(expected.city)) return { accepted: true, score: 68, reason: 'cidade confirmada no conteúdo do site' }
  return { accepted: false, score: 0, reason: 'cidade solicitada não foi confirmada no resultado web' }
}

function candidateScopeDecision(job, draft) {
  const ontology = job.plan?.ontology || buildSearchOntologyPlan(job.input.segment)
  const categoryMode = job.input?.categoryMode === 'related' ? 'related' : 'exact'
  let category = categoryScopeDecision({ name: draft.company || draft.name, description: draft.description || draft.category, tags: draft.rawTags, bodyText: draft.scopeBodyText || '', ontology, categoryMode })
  if (!category.accepted && category.reason === 'categoria solicitada não foi confirmada' && draft.coverageCandidate && draft.provider === 'openstreetmap_overpass') {
    const broadTag = exactTagMatch(draft.rawTags, ontology.osmFilters || [])
    if (broadTag) category = { accepted: true, score: 48, reason: 'candidato de cobertura OSM; categoria exige confirmação', needsReview: true }
  }
  if (!category.accepted) return { accepted: false, rejectType: 'category', category, location: null, reason: category.reason }
  const location = locationScopeDecision({ region: draft.scopeRegion || job.input.regions?.[0] || '', explicitCity: draft.scopeExplicitCity || (draft.provider === 'openstreetmap_overpass' ? draft.city : ''), title: draft.scopeTitle || draft.company || draft.name, bodyText: draft.scopeBodyText || '', provider: draft.provider })
  if (!location.accepted) return { accepted: false, rejectType: 'location', category, location, reason: location.reason }
  return { accepted: true, category, location, reason: `${category.reason}; ${location.reason}` }
}

function recordScopeRejection(job, draft, decision) {
  const type = decision?.rejectType || 'scope'
  if (type === 'category') job.stats.scopeRejectedCategory = Number(job.stats.scopeRejectedCategory || 0) + 1
  else if (type === 'location') job.stats.scopeRejectedLocation = Number(job.stats.scopeRejectedLocation || 0) + 1
  else job.stats.scopeRejectedOther = Number(job.stats.scopeRejectedOther || 0) + 1
  job.rejections ||= []
  job.rejections.push({ name: clean(draft?.company || draft?.name || draft?.scopeTitle || 'Resultado web'), source: clean(draft?.provider || 'web_discovery'), type, reason: clean(decision?.reason || 'fora do escopo'), at: now() })
  job.rejections = job.rejections.slice(-120)
  syncRuntimeCounters(job)
}

function classifyWebDocument(result, region, snapshot = null) {
  const host = domain(result?.url)
  const title = clean(result?.title)
  const snippet = clean(result?.snippet)
  const url = safePublicUrl(result?.url)
  const regionName = normalize(region).split(',')[0]
  const isDirectory = webDirectoryHosts.test(host)
  const isContent = webContentTitlePattern.test(title) || webContentPathPattern.test(url?.pathname || '')
  const signals = []
  let score = 0
  if (!isDirectory && !isContent) { score += 18; signals.push('domínio próprio provável') }
  if (regionName && (normalize(title).includes(regionName) || normalize(snippet).includes(regionName))) { score += 12; signals.push('cidade no resultado') }
  if (digits(snapshot?.phone).length >= 10) { score += 28; signals.push('telefone comercial') }
  if (digits(snapshot?.cnpj).length === 14) { score += 38; signals.push('CNPJ') }
  if (clean(snapshot?.email)) { score += 10; signals.push('e-mail') }
  if (clean(snapshot?.instagram) || clean(snapshot?.facebook) || clean(snapshot?.linkedin)) { score += 8; signals.push('rede oficial') }
  if (Number(snapshot?.textLength || 0) >= 250) { score += 5; signals.push('site com conteúdo') }
  if (isDirectory) score -= 55
  if (isContent) score -= 65
  const kind = isDirectory ? 'directory' : isContent ? 'content' : score >= 46 ? 'service_business' : score >= 30 ? 'unknown' : 'web_document'
  const accepted = kind === 'service_business' && (digits(snapshot?.phone).length >= 10 || digits(snapshot?.cnpj).length === 14 || clean(snapshot?.email))
  return { kind, accepted, score: Math.max(0, Math.min(100, score)), signals }
}

function coverageHintName(result, ontology) {
  let value = clean(result?.title).replace(/\s+[|–—-]\s+(Instagram|Facebook|LinkedIn|Solutudo|GuiaMais|TeleListas|Apontador|Foursquare|Yelp|Tripadvisor).*$/i, '')
  value = value.replace(/\s+[|–—-]\s+.*$/, '').trim()
  const generic = normalize(value)
  const categoryTerms = uniqueTerms([ontology?.label, ...(ontology?.aliases || []), ...(ontology?.strictTerms || [])], 20).map(normalize)
  if (!value || value.length < 3) return ''
  if (/^(barbearias?|cabeleireiros?|saloes?|salões?|empresas?|servicos?|serviços?)\s+(em|de|na|no)\b/i.test(value)) return ''
  if (categoryTerms.some((term) => term && generic === term)) return ''
  return value.slice(0, 180)
}
function webCoverageHintDraft(result, region, job) {
  const ontology = job.plan?.ontology || buildSearchOntologyPlan(job.input.segment)
  const name = coverageHintName(result, ontology)
  if (!name) return null
  const bodyText = clean(result?.snippet)
  const category = categoryScopeDecision({ name: result.title, bodyText, ontology, categoryMode: 'exact' })
  const location = locationScopeDecision({ region, title: result.title, bodyText, provider: 'web_coverage_hint' })
  if (!category.accepted || !location.accepted) return null
  return {
    name,
    company: name,
    phone: '', email: '', city: clean(region), address: '', website: '', instagram: '',
    description: '', source: 'manual', sourceDetail: 'Pista de cobertura web pública · requer revisão',
    notes: `Descoberto como pista de cobertura em ${domain(result.url)}. Confirmar categoria e identidade antes de enviar ao CRM.`,
    provider: 'web_coverage_hint', coverageCandidate: true, coverageSourceUrl: result.url, coverageSnippet: bodyText,
    placeType: 'unknown', placeConfidence: 48, placeEvidence: ['resultado web local', category.reason, location.reason],
    scopeTitle: clean(result.title), scopeBodyText: bodyText, scopeRegion: clean(region), scopeExplicitCity: '',
    scopeValidation: { category: { ...category, needsReview: true }, location, mode: 'exact', version: STRICT_SCOPE_VERSION }, fetchedAt: now(),
  }
}

async function webPlaceDraft(result, region, job) {
  const preliminary = classifyWebDocument(result, region)
  if (preliminary.kind === 'directory') {
    const hint = webCoverageHintDraft(result, region, job)
    return hint ? { draft: hint, classification: { ...preliminary, accepted: true, coverageHint: true } } : { draft: null, classification: { ...preliminary, rejectType: 'document', rejectReason: 'diretório sem evidência local/categórica suficiente' } }
  }
  if (preliminary.kind === 'content') return { draft: null, classification: { ...preliminary, rejectType: 'document', rejectReason: 'artigo ou ranking não é estabelecimento' } }
  let snapshot = null
  try {
    job.stats.websitesVisited += 1
    snapshot = await crawlWebsite(result.url, false)
  } catch {}
  const classification = classifyWebDocument(result, region, snapshot)
  if (!classification.accepted) return { draft: null, classification: { ...classification, rejectType: 'document', rejectReason: 'documento web sem identidade empresarial suficiente' } }
  const category = categoryScopeDecision({ name: result.title, bodyText: snapshot?.textSample || '', ontology: job.plan?.ontology, categoryMode: job.input?.categoryMode })
  if (!category.accepted) return { draft: null, classification: { ...classification, rejectType: 'category', rejectReason: category.reason, category } }
  const location = locationScopeDecision({ region, title: result.title, bodyText: snapshot?.textSample || '', provider: 'web_discovery' })
  if (!location.accepted) return { draft: null, classification: { ...classification, rejectType: 'location', rejectReason: location.reason, category, location } }
  const base = webDraft(result, region)
  if (!base) return { draft: null, classification }
  base.phone = clean(snapshot?.phone)
  base.email = clean(snapshot?.email)
  base.cnpj = digits(snapshot?.cnpj).slice(0, 14)
  base.instagram = clean(snapshot?.instagram)
  base.facebook = clean(snapshot?.facebook)
  base.linkedin = clean(snapshot?.linkedin)
  base.placeType = 'service_business'
  base.placeConfidence = Math.round((classification.score + category.score + location.score) / 3)
  base.placeEvidence = [...classification.signals, category.reason, location.reason]
  base.scopeTitle = clean(result.title)
  base.scopeBodyText = clean(snapshot?.textSample).slice(0, 12000)
  base.scopeRegion = clean(region)
  base.scopeExplicitCity = ''
  base.scopeValidation = { category, location, mode: job.input?.categoryMode || 'exact', version: STRICT_SCOPE_VERSION }
  base.sourceDetail = 'Local validado pela Web · RealTalent Prospecting Agent'
  base.notes = `LocalCandidate validado antes da entrada no Garimpo: ${base.placeEvidence.join(', ') || 'sinais mínimos'}.`
  return { draft: base, classification: { ...classification, category, location } }
}

async function searchWeb(segment, region, limit = 18) {
  if (!WEB_SEARCH_ENABLED) return []
  const endpoint = new URL(WEB_SEARCH)
  endpoint.searchParams.set('q', `${segment} ${region}`)
  try {
    const results = await withRetries('Busca web', async () => {
      const response = await fetchWithTimeout(endpoint.toString(), { headers: { accept: 'text/html,application/xhtml+xml' } }, 18000)
      if (!response.ok) throw new Error(`Busca web HTTP ${response.status}`)
      const page = await readLimitedText(response, 900_000)
      return parseWebSearchResults(page, endpoint.toString(), limit)
    })
    markProvider('webSearch', true)
    return results
  } catch (error) {
    markProvider('webSearch', false, error)
    throw error
  }
}

function webDraft(result, region) {
  const host = domain(result.url)
  const title = clean(result.title).replace(/\s+[|–—-]\s+.*$/, '')
  const name = title || host.replace(/^www\./, '').split('.')[0]
  if (!name || !host) return null
  return {
    name,
    company: name,
    phone: '', email: '', city: clean(region), address: '', website: result.url, instagram: '',
    description: '', source: 'manual',
    sourceDetail: 'Web pública · RealTalent Prospecting Agent',
    notes: 'Descoberto automaticamente pela busca web pública do Agent Linux.',
    provider: 'web_discovery', fetchedAt: now(),
  }
}

function osmDraft(element, region) {
  const tags = element.tags || {}
  const name = clean(tags.name || tags.brand || tags.operator)
  if (!name) return null
  const lat = Number(element.lat ?? element.center?.lat)
  const lon = Number(element.lon ?? element.center?.lon)
  const website = clean(tags['contact:website'] || tags.website || tags.url)
  const instagram = clean(tags['contact:instagram'] || tags.instagram)
  const phone = clean(tags['contact:phone'] || tags.phone || tags['contact:mobile'])
  const email = clean(tags['contact:email'] || tags.email)
  const city = clean(tags['addr:city'] || tags['addr:municipality'] || region)
  const address = [tags['addr:street'], tags['addr:housenumber'], tags['addr:suburb']].map(clean).filter(Boolean).join(', ')
  return {
    name,
    company: name,
    phone,
    email,
    city,
    address,
    website,
    instagram,
    description: clean(tags.shop || tags.amenity || tags.office || tags.leisure || tags.tourism),
    source: 'manual',
    sourceDetail: 'OpenStreetMap / Overpass · RealTalent Prospecting Agent',
    notes: 'Descoberto automaticamente pelo Agent Linux.',
    provider: 'openstreetmap_overpass',
    placeType: 'physical_place',
    placeConfidence: 100,
    placeEvidence: ['OpenStreetMap place id', Number.isFinite(lat) && Number.isFinite(lon) ? 'coordenadas' : '', address ? 'endereço' : '', phone ? 'telefone' : ''].filter(Boolean),
    osmId: `${element.type}/${element.id}`,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lon) ? lon : null,
    rawTags: tags,
    scopeRegion: clean(region),
    scopeExplicitCity: clean(tags['addr:city'] || tags['addr:municipality']),
    scopeTitle: name,
    fetchedAt: now(),
  }
}

function identityKeys(draft) {
  const keys = []
  const osmId = clean(draft.osmId)
  const cnpj = digits(draft.cnpj).slice(0, 14)
  const phone = digits(draft.phone)
  const webDomain = domain(draft.website)
  const company = normalize(draft.company || draft.name)
  const city = normalize(draft.city)
  if (osmId) keys.push(`osm:${osmId}`)
  if (cnpj.length === 14) keys.push(`cnpj:${cnpj}`)
  if (phone.length >= 10) keys.push(`phone:${phone}`)
  if (webDomain) keys.push(`domain:${webDomain}`)
  if (company) keys.push(`name:${company}:${city}`)
  return keys
}

function strongIdentityKeys(draft) {
  return identityKeys(draft).filter((key) => key.startsWith('cnpj:') || key.startsWith('osm:'))
}

function companyDistanceKm(a, b) {
  const latA = Number(a.latitude); const lonA = Number(a.longitude); const latB = Number(b.latitude); const lonB = Number(b.longitude)
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return null
  const dy = (latA - latB) * 111.32
  const dx = (lonA - lonB) * 111.32 * Math.cos(((latA + latB) / 2) * Math.PI / 180)
  return Math.sqrt(dx * dx + dy * dy)
}

function evidenceItem(field, value, source, confidence = 'medium') {
  const cleaned = clean(value)
  if (!cleaned) return null
  return { field, value: cleaned, source, confidence, collectedAt: now() }
}

function pushEvidence(draft, items) {
  const current = Array.isArray(draft.evidence) ? draft.evidence : []
  const merged = [...current]
  for (const item of items.filter(Boolean)) {
    if (merged.some((existing) => existing.field === item.field && normalize(existing.value) === normalize(item.value) && existing.source === item.source)) continue
    merged.push(item)
  }
  draft.evidence = merged.slice(0, 80)
}

function seedProviderEvidence(draft) {
  const source = clean(draft.sourceDetail || draft.provider || 'fonte de descoberta')
  pushEvidence(draft, [
    evidenceItem('name', draft.company || draft.name, source, 'medium'),
    evidenceItem('address', draft.address, source, 'medium'),
    evidenceItem('city', draft.city, source, 'medium'),
    evidenceItem('phone', draft.phone, source, 'medium'),
    evidenceItem('email', draft.email, source, 'medium'),
    evidenceItem('website', draft.website, source, draft.website ? 'high' : 'medium'),
    evidenceItem('instagram', draft.instagram, source, 'medium'),
    evidenceItem('cnpj', draft.cnpj, source, 'medium'),
  ])
}

function companyNameTokens(value) {
  return normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !['ltda','eireli','me','epp','empresa','comercio','servicos','serviço','serviços'].includes(token))
}

function nameOverlapScore(a, b) {
  const aa = companyNameTokens(a); const bb = new Set(companyNameTokens(b))
  if (!aa.length || !bb.size) return 0
  return aa.filter((token) => bb.has(token)).length / aa.length
}

function websiteDiscoveryScore(candidate, result) {
  const company = clean(candidate.company || candidate.name)
  const title = clean(result.title)
  const host = domain(result.url)
  const tokens = companyNameTokens(company)
  let score = Math.round(nameOverlapScore(company, title) * 60)
  if (tokens.some((token) => host.includes(token))) score += 28
  const city = normalize(candidate.city)
  if (city && normalize(title).includes(city.split(',')[0])) score += 8
  return Math.min(100, score)
}

async function discoverWebsite(candidate) {
  if (safePublicUrl(candidate.website)) return { url: safePublicUrl(candidate.website).toString(), source: 'provider', score: 100 }
  if (!WEB_SEARCH_ENABLED) return null
  const company = clean(candidate.company || candidate.name)
  if (!company) return null
  const results = await searchWeb(`"${company}"`, clean(candidate.city), 8)
  const ranked = results.map((result) => ({ result, score: websiteDiscoveryScore(candidate, result) })).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.score < 38) return null
  return { url: best.result.url, source: 'busca web pública', score: best.score, title: best.result.title }
}

async function getWebsiteSnapshot(candidate, job, force = false) {
  const url = clean(candidate.website)
  if (!url) return null
  const key = domain(url)
  const cached = candidate.enrichmentCache?.website
  if (!force && cached && cached.domain === key && cached.collectedAt) return cached
  job.stats.websitesVisited += 1
  job.progress.currentUrl = url
  await saveState()
  const info = await crawlWebsite(url, job.options.browserFallback)
  const snapshot = {
    domain: key,
    url,
    email: clean(info?.email), phone: clean(info?.phone), cnpj: digits(info?.cnpj).slice(0, 14),
    instagram: clean(info?.instagram), facebook: clean(info?.facebook), linkedin: clean(info?.linkedin),
    textLength: Number(info?.textLength || 0), warnings: Array.isArray(info?.warnings) ? info.warnings.map(clean).filter(Boolean) : [], collectedAt: now(),
  }
  candidate.enrichmentCache = { ...(candidate.enrichmentCache || {}), website: snapshot }
  if (snapshot.warnings.length) job.warnings.push(...snapshot.warnings.map((warning) => `${clean(candidate.company || candidate.name)}: ${warning}`))
  return snapshot
}

function applyWebsiteSnapshotContacts(candidate, snapshot) {
  if (!snapshot) return false
  const before = { email: candidate.email, phone: candidate.phone }
  candidate.email = candidate.email || snapshot.email || ''
  candidate.phone = candidate.phone || snapshot.phone || ''
  pushEvidence(candidate, [
    !before.email && candidate.email ? evidenceItem('email', candidate.email, 'website oficial', 'high') : null,
    !before.phone && candidate.phone ? evidenceItem('phone', candidate.phone, 'website oficial', 'high') : null,
  ])
  return Boolean(candidate.email || digits(candidate.phone).length >= 10)
}

function applyWebsiteSnapshotSocial(candidate, snapshot) {
  if (!snapshot) return false
  const before = { instagram: candidate.instagram, facebook: candidate.facebook, linkedin: candidate.linkedin }
  candidate.instagram = candidate.instagram || snapshot.instagram || ''
  candidate.facebook = candidate.facebook || snapshot.facebook || ''
  candidate.linkedin = candidate.linkedin || snapshot.linkedin || ''
  pushEvidence(candidate, [
    !before.instagram && candidate.instagram ? evidenceItem('instagram', candidate.instagram, 'website oficial', 'high') : null,
    !before.facebook && candidate.facebook ? evidenceItem('facebook', candidate.facebook, 'website oficial', 'high') : null,
    !before.linkedin && candidate.linkedin ? evidenceItem('linkedin', candidate.linkedin, 'website oficial', 'high') : null,
  ])
  return Boolean(candidate.instagram || candidate.facebook || candidate.linkedin)
}

function legalCompanyMatchScore(candidate, company) {
  const candidateName = clean(candidate.company || candidate.name)
  const legalName = clean(company?.razao_social)
  const tradeName = clean(company?.nome_fantasia)
  const nameScore = Math.max(nameOverlapScore(candidateName, legalName), nameOverlapScore(candidateName, tradeName))
  const candidateCity = normalize(candidate.city).split(',')[0]
  const legalCity = normalize(company?.municipio)
  const cityScore = candidateCity && legalCity && (candidateCity.includes(legalCity) || legalCity.includes(candidateCity)) ? 0.2 : 0
  return Math.min(1, nameScore + cityScore)
}

function applyLegalCompany(candidate, company, source = 'BrasilAPI / dados empresariais') {
  if (!company) return false
  candidate.legalName = clean(company.razao_social)
  candidate.tradeName = clean(company.nome_fantasia)
  candidate.email = candidate.email || clean(company.email)
  candidate.phone = candidate.phone || clean(company.ddd_telefone_1 || company.ddd_telefone_2)
  candidate.city = candidate.city || [clean(company.municipio), clean(company.uf)].filter(Boolean).join(', ')
  candidate.cnae = clean(company.cnae_fiscal_descricao)
  candidate.cnpjStatus = clean(company.descricao_situacao_cadastral)
  pushEvidence(candidate, [
    evidenceItem('cnpj', candidate.cnpj, source, 'high'), evidenceItem('legalName', candidate.legalName, source, 'high'),
    evidenceItem('tradeName', candidate.tradeName, source, 'high'), evidenceItem('cnae', candidate.cnae, source, 'high'),
    evidenceItem('cnpjStatus', candidate.cnpjStatus, source, 'high'),
  ])
  return true
}

async function discoverAndValidateCnpj(candidate, job) {
  let value = digits(candidate.cnpj).slice(0, 14)
  let source = value.length === 14 ? 'fonte de descoberta' : ''
  const snapshot = candidate.website ? await getWebsiteSnapshot(candidate, job) : null
  if (value.length !== 14 && digits(snapshot?.cnpj).length === 14) {
    value = digits(snapshot.cnpj).slice(0, 14)
    source = 'website oficial'
  }
  const validate = async (cnpj, sourceLabel) => {
    const company = await enrichCnpj(cnpj)
    if (!company) return null
    const score = legalCompanyMatchScore(candidate, company)
    if (score < 0.45) return null
    return { cnpj, company, source: sourceLabel, score }
  }
  if (value.length === 14) {
    const verified = await validate(value, source)
    if (verified) return verified
  }
  if (!WEB_SEARCH_ENABLED) return null
  const companyName = clean(candidate.company || candidate.name)
  if (!companyName) return null
  const results = await searchWeb(`"${companyName}" CNPJ`, clean(candidate.city), 5)
  for (const result of results.slice(0, 4)) {
    try {
      const info = await crawlWebsite(result.url, false)
      const found = digits(info?.cnpj).slice(0, 14)
      if (found.length !== 14) continue
      const verified = await validate(found, `web pública: ${domain(result.url)}`)
      if (verified) return verified
    } catch {}
  }
  return null
}

function syncProcessingStages(candidate) {
  if (!candidate.enrichmentTasks || typeof candidate.enrichmentTasks !== 'object') candidate.enrichmentTasks = normalizeEnrichmentTasks(candidate)
  const tasks = candidate.enrichmentTasks
  const mapStatus = (task, successWhenAttention = false) => {
    if (!task) return 'pending'
    if (task.status === 'completed') return 'completed'
    if (task.status === 'attention') return successWhenAttention ? 'attention' : 'attention'
    if (task.status === 'failed') return 'failed'
    if (task.status === 'skipped') return 'skipped'
    if (task.status === 'running' || task.status === 'retrying') return 'running'
    return 'pending'
  }
  candidate.processingStages = {
    ...(candidate.processingStages || {}),
    identity: 'completed',
    website: mapStatus(tasks.website), contacts: mapStatus(tasks.contacts), legal: mapStatus(tasks.cnpj), social: mapStatus(tasks.social),
    location: 'completed', validation: candidate.processingStages?.validation === 'completed' ? 'completed' : 'pending',
  }
}

async function executeEnrichmentTask(candidate, job, taskId) {
  if (taskId === 'website') {
    if (!job.options.enrichWeb) return { status: 'skipped', message: 'Enriquecimento web desativado.' }
    const discovered = await discoverWebsite(candidate)
    if (!discovered) return { status: 'attention', message: 'Website oficial não localizado com confiança suficiente.' }
    if (!candidate.website) {
      candidate.website = discovered.url
      pushEvidence(candidate, [evidenceItem('website', candidate.website, discovered.source, discovered.score >= 70 ? 'high' : 'medium')])
    }
    const snapshot = await getWebsiteSnapshot(candidate, job, true)
    if (!snapshot || (!snapshot.textLength && !snapshot.email && !snapshot.phone && !snapshot.cnpj && !snapshot.instagram)) {
      return { status: 'attention', message: 'Website localizado, mas não foi possível validar conteúdo público.' }
    }
    pushEvidence(candidate, [evidenceItem('website', candidate.website, 'website oficial', 'high')])
    return { status: 'completed', message: `Website validado: ${domain(candidate.website)}` }
  }
  if (taskId === 'contacts') {
    if (candidate.phone || candidate.email) {
      const snapshot = candidate.website ? await getWebsiteSnapshot(candidate, job) : null
      applyWebsiteSnapshotContacts(candidate, snapshot)
      return { status: 'completed', message: 'Contato disponível para abordagem.' }
    }
    if (!candidate.website) return { status: 'attention', message: 'Sem website para descobrir telefone/e-mail.' }
    const snapshot = await getWebsiteSnapshot(candidate, job)
    return applyWebsiteSnapshotContacts(candidate, snapshot)
      ? { status: 'completed', message: 'Telefone/e-mail extraído do website.' }
      : { status: 'attention', message: 'Website verificado sem telefone/e-mail público.' }
  }
  if (taskId === 'cnpj') {
    if (!job.options.enrichCnpj) return { status: 'skipped', message: 'Enriquecimento cadastral desativado.' }
    const verified = await discoverAndValidateCnpj(candidate, job)
    if (!verified) return { status: 'attention', message: 'CNPJ não localizado ou identidade cadastral inconclusiva.' }
    candidate.cnpj = verified.cnpj
    pushEvidence(candidate, [evidenceItem('cnpj', candidate.cnpj, verified.source, verified.score >= 0.7 ? 'high' : 'medium')])
    applyLegalCompany(candidate, verified.company)
    return { status: 'completed', message: `CNPJ validado · correspondência ${Math.round(verified.score * 100)}%.` }
  }
  if (taskId === 'social') {
    if (candidate.instagram || candidate.facebook || candidate.linkedin) {
      const snapshot = candidate.website ? await getWebsiteSnapshot(candidate, job) : null
      applyWebsiteSnapshotSocial(candidate, snapshot)
      return { status: 'completed', message: 'Rede social oficial disponível.' }
    }
    if (!candidate.website) return { status: 'attention', message: 'Sem website oficial para descobrir redes com segurança.' }
    const snapshot = await getWebsiteSnapshot(candidate, job)
    return applyWebsiteSnapshotSocial(candidate, snapshot)
      ? { status: 'completed', message: 'Redes oficiais encontradas no website.' }
      : { status: 'attention', message: 'Nenhuma rede oficial encontrada no website.' }
  }
  throw new Error(`Task desconhecida: ${taskId}`)
}

async function runEnrichmentTask(candidate, job, taskId, { force = false } = {}) {
  candidate.enrichmentTasks = normalizeEnrichmentTasks(candidate)
  const task = candidate.enrichmentTasks[taskId]
  if (!task) throw new Error(`Task inválida: ${taskId}`)
  if (force) {
    task.status = 'pending'; task.attempts = 0; task.lastError = null; task.message = ''; task.completedAt = null
    candidate.enrichmentCache = { ...(candidate.enrichmentCache || {}), website: null }
  } else if (['completed','skipped'].includes(task.status)) return task
  while (task.attempts < task.maxAttempts) {
    task.attempts += 1
    task.status = task.attempts > 1 ? 'retrying' : 'running'
    task.lastRunAt = now(); task.lastError = null
    syncProcessingStages(candidate); refreshProcessingSummary(job); await saveState()
    try {
      const outcome = await executeEnrichmentTask(candidate, job, taskId)
      task.status = outcome.status
      task.message = clean(outcome.message)
      task.completedAt = ['completed','attention','skipped'].includes(task.status) ? now() : null
      task.lastError = null
      syncProcessingStages(candidate); refreshProcessingSummary(job); await saveState()
      return task
    } catch (error) {
      task.lastError = error instanceof Error ? error.message : String(error)
      task.message = `Tentativa ${task.attempts}/${task.maxAttempts} falhou.`
      if (task.attempts >= task.maxAttempts) {
        task.status = 'failed'; task.completedAt = now()
        job.warnings.push(`${clean(candidate.company || candidate.name)} · ${taskId}: ${task.lastError}`)
        syncProcessingStages(candidate); refreshProcessingSummary(job); await saveState()
        return task
      }
      task.status = 'retrying'
      syncProcessingStages(candidate); refreshProcessingSummary(job); await saveState()
      await sleep(TEST_MODE ? 5 : 350 * task.attempts)
    }
  }
  return task
}

async function runEnrichmentPipeline(candidate, job) {
  candidate.enrichmentTasks = normalizeEnrichmentTasks(candidate)
  syncProcessingStages(candidate)
  for (const taskId of ENRICHMENT_TASK_IDS) {
    await waitIfPaused(job)
    await runEnrichmentTask(candidate, job, taskId)
  }
  candidate.sourceDetail = [candidate.sourceDetail, candidate.website ? 'site enriquecido' : '', candidate.cnpj ? 'CNPJ validado' : ''].filter(Boolean).join(' · ')
  return candidate
}

function candidateCompleteness(draft) {
  const checks = [
    clean(draft.company || draft.name), clean(draft.description || draft.category), clean(draft.address), clean(draft.phone),
    clean(draft.whatsapp || draft.phone), clean(draft.website), clean(draft.instagram), digits(draft.cnpj).length === 14 ? draft.cnpj : '',
    clean(draft.cnae), clean(draft.email), clean(draft.responsible || draft.contactName),
  ]
  const found = checks.filter(Boolean).length
  return Math.round(found / checks.length * 100)
}

function candidateConfidence(draft) {
  let score = 34
  if (digits(draft.cnpj).length === 14) score += 28
  if (domain(draft.website)) score += 16
  if (digits(draft.phone).length >= 10) score += 12
  if (clean(draft.address)) score += 6
  if (clean(draft.instagram)) score += 4
  return Math.min(99, score)
}

function companySimilarityScore(a, b) {
  const acnpj = digits(a.cnpj).slice(0, 14); const bcnpj = digits(b.cnpj).slice(0, 14)
  if (acnpj.length === 14 && acnpj === bcnpj) return 100
  const aosm = clean(a.osmId); const bosm = clean(b.osmId)
  if (aosm && aosm === bosm) return 100

  const aname = normalize(a.company || a.name); const bname = normalize(b.company || b.name)
  const acity = normalize(a.city); const bcity = normalize(b.city)
  const aaddress = normalize(a.address); const baddress = normalize(b.address)
  const adomain = domain(a.website); const bdomain = domain(b.website)
  const aphone = digits(a.phone); const bphone = digits(b.phone)
  const ai = normalize(a.instagram).replace(/^@/, ''); const bi = normalize(b.instagram).replace(/^@/, '')
  const sameName = Boolean(aname && aname === bname)
  const sameCity = Boolean(acity && acity === bcity)
  const sameAddress = Boolean(aaddress && baddress && aaddress === baddress)
  const sameDomain = Boolean(adomain && adomain === bdomain)
  const samePhone = Boolean(aphone.length >= 10 && aphone === bphone)
  const sameInstagram = Boolean(ai && ai === bi)
  const distance = companyDistanceKm(a, b)

  // Automatic merge requires a legal/provider identity, or same business identity at the same physical unit.
  if (sameName && sameAddress && sameCity) return 97
  if (sameName && distance !== null && distance < 0.12) return 95
  if (sameDomain && sameAddress) return 93
  if (samePhone && sameAddress) return 93

  // Shared channels are common in franchises/chains: review, never auto-merge by themselves.
  let score = 0
  if (sameName && sameCity) score = Math.max(score, 82)
  if (sameDomain && sameName) score = Math.max(score, 78)
  else if (sameDomain) score = Math.max(score, 58)
  if (samePhone && sameName) score = Math.max(score, 80)
  else if (samePhone) score = Math.max(score, 62)
  if (sameInstagram && sameName) score = Math.max(score, 78)
  else if (sameInstagram) score = Math.max(score, 60)
  return score
}

function mergeResolvedCompany(target, incoming) {
  const fields = ['name','company','phone','email','city','address','cnpj','instagram','website','description','legalName','tradeName','cnae','cnpjStatus','facebook','linkedin']
  for (const field of fields) if (!clean(target[field]) && clean(incoming[field])) target[field] = incoming[field]
  target.evidence = [...(target.evidence || []), ...(incoming.evidence || [])].filter((item, index, items) => index === items.findIndex((candidate) => candidate.field === item.field && normalize(candidate.value) === normalize(item.value) && candidate.source === item.source)).slice(0, 80)
  target.mergedSources = [...new Set([...(target.mergedSources || [target.provider]).filter(Boolean), incoming.provider].filter(Boolean))]
  target.completenessPercent = candidateCompleteness(target)
  target.confidencePercent = candidateConfidence(target)
  return target
}

function finalizeCandidate(draft) {
  draft.completenessPercent = candidateCompleteness(draft)
  draft.confidencePercent = candidateConfidence(draft)
  draft.processingStages.validation = 'completed'
  const coverageReviewRequired = Boolean(draft.coverageCandidate || draft.scopeValidation?.category?.needsReview)
  draft.qualityStatus = !coverageReviewRequired && draft.completenessPercent >= 70 && draft.confidencePercent >= 70 ? 'ready' : 'attention'
  if (coverageReviewRequired) {
    draft.coverageReviewRequired = true
    draft.processingStages.validation = 'attention'
  }
  return draft
}

function refreshProcessingSummary(job) {
  const summary = emptyProcessing()
  const processedStage = (value) => ['completed', 'attention', 'skipped'].includes(value)
  summary.raw = job.stats.discovered
  for (const item of job.results || []) {
    summary.identity += processedStage(item.processingStages?.identity) ? 1 : 0
    summary.website += processedStage(item.processingStages?.website) ? 1 : 0
    summary.contacts += processedStage(item.processingStages?.contacts) ? 1 : 0
    summary.legal += processedStage(item.processingStages?.legal) ? 1 : 0
    summary.social += processedStage(item.processingStages?.social) ? 1 : 0
    summary.validation += ['completed', 'attention'].includes(item.processingStages?.validation) ? 1 : 0
    summary.ready += item.qualityStatus === 'ready' ? 1 : 0
    summary.attention += item.qualityStatus === 'attention' ? 1 : 0
    summary.failed += Object.values(item.processingStages || {}).includes('failed') ? 1 : 0
  }
  job.processing = summary
  syncRuntimeCounters(job)
}

function ensureReviewStream(job) {
  if (!job.reviewStream || typeof job.reviewStream !== 'object') job.reviewStream = {}
  job.reviewStream.revision = Math.max(0, Number(job.reviewStream.revision) || 0)
  job.reviewStream.acknowledgedRevision = Math.max(0, Number(job.reviewStream.acknowledgedRevision) || 0)
  job.reviewStream.readyCandidates = (job.results || []).filter((item) => item.qualityStatus === 'ready' && Number(item.reviewRevision || 0) > 0).length
  job.reviewStream.lastPublishedAt ||= null
  job.reviewStream.lastAcknowledgedAt ||= null
  return job.reviewStream
}

function publishReadyCandidate(job, candidate, reason = 'ready') {
  if (!candidate || candidate.qualityStatus !== 'ready') return false
  const stream = ensureReviewStream(job)
  stream.revision += 1
  candidate.reviewRevision = stream.revision
  candidate.reviewPublishedAt = now()
  candidate.reviewReason = clean(reason) || 'ready'
  stream.readyCandidates = (job.results || []).filter((item) => item.qualityStatus === 'ready' && Number(item.reviewRevision || 0) > 0).length
  stream.lastPublishedAt = candidate.reviewPublishedAt
  return true
}

function progressiveReviewBatch(job, afterRevision = 0, limit = 50) {
  const stream = ensureReviewStream(job)
  const after = Math.max(0, Number(afterRevision) || 0)
  const max = Math.min(100, Math.max(1, Number(limit) || 50))
  const entries = (job.results || [])
    .filter((candidate) => candidate.qualityStatus === 'ready' && Number(candidate.reviewRevision || 0) > after)
    .sort((a, b) => Number(a.reviewRevision || 0) - Number(b.reviewRevision || 0))
    .slice(0, max)
  const revision = entries.length ? Math.max(...entries.map((item) => Number(item.reviewRevision || 0))) : after
  return { entries, revision, currentRevision: stream.revision, acknowledgedRevision: stream.acknowledgedRevision, hasMore: stream.revision > revision }
}

function acknowledgeProgressiveReview(job, revision) {
  const stream = ensureReviewStream(job)
  const next = Math.min(stream.revision, Math.max(stream.acknowledgedRevision, Number(revision) || 0))
  stream.acknowledgedRevision = next
  stream.lastAcknowledgedAt = now()
  return stream
}

function updateStats(job, draft) {
  if (digits(draft.phone).length >= 10) job.stats.withPhone += 1
  if (clean(draft.email)) job.stats.withEmail += 1
  if (clean(draft.instagram)) job.stats.withInstagram += 1
  if (clean(draft.website)) job.stats.withWebsite += 1
  if (digits(draft.cnpj).length === 14) job.stats.withCnpj += 1
}

async function waitIfPaused(job) {
  while (job.status === 'paused') {
    await saveState()
    await sleep(500)
  }
  if (job.status === 'cancelled') throw new Error('__cancelled__')
  if (job.status === 'queued') job.status = 'running'
}

async function processDiscoveredDraft(job, draft, seen) {
  if (!draft) return false
  const scope = draft.scopeValidation?.category && draft.scopeValidation?.location
    ? { accepted: true, category: draft.scopeValidation.category, location: draft.scopeValidation.location, reason: 'pré-validado pela descoberta web' }
    : candidateScopeDecision(job, draft)
  if (!scope.accepted) { recordScopeRejection(job, draft, scope); return false }
  draft.scopeValidation = { category: scope.category, location: scope.location, mode: job.input?.categoryMode || 'exact', version: STRICT_SCOPE_VERSION }
  const initialKeys = strongIdentityKeys(draft)
  if (initialKeys.some((key) => seen.has(key))) { job.stats.duplicates += 1; return false }

  draft = normalizeCandidateEnrichment({ ...draft, qualityStatus: 'processing' })
  seedProviderEvidence(draft)
  syncProcessingStages(draft)

  const preResolved = (job.results || []).filter((candidate) => candidate.candidateId !== draft.candidateId)
    .map((candidate) => ({ candidate, score: companySimilarityScore(candidate, draft) })).sort((a, b) => b.score - a.score)[0]
  if (preResolved?.score >= 93) {
    mergeResolvedCompany(preResolved.candidate, draft)
    preResolved.candidate.resolutionConfidence = preResolved.score
    preResolved.candidate.resolutionStatus = 'merged'
    finalizeCandidate(preResolved.candidate)
    publishReadyCandidate(job, preResolved.candidate, 'identity_merge')
    identityKeys(preResolved.candidate).forEach((key) => seen.add(key))
    job.stats.duplicates += 1
    refreshProcessingSummary(job); await saveState(); return false
  }
  if (preResolved?.score >= 70) {
    draft.possibleDuplicate = { company: preResolved.candidate.company || preResolved.candidate.name, score: preResolved.score }
    draft.resolutionStatus = 'review'
  } else draft.resolutionStatus = 'unique'

  draft.agentJobId = job.id
  draft.agentVersion = VERSION
  draft.resolutionConfidence = preResolved?.score || candidateConfidence(draft)
  job.results.push(draft)
  job.stats.unique += 1
  refreshProcessingSummary(job)
  job.progress.found = job.results.length
  syncRuntimeCounters(job)
  appendRuntimeEvent(job, draft.coverageCandidate ? 'coverage_candidate' : 'candidate', `${draft.company || draft.name || 'Empresa'} encontrada em ${draft.city || job.progress.currentRegion || 'região pesquisada'}.`, { candidateId: draft.candidateId, provider: draft.provider || 'unknown' })
  await saveState()

  {
    const runtime = ensureRuntimeTruth(job)
    runtime.sourceStates.enrichment = 'running'
    runtime.updatedAt = now()
    appendRuntimeEvent(job, 'enrichment', `Enriquecendo ${draft.company || draft.name || 'empresa encontrada'} em segundo plano da execução…`, { candidateId: draft.candidateId })
  }
  await runEnrichmentPipeline(draft, job)
  finalizeCandidate(draft)

  // Re-resolve after enrichment because CNPJ/legal evidence can reveal a true duplicate.
  const postResolved = (job.results || []).filter((candidate) => candidate.candidateId !== draft.candidateId)
    .map((candidate) => ({ candidate, score: companySimilarityScore(candidate, draft) })).sort((a, b) => b.score - a.score)[0]
  if (postResolved?.score >= 93) {
    mergeResolvedCompany(postResolved.candidate, draft)
    postResolved.candidate.resolutionConfidence = postResolved.score
    postResolved.candidate.resolutionStatus = 'merged'
    finalizeCandidate(postResolved.candidate)
    publishReadyCandidate(job, postResolved.candidate, 'identity_merge')
    job.results = job.results.filter((candidate) => candidate.candidateId !== draft.candidateId)
    job.stats.unique = Math.max(0, job.stats.unique - 1)
    job.stats.duplicates += 1
    identityKeys(postResolved.candidate).forEach((key) => seen.add(key))
    refreshProcessingSummary(job); await saveState(); return false
  }
  if (postResolved?.score >= 70) {
    draft.possibleDuplicate = { company: postResolved.candidate.company || postResolved.candidate.name, score: postResolved.score }
    draft.resolutionStatus = 'review'
  }

  identityKeys(draft).forEach((key) => seen.add(key))
  draft.resolutionConfidence = Math.max(draft.resolutionConfidence || 0, postResolved?.score || draft.confidencePercent)
  publishReadyCandidate(job, draft, 'processing_complete')
  updateStats(job, draft)
  refreshProcessingSummary(job)
  job.progress.found = job.results.length
  const targetText = job.input.targetMode === 'max' ? 'máxima cobertura' : `${job.input.targetQuantity}`
  job.message = `${job.results.length} empresa(s) única(s) · objetivo ${targetText}.`
  syncRuntimeCounters(job)
  await saveState()
  return true
}

async function reprocessEnrichmentTask(job, candidateId, taskId) {
  if (!ENRICHMENT_TASK_IDS.includes(taskId)) throw new Error('Etapa de enriquecimento inválida.')
  const candidate = (job.results || []).find((item) => item.candidateId === candidateId)
  if (!candidate) throw new Error('Empresa não encontrada neste job.')
  candidate.qualityStatus = 'processing'
  candidate.processingStages = { ...(candidate.processingStages || {}), validation: 'pending' }
  await runEnrichmentTask(candidate, job, taskId, { force: true })
  finalizeCandidate(candidate)
  publishReadyCandidate(job, candidate, `reprocess_${taskId}`)
  refreshProcessingSummary(job)
  await saveState()
  return candidate
}

async function buildSearchPlan(job) {
  job.plan.ontology = buildSearchOntologyPlan(job.input.segment)
  job.plan.expandedQueries = job.input.categoryMode === 'related' ? job.plan.ontology.webTerms : uniqueTerms([job.input.segment, ...(job.plan.ontology.strictTerms || [])], 10)
  job.plan.cells = []
  job.plan.providerRuns = []
  job.plan.geometry = null
  job.plan.plannedAt = now()
  let totalArea = 0

  if (job.input.areaMode === 'map') {
    const polygon = sanitizeMapPolygon(job.input.mapPolygon)
    if (polygon.length < 3) throw new Error('Área do mapa inválida. Desenhe um polígono com pelo menos 3 pontos antes de iniciar.')
    const bbox = polygonBBox(polygon)
    const region = job.input.regions[0] || 'Área selecionada'
    const geometry = { type: 'polygon', polygon, bbox }
    const cells = planGrid(bbox, job.input.searchMode, job.input.radiusKm)
      .filter((cell) => bboxIntersectsPolygon(cell.bbox, polygon))
      .map((cell) => decorateTerritoryCell({ ...cell, region, mode: 'bbox' }, geometry))
    job.plan.cells.push(...cells.slice(0, MAX_SEARCH_CELLS))
    job.plan.geometry = geometry
    totalArea = polygonAreaKm2(polygon)
  } else {
    for (const region of job.input.regions) {
      try {
        const geo = await geocodeRegion(region)
        let bbox = { south: geo.south, north: geo.north, west: geo.west, east: geo.east }
        let geometry = { type: 'bbox', bbox }
        if (job.input.areaMode === 'radius' && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) {
          const center = job.input.searchCenter && Number.isFinite(job.input.searchCenter.lat) && Number.isFinite(job.input.searchCenter.lon)
            ? job.input.searchCenter : { lat: geo.lat, lon: geo.lon }
          bbox = radiusBBox(center.lat, center.lon, job.input.radiusKm)
          const polygon = circlePolygon(center.lat, center.lon, job.input.radiusKm)
          geometry = { type: 'circle', center, radiusKm: job.input.radiusKm, polygon, bbox }
          totalArea += Math.PI * job.input.radiusKm * job.input.radiusKm
        } else {
          totalArea += bboxAreaKm2(bbox)
        }
        const cells = planGrid(bbox, job.input.searchMode, job.input.radiusKm)
          .filter((cell) => geometry.type !== 'circle' || bboxIntersectsPolygon(cell.bbox, geometry.polygon))
          .map((cell) => decorateTerritoryCell({ ...cell, region, mode: 'bbox' }, geometry))
        job.plan.cells.push(...cells.slice(0, Math.max(1, MAX_SEARCH_CELLS - job.plan.cells.length)))
        if (job.input.regions.length === 1) job.plan.geometry = geometry
      } catch (error) {
        job.warnings.push(`Planejamento territorial em ${region}: ${error instanceof Error ? error.message : String(error)}. Será usada a área administrativa do Overpass.`)
        job.plan.cells.push({ id: `area-${randomUUID().slice(0, 8)}`, parentId: null, level: 0, region, mode: 'area', bbox: null, status: 'pending', resultsFound: 0, uniqueResultsFound: 0, queries: 0, density: 0, areaKm2: 0, searchAreaKm2: 0, coverageRatio: 1, subdivisionReason: '', providerSaturated: false })
      }
    }
  }

  if (!job.plan.cells.length) throw new Error('A área selecionada é pequena demais ou inválida para gerar células de busca.')
  job.coverage = { ...emptyCoverage(), areaKm2: Math.round(totalArea * 10) / 10, totalCells: job.plan.cells.length, totalSources: job.input.areaMode === 'map' ? 1 : (WEB_SEARCH_ENABLED ? 2 : 1) }
  refreshCoverage(job)
  await saveState()
}

function shouldStopForTarget(job) {
  return job.input.targetMode !== 'max' && job.results.length >= job.input.targetQuantity
}

async function runOsmCell(job, cell, seen) {
  await waitIfPaused(job)
  if (shouldStopForTarget(job)) return 0
  cell.status = 'running'
  job.progress.currentRegion = cell.region
  job.progress.currentSource = 'OpenStreetMap / Overpass'
  job.progress.currentUrl = ''
  job.message = `Pesquisando célula ${job.coverage.completedCells + 1}/${Math.max(1, job.coverage.totalCells)} em ${cell.region}…`
  setRuntimePhase(job, 'discovering_osm', job.message, 'osmExact')
  await saveState()

  const before = job.results.length
  let exactElements = []
  let coverageElements = []
  try {
    job.stats.queries += 1
    cell.queries += 1
    exactElements = cell.mode === 'area' ? await queryOverpassByArea(job.input.segment, cell.region, job.input.categoryMode) : await queryOverpass(job.input.segment, cell.bbox, job.input.categoryMode)
    job.plan.providerRuns.push({ provider: 'openstreetmap', cellId: cell.id, query: job.plan.ontology?.label || job.input.segment, intentId: job.plan.ontology?.intentId || 'generic', startedAt: now(), status: 'completed', results: exactElements.length })
    appendRuntimeEvent(job, 'source_result', `OSM exato retornou ${exactElements.length} registro(s) em ${cell.region}.`, { provider: 'openstreetmap', cellId: cell.id, results: exactElements.length })
  } catch (error) {
    cell.status = 'failed'
    const message = `OSM em ${cell.region}: ${error instanceof Error ? error.message : String(error)}`
    job.warnings.push(message)
    job.plan.providerRuns.push({ provider: 'openstreetmap', cellId: cell.id, query: job.plan.ontology?.label || job.input.segment, intentId: job.plan.ontology?.intentId || 'generic', startedAt: now(), status: 'failed', error: message, results: 0 })
    recordCoverageRun(job, 0, cell, false)
    appendRuntimeEvent(job, 'warning', message, { provider: 'openstreetmap', cellId: cell.id })
    await saveState()
    return 0
  }

  const ontology = job.plan?.ontology || buildSearchOntologyPlan(job.input.segment)
  const exactFilters = JSON.stringify(ontology.exactOsmFilters || ontology.osmFilters || [])
  const broadFilters = JSON.stringify(ontology.osmFilters || [])
  const shouldExpandCoverage = job.input.categoryMode === 'exact' && job.input.searchMode !== 'fast' && broadFilters !== exactFilters && (job.input.targetMode === 'max' || exactElements.length < Math.max(8, DENSE_CELL_THRESHOLD / 4))
  if (shouldExpandCoverage && !shouldStopForTarget(job)) {
    try {
      job.progress.currentSource = 'OpenStreetMap / cobertura ampliada'
      job.message = `Ampliando cobertura em ${cell.region} sem aprovar categorias incertas automaticamente…`
      setRuntimePhase(job, 'expanding_coverage', job.message, 'osmCoverage')
      await saveState()
      job.stats.queries += 1
      cell.queries += 1
      const broad = cell.mode === 'area' ? await queryOverpassByArea(job.input.segment, cell.region, 'related') : await queryOverpass(job.input.segment, cell.bbox, 'related')
      const exactIds = new Set(exactElements.map((element) => `${element.type}/${element.id}`))
      coverageElements = broad.filter((element) => !exactIds.has(`${element.type}/${element.id}`)).slice(0, 240)
      job.plan.providerRuns.push({ provider: 'openstreetmap_coverage', cellId: cell.id, query: `${job.plan.ontology?.label || job.input.segment} · cobertura`, intentId: job.plan.ontology?.intentId || 'generic', startedAt: now(), status: 'completed', results: coverageElements.length })
      appendRuntimeEvent(job, 'coverage_expansion', `Cobertura ampliada encontrou ${coverageElements.length} candidato(s) adicional(is) em ${cell.region}; eles exigem confirmação quando a categoria não é exata.`, { provider: 'openstreetmap_coverage', cellId: cell.id, results: coverageElements.length })
    } catch (error) {
      const message = `Cobertura OSM ampliada em ${cell.region}: ${error instanceof Error ? error.message : String(error)}`
      job.warnings.push(message)
      job.plan.providerRuns.push({ provider: 'openstreetmap_coverage', cellId: cell.id, query: `${job.plan.ontology?.label || job.input.segment} · cobertura`, intentId: job.plan.ontology?.intentId || 'generic', startedAt: now(), status: 'failed', error: message, results: 0 })
      appendRuntimeEvent(job, 'warning', message, { provider: 'openstreetmap_coverage', cellId: cell.id })
    }
  }

  const exactIds = new Set(exactElements.map((element) => `${element.type}/${element.id}`))
  const elements = [...exactElements, ...coverageElements]
  job.stats.discovered += elements.length
  cell.resultsFound = elements.length
  for (const element of elements) {
    await waitIfPaused(job)
    if (shouldStopForTarget(job)) break
    const draft = osmDraft(element, cell.region)
    if (draft && !exactIds.has(`${element.type}/${element.id}`)) {
      draft.coverageCandidate = true
      draft.coverageReason = 'Encontrado na segunda varredura OSM por categoria relacionada; requer confirmação da categoria.'
      draft.sourceDetail = 'OpenStreetMap / cobertura ampliada · RealTalent Prospecting Agent'
      draft.placeConfidence = Math.min(Number(draft.placeConfidence || 100), 72)
    }
    const territoryPolygon = job.plan?.geometry?.polygon || (job.input.areaMode === 'map' ? job.input.mapPolygon || [] : [])
    if (territoryPolygon.length >= 3) {
      if (!draft || !Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude) || !pointInPolygon({ lat: draft.latitude, lon: draft.longitude }, territoryPolygon)) continue
    }
    await processDiscoveredDraft(job, draft, seen)
    await sleep(TEST_MODE ? 1 : 45)
  }
  const added = job.results.length - before
  cell.uniqueResultsFound = added
  cell.density = bboxAreaKm2(cell.bbox || { south: 0, north: 1, west: 0, east: 1 }) > 0 ? Math.round(elements.length / Math.max(0.1, bboxAreaKm2(cell.bbox || { south: 0, north: 1, west: 0, east: 1 })) * 10) / 10 : elements.length

  const leafCount = job.plan.cells.filter((item) => item.status !== 'subdivided').length
  const canSubdivideByDepth = cell.level < MAX_SUBDIVISION_LEVEL
  const canSubdivideByArea = Number(cell.searchAreaKm2 || cell.areaKm2 || 0) >= MIN_SUBDIVISION_AREA_KM2 * 4
  const canSubdivideByLimit = leafCount + 3 <= MAX_SEARCH_CELLS
  if (cell.mode === 'bbox' && exactElements.length >= DENSE_CELL_THRESHOLD && canSubdivideByDepth && canSubdivideByArea && canSubdivideByLimit && !shouldStopForTarget(job)) {
    const territoryPolygon = job.plan?.geometry?.polygon || []
    const children = splitBBox(cell.bbox, 2, 2, cell.id, cell.level + 1, 'subcell')
      .filter((child) => territoryPolygon.length < 3 || bboxIntersectsPolygon(child.bbox, territoryPolygon))
      .map((child) => decorateTerritoryCell({ ...child, region: cell.region, mode: 'bbox', subdivisionReason: `provider_limit_${exactElements.length}` }, job.plan?.geometry || null))
    if (children.length) {
      cell.status = 'subdivided'
      cell.subdivisionReason = `provider retornou ${exactElements.length} resultados exatos`
      job.plan.cells.push(...children)
      job.message = `Célula densa em ${cell.region}; subdivisão nível ${cell.level + 1}/${MAX_SUBDIVISION_LEVEL} para ampliar cobertura.`
      job.coverage.validRuns = Number(job.coverage.validRuns || 0) + 1
      job.coverage.lastNewCounts = [...job.coverage.lastNewCounts, added].slice(-SATURATION_WINDOW)
      refreshCoverage(job)
      syncRuntimeCounters(job)
      await saveState()
      return added
    }
  }
  if (cell.mode === 'bbox' && exactElements.length >= DENSE_CELL_THRESHOLD && !shouldStopForTarget(job)) {
    cell.providerSaturated = true
    cell.subdivisionReason = !canSubdivideByDepth ? 'limite de profundidade' : !canSubdivideByArea ? 'célula já pequena' : !canSubdivideByLimit ? 'limite global de células' : 'sem subcélulas válidas'
    job.warnings.push(`Célula saturada em ${cell.region}: ${exactElements.length} resultados e sem nova subdivisão (${cell.subdivisionReason}).`)
  }

  recordCoverageRun(job, added, cell)
  syncRuntimeCounters(job)
  await saveState()
  return added
}

async function runWebPlanner(job, seen) {
  if (!WEB_SEARCH_ENABLED || shouldStopForTarget(job)) return
  const seenWebDocuments = new Set()
  for (const region of job.input.regions) {
    for (const term of job.plan.expandedQueries) {
      await waitIfPaused(job)
      if (shouldStopForTarget(job)) return
      const before = job.results.length
      job.progress.currentRegion = region
      job.progress.currentSource = 'Busca web pública'
      job.progress.currentUrl = ''
      job.message = `Expandindo busca: “${term}” em ${region}…`
      setRuntimePhase(job, 'discovering_web', job.message, 'web')
      ensureRuntimeTruth(job).currentQuery = term
      await saveState()
      try {
        job.stats.queries += 1
        const limit = job.input.searchMode === 'fast' ? 10 : job.input.searchMode === 'economy' ? 14 : 24
        const results = await searchWeb(term, region, limit)
        job.stats.discovered += results.length
        job.stats.webDocuments = Number(job.stats.webDocuments || 0) + results.length
        let acceptedPlaces = 0
        let rejectedDocuments = 0
        for (const result of results) {
          await waitIfPaused(job)
          if (shouldStopForTarget(job)) break
          const documentKey = clean(result.url).replace(/#.*$/, '').replace(/\/$/, '').toLowerCase()
          if (documentKey && seenWebDocuments.has(documentKey)) continue
          if (documentKey) seenWebDocuments.add(documentKey)
          const classified = await webPlaceDraft(result, region, job)
          if (!classified.draft) {
            if (classified.classification?.rejectType === 'category') recordScopeRejection(job, { name: result.title, provider: 'web_discovery' }, { rejectType: 'category', reason: classified.classification.rejectReason })
            else if (classified.classification?.rejectType === 'location') recordScopeRejection(job, { name: result.title, provider: 'web_discovery' }, { rejectType: 'location', reason: classified.classification.rejectReason })
            else rejectedDocuments += 1
            await sleep(TEST_MODE ? 1 : 60); continue
          }
          if (classified.draft.coverageCandidate) {
            const coverageHintsUsed = (job.results || []).filter((candidate) => candidate.provider === 'web_coverage_hint').length
            if (coverageHintsUsed >= COVERAGE_HINT_LIMIT) {
              rejectedDocuments += 1
              appendRuntimeEvent(job, 'coverage_limit', `Limite de ${COVERAGE_HINT_LIMIT} pistas web de cobertura atingido; os demais diretórios ficam apenas no diagnóstico.`, { provider: 'web', query: term, region })
              continue
            }
          }
          acceptedPlaces += 1
          await processDiscoveredDraft(job, classified.draft, seen)
          await sleep(TEST_MODE ? 1 : 100)
        }
        job.stats.webPlaceCandidates = Number(job.stats.webPlaceCandidates || 0) + acceptedPlaces
        job.stats.webRejectedDocuments = Number(job.stats.webRejectedDocuments || 0) + rejectedDocuments
        job.plan.providerRuns.push({ provider: 'web', cellId: null, query: term, intentId: job.plan.ontology?.intentId || 'generic', region, startedAt: now(), status: 'completed', results: results.length, localCandidates: acceptedPlaces, rejectedDocuments })
        appendRuntimeEvent(job, 'source_result', `Web “${term}” retornou ${results.length} documento(s), com ${acceptedPlaces} candidato(s) local(is).`, { provider: 'web', query: term, region, results: results.length, acceptedPlaces })
      } catch (error) {
        const message = `Busca web “${term}” em ${region}: ${error instanceof Error ? error.message : String(error)}`
        job.warnings.push(message)
        job.plan.providerRuns.push({ provider: 'web', cellId: null, query: term, intentId: job.plan.ontology?.intentId || 'generic', region, startedAt: now(), status: 'failed', error: message, results: 0 })
        appendRuntimeEvent(job, 'warning', message, { provider: 'web', query: term, region })
      }
      const added = job.results.length - before
      recordCoverageRun(job, added)
      await saveState()
      if (job.input.targetMode === 'max' && job.coverage.territoryPercent >= 100 && job.coverage.lastNewCounts.length >= SATURATION_WINDOW && job.coverage.saturationPercent >= 94 && job.coverage.lastNewCounts.slice(-3).every((value) => value <= 1)) return
    }
  }
}

async function discoverOsmForRegion(job, region) {
  let elements = []
  let bboxError = null
  job.progress.currentSource = 'OpenStreetMap / Overpass'
  job.message = `Consultando OpenStreetMap em ${region}…`
  await saveState()
  try {
    const bbox = await geocodeRegion(region)
    job.stats.queries += 1
    await sleep(TEST_MODE ? 5 : 1050)
    elements = await queryOverpass(job.input.segment, bbox, job.input.categoryMode)
    return { elements, mode: 'bbox', error: null }
  } catch (error) {
    bboxError = error
    job.warnings.push(`Busca OSM por coordenadas em ${region}: ${error instanceof Error ? error.message : String(error)}`)
  }

  // H3: o Garimpo não depende mais do Nominatim para conseguir consultar uma cidade.
  // Se geocodificação/DNS falhar, o próprio Overpass resolve a área administrativa pelo nome.
  try {
    job.message = `Tentando OpenStreetMap diretamente pela área ${region}…`
    await saveState()
    job.stats.queries += 1
    elements = await queryOverpassByArea(job.input.segment, region, job.input.categoryMode)
    return { elements, mode: 'area', error: null }
  } catch (areaError) {
    const combined = `OSM indisponível em ${region}: ${areaError instanceof Error ? areaError.message : String(areaError)}${bboxError ? ` · geocodificação: ${bboxError instanceof Error ? bboxError.message : String(bboxError)}` : ''}`
    job.warnings.push(combined)
    return { elements: [], mode: 'failed', error: new Error(combined) }
  }
}

async function discoverWebForRegion(job, region, remaining) {
  if (!WEB_SEARCH_ENABLED || remaining <= 0) return { results: [], error: null, skipped: true }
  job.progress.currentSource = 'Busca web pública'
  job.progress.currentUrl = ''
  job.message = `Procurando sites públicos de ${job.input.segment} em ${region}…`
  await saveState()
  try {
    job.stats.queries += 1
    const results = await searchWeb(job.input.segment, region, Math.min(24, Math.max(10, remaining + 6)))
    return { results, error: null, skipped: false }
  } catch (error) {
    const message = `Busca web em ${region}: ${error instanceof Error ? error.message : String(error)}`
    job.warnings.push(message)
    return { results: [], error: new Error(message), skipped: false }
  }
}

async function processJob(job) {
  job.status = 'running'
  job.startedAt ||= now()
  job.message = 'Planejando território, consultas e fontes…'
  job.error = null
  setRuntimePhase(job, 'planning', job.message)
  appendRuntimeEvent(job, 'run_started', `Execução ${job.id.slice(0, 8)} iniciada para ${job.input.segment} em ${job.input.regions.join(', ')}.`, { runId: job.id })
  await saveState()

  const seen = new Set(job.existingKeys || [])
  for (const item of job.results || []) identityKeys(item).forEach((key) => seen.add(key))
  let successfulProviders = 0
  const providerErrors = []

  try {
    if (!job.plan?.plannedAt || !Array.isArray(job.plan.cells) || !job.plan.cells.length) await buildSearchPlan(job)

    let fastWebAttempted = false
    if (job.input.searchMode === 'fast' && WEB_SEARCH_ENABLED && job.input.areaMode !== 'map' && !shouldStopForTarget(job)) {
      fastWebAttempted = true
      setRuntimePhase(job, 'discovering_web', 'Busca rápida: procurando empresas na web pública primeiro…')
      const beforeFastWeb = job.plan.providerRuns.length
      await runWebPlanner(job, seen)
      const fastWebRuns = job.plan.providerRuns.slice(beforeFastWeb).filter((item) => item.provider === 'web')
      const completedFastWebRuns = fastWebRuns.filter((item) => item.status === 'completed')
      const failedFastWebRuns = fastWebRuns.filter((item) => item.status === 'failed')
      if (completedFastWebRuns.length) successfulProviders += 1
      job.coverage.validRuns = Number(job.coverage.validRuns || 0) + completedFastWebRuns.length
      job.coverage.failedRuns = Number(job.coverage.failedRuns || 0) + failedFastWebRuns.length
      providerErrors.push(...failedFastWebRuns.map((item) => item.error))
      finishRuntimeSource(job, 'web', completedFastWebRuns.length > 0 || failedFastWebRuns.length === 0)
      if (shouldStopForTarget(job)) appendRuntimeEvent(job, 'fast_target', `Busca rápida atingiu a meta com ${job.results.length} empresa(s) antes da varredura territorial pesada.`, { unique: job.results.length })
    }

    let cursor = 0
    while (cursor < job.plan.cells.length) {
      await waitIfPaused(job)
      if (shouldStopForTarget(job)) break
      const cell = job.plan.cells[cursor]
      cursor += 1
      if (!cell || cell.status === 'completed' || cell.status === 'subdivided') continue
      const beforeRuns = job.plan.providerRuns.length
      await runOsmCell(job, cell, seen)
      const run = job.plan.providerRuns.slice(beforeRuns).find((item) => item.provider === 'openstreetmap')
      if (run?.status === 'completed') successfulProviders += 1
      if (run?.status === 'failed') providerErrors.push(run.error)
    }

    if (job.plan.cells.length && job.plan.cells.filter((item) => item.status !== 'subdivided').every((item) => ['completed', 'failed'].includes(item.status))) {
      job.coverage.completedSources = Math.max(job.coverage.completedSources, 1)
      refreshCoverage(job)
      finishRuntimeSource(job, 'osmExact', job.coverage.failedCells < job.coverage.totalCells)
      if (ensureRuntimeTruth(job).sourceStates.osmCoverage === 'running') finishRuntimeSource(job, 'osmCoverage', true)
    }

    if (!fastWebAttempted && !shouldStopForTarget(job) && WEB_SEARCH_ENABLED && job.input.areaMode !== 'map') {
      const beforeWeb = job.plan.providerRuns.length
      await runWebPlanner(job, seen)
      const webRuns = job.plan.providerRuns.slice(beforeWeb).filter((item) => item.provider === 'web')
      const completedWebRuns = webRuns.filter((item) => item.status === 'completed')
      const failedWebRuns = webRuns.filter((item) => item.status === 'failed')
      if (completedWebRuns.length) successfulProviders += 1
      job.coverage.validRuns = Number(job.coverage.validRuns || 0) + completedWebRuns.length
      job.coverage.failedRuns = Number(job.coverage.failedRuns || 0) + failedWebRuns.length
      providerErrors.push(...failedWebRuns.map((item) => item.error))
      job.coverage.completedSources = Math.min(job.coverage.totalSources, Math.max(job.coverage.completedSources, 1) + 1)
      finishRuntimeSource(job, 'web', completedWebRuns.length > 0 || failedWebRuns.length === 0)
    }

    setRuntimePhase(job, 'finalizing', 'Consolidando duplicidades, qualidade e cobertura…')
    refreshCoverage(job)
    refreshProcessingSummary(job)
    finishRuntimeSource(job, 'enrichment', true)

    if (job.status !== 'cancelled') {
      if (!successfulProviders && !job.results.length) throw new Error(`Nenhuma fonte externa respondeu. ${providerErrors.filter(Boolean).slice(0, 3).join(' | ') || 'Verifique internet/DNS e tente novamente.'}`)
      job.status = 'completed'
      job.completedAt = now()
      if (job.input.targetMode === 'quantity' && job.results.length >= job.input.targetQuantity) job.message = `Meta atingida com ${job.results.length} empresas únicas.`
      else if (job.results.length && job.coverage.failedCells > 0) job.message = `Busca encerrada com ${job.results.length} empresas únicas · ${job.coverage.successfulTerritoryPercent}% do território pesquisado com sucesso · ${job.coverage.failedCells} célula(s) com falha.`
      else if (job.results.length) job.message = `Cobertura concluída com ${job.results.length} empresas únicas · saturação estimada ${job.coverage.saturationPercent}% (${job.coverage.saturationConfidence}).`
      else job.message = `As fontes responderam, mas não retornaram empresas para “${job.input.segment}” nas regiões informadas.`
      setRuntimePhase(job, 'completed', job.message)
      appendRuntimeEvent(job, 'run_completed', job.message, { runId: job.id, unique: job.results.length })
    }
  } catch (error) {
    if (error instanceof Error && error.message === '__cancelled__') {
      job.status = 'cancelled'
      job.completedAt = now()
      job.message = `Cancelado com ${job.results.length} resultado(s) preservado(s).`
      setRuntimePhase(job, 'cancelled', job.message)
    } else {
      job.status = 'failed'
      job.completedAt = now()
      job.error = error instanceof Error ? error.message : String(error)
      job.message = `Falha na busca automática: ${job.error}`
      job.warnings.push(job.error)
      setRuntimePhase(job, 'failed', job.message)
      appendRuntimeEvent(job, 'error', job.message, { runId: job.id })
    }
  } finally {
    job.progress.currentUrl = ''
    refreshProcessingSummary(job)
    syncRuntimeCounters(job)
    await saveState()
  }
}

async function dispatchQueue() {
  if (processing) return
  const job = state.jobs.find((item) => item.status === 'queued')
  if (!job) return
  processing = true
  try { await processJob(job) } finally { processing = false; setTimeout(dispatchQueue, 50) }
}

function nextRun(cadence, from = new Date()) {
  const date = new Date(from)
  if (cadence === 'daily') date.setDate(date.getDate() + 1)
  else date.setDate(date.getDate() + 7)
  return date.toISOString()
}

function createJob(input, source = 'manual') {
  const targetMode = input.targetMode === 'max' ? 'max' : 'quantity'
  const targetQuantity = targetMode === 'max' ? MAX_RESULTS : Math.min(MAX_RESULTS, Math.max(1, Math.round(Number(input.targetQuantity) || 50)))
  const regions = Array.isArray(input.regions) ? input.regions.map(clean).filter(Boolean).slice(0, 20) : clean(input.region).split(/[;\n]+/).map(clean).filter(Boolean).slice(0, 20)
  const workspaceId = clean(input.workspaceId)
  const historicalKeys = new Set(Array.isArray(input.existingKeys) ? input.existingKeys.filter((item) => typeof item === 'string').slice(0, MAX_EXISTING_KEYS) : [])
  for (const previous of state.jobs) {
    if (previous.workspaceId !== workspaceId) continue
    for (const result of previous.results || []) identityKeys(result).forEach((key) => historicalKeys.add(key))
    if (historicalKeys.size >= MAX_EXISTING_KEYS) break
  }
  const job = {
    id: randomUUID(),
    workspaceId,
    source,
    status: 'queued',
    input: {
      segment: clean(input.segment),
      regions,
      targetQuantity,
      targetMode,
      areaMode: ['radius', 'city', 'neighborhoods', 'map'].includes(input.areaMode) ? input.areaMode : 'radius',
      radiusKm: Math.min(100, Math.max(1, Number(input.radiusKm) || 15)),
      searchMode: ['coverage', 'fast', 'economy'].includes(input.searchMode) ? input.searchMode : 'fast',
      categoryMode: input.categoryMode === 'related' ? 'related' : 'exact',
      mapPolygon: sanitizeMapPolygon(input.mapPolygon),
      searchCenter: Number.isFinite(Number(input.searchCenter?.lat)) && Number.isFinite(Number(input.searchCenter?.lon))
        ? { lat: Number(input.searchCenter.lat), lon: Number(input.searchCenter.lon) } : null,
    },
    options: {
      enrichWeb: input.enrichWeb !== false,
      enrichCnpj: input.enrichCnpj !== false,
      browserFallback: input.browserFallback !== false,
    },
    existingKeys: [...historicalKeys].slice(0, MAX_EXISTING_KEYS),
    results: [],
    clientImportedAt: null,
    warnings: [],
    error: null,
    message: 'Na fila do Search & Processing Engine.',
    progress: { found: 0, currentRegion: '', currentSource: '', currentUrl: '' },
    stats: { discovered: 0, unique: 0, duplicates: 0, websitesVisited: 0, queries: 0, withPhone: 0, withEmail: 0, withInstagram: 0, withWebsite: 0, withCnpj: 0, webDocuments: 0, webPlaceCandidates: 0, webRejectedDocuments: 0, scopeRejectedCategory: 0, scopeRejectedLocation: 0, scopeRejectedOther: 0 },
    rejections: [],
    plan: { expandedQueries: [], ontology: buildSearchOntologyPlan(input.segment), cells: [], providerRuns: [], geometry: null, plannedAt: null },
    coverage: emptyCoverage(),
    processing: emptyProcessing(),
    reviewStream: { revision: 0, acknowledgedRevision: 0, readyCandidates: 0, lastPublishedAt: null, lastAcknowledgedAt: null },
    runtime: emptyRuntimeTruth(''),
    createdAt: now(), startedAt: null, completedAt: null,
  }
  job.runtime = emptyRuntimeTruth(job.id)
  appendRuntimeEvent(job, 'queued', 'Execução criada e aguardando o motor local.', { runId: job.id })
  if (!job.workspaceId || !job.input.segment || !job.input.regions.length) throw new Error('workspaceId, segmento e região são obrigatórios.')
  if (job.input.areaMode === 'map' && job.input.mapPolygon.length < 3) throw new Error('Desenhe uma área válida no mapa antes de iniciar o Garimpo.')
  state.jobs.unshift(job)
  state.jobs = state.jobs.slice(0, 200)
  void saveState()
  setTimeout(dispatchQueue, 10)
  return job
}

async function campaignTick() {
  const current = Date.now()
  for (const campaign of state.campaigns) {
    if (!campaign.active || !campaign.nextRunAt || new Date(campaign.nextRunAt).getTime() > current) continue
    const duplicate = state.jobs.some((job) => job.campaignId === campaign.id && ['queued', 'running', 'paused'].includes(job.status))
    if (!duplicate) {
      const job = createJob({ ...campaign.input, existingKeys: campaign.existingKeys }, 'campaign')
      job.campaignId = campaign.id
      campaign.lastRunAt = now()
    }
    campaign.nextRunAt = nextRun(campaign.cadence)
  }
  await saveState()
  setTimeout(campaignTick, 15000)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk; if (raw.length > MAX_BODY) { reject(new Error('Payload muito grande.')); req.destroy() } })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) } })
    req.on('error', reject)
  })
}

function allowedOrigin(origin) {
  if (!origin) return true
  try {
    const url = new URL(origin)
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  } catch { return false }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  if (!allowedOrigin(origin)) return json(res, { error: 'origin_not_allowed' }, 403)
  res.setHeader('access-control-allow-origin', origin || 'http://127.0.0.1')
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type, x-realtalent-prospecting-token')
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (RUNTIME_TOKEN && !secureEqual(suppliedRuntimeToken(req), RUNTIME_TOKEN)) return json(res, { error:'unauthorized_runtime' }, 401)
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
  const pathname = url.pathname
  try {
    if (req.method === 'GET' && pathname === '/') return html(res, agentDashboardHtml())
    if (req.method === 'GET' && pathname === '/favicon.ico') { res.statusCode = 204; return res.end() }
    if (req.method === 'GET' && pathname === '/api/prospecting-agent/health') {
      return json(res, {
        ok: true, version: VERSION, pid: process.pid, host: HOST, port: PORT,
        stateFile: STATE_FILE, chromium: Boolean(CHROMIUM), chromiumBinary: CHROMIUM,
        providers: { placeFirstSearch: true, searchOntology: true, strictScope: true, territoryEngine2: true, coverageExpansion: true, runtimeTruth: true, openstreetmap: true, webDiscovery: WEB_SEARCH_ENABLED, websiteCrawler: true, websiteDiscovery: WEB_SEARCH_ENABLED, contactDiscovery: true, cnpjEnrichment: true, cnpjDiscovery: true, socialDiscovery: true, chromiumHeadless: Boolean(CHROMIUM) },
        featureVersion: H21_RUNTIME_VERSION,
        ontology: { version: SEARCH_ONTOLOGY_VERSION, intents: searchOntology.length },
        strictScope: { version: STRICT_SCOPE_VERSION, defaultCategoryMode: 'exact', categoryGate: true, localityGate: true, contentGate: true },
        territoryEngine: { version: '2.0.0', maxSubdivisionLevel: MAX_SUBDIVISION_LEVEL, maxCells: MAX_SEARCH_CELLS, weightedCoverage: true, radiusGeometry: true },
        providerStatus: providerRuntime,
        queued: state.jobs.filter((job) => job.status === 'queued').length,
        running: state.jobs.filter((job) => job.status === 'running').length,
        checkedAt: now(),
      })
    }
    if (req.method === 'GET' && pathname === '/api/prospecting-agent/territory/preview') {
      const region = clean(url.searchParams.get('region'))
      if (!region) return json(res, { error: 'region_required', message: 'Informe uma cidade ou região para carregar o mapa.' }, 400)
      const geo = await geocodeRegion(region)
      return json(res, {
        region,
        displayName: geo.displayName || region,
        center: { lat: geo.lat, lon: geo.lon },
        bbox: { south: geo.south, north: geo.north, west: geo.west, east: geo.east },
      })
    }
    if (req.method === 'GET' && pathname === '/api/prospecting-agent/jobs') {
      const workspaceId = clean(url.searchParams.get('workspaceId'))
      const jobs = state.jobs.filter((job) => !workspaceId || job.workspaceId === workspaceId).map(({ existingKeys, ...job }) => job)
      return json(res, { jobs })
    }
    if (req.method === 'POST' && pathname === '/api/prospecting-agent/jobs') {
      const body = await readBody(req)
      return json(res, { job: createJob(body) }, 201)
    }
    const reviewMatch = pathname.match(/^\/api\/prospecting-agent\/jobs\/([^/]+)\/review(?:\/(ack))?$/)
    if (reviewMatch) {
      const job = state.jobs.find((item) => item.id === reviewMatch[1])
      if (!job) return json(res, { error: 'job_not_found' }, 404)
      if (req.method === 'GET' && !reviewMatch[2]) {
        const afterRevision = Math.max(0, Number(url.searchParams.get('afterRevision')) || 0)
        const limit = Math.max(1, Number(url.searchParams.get('limit')) || 50)
        return json(res, progressiveReviewBatch(job, afterRevision, limit))
      }
      if (req.method === 'POST' && reviewMatch[2] === 'ack') {
        const body = await readBody(req)
        const reviewStream = acknowledgeProgressiveReview(job, body.revision)
        await saveState()
        return json(res, { job: { ...job, existingKeys: undefined }, reviewStream })
      }
      return json(res, { error: 'invalid_review_transition' }, 409)
    }
    const enrichmentMatch = pathname.match(/^\/api\/prospecting-agent\/jobs\/([^/]+)\/candidates\/([^/]+)\/enrichment\/(website|contacts|cnpj|social)\/retry$/)
    if (req.method === 'POST' && enrichmentMatch) {
      const job = state.jobs.find((item) => item.id === enrichmentMatch[1])
      if (!job) return json(res, { error: 'job_not_found' }, 404)
      const candidate = await reprocessEnrichmentTask(job, enrichmentMatch[2], enrichmentMatch[3])
      return json(res, { job: { ...job, existingKeys: undefined }, candidate })
    }
    const jobMatch = pathname.match(/^\/api\/prospecting-agent\/jobs\/([^/]+)(?:\/(pause|resume|cancel|imported|results))?$/)
    if (jobMatch) {
      const job = state.jobs.find((item) => item.id === jobMatch[1])
      if (!job) return json(res, { error: 'job_not_found' }, 404)
      const action = jobMatch[2]
      if (req.method === 'GET' && (!action || action === 'results')) return json(res, { job: { ...job, existingKeys: undefined } })
      if (req.method === 'POST' && action === 'pause' && job.status === 'running') { job.status = 'paused'; job.message = 'Pausado pelo usuário.'; setRuntimePhase(job, 'paused', job.message); await saveState(); return json(res, { job }) }
      if (req.method === 'POST' && action === 'resume' && job.status === 'paused') { job.status = 'queued'; job.message = 'Retomando…'; setRuntimePhase(job, 'queued', job.message); await saveState(); setTimeout(dispatchQueue, 10); return json(res, { job }) }
      if (req.method === 'POST' && action === 'cancel' && ['queued','running','paused'].includes(job.status)) { job.status = 'cancelled'; job.completedAt = now(); job.message = `Cancelado com ${job.results.length} resultado(s) preservado(s).`; setRuntimePhase(job, 'cancelled', job.message); await saveState(); return json(res, { job }) }
      if (req.method === 'POST' && action === 'imported') { job.clientImportedAt = now(); await saveState(); return json(res, { job }) }
      return json(res, { error: 'invalid_job_transition', status: job.status }, 409)
    }
    if (req.method === 'GET' && pathname === '/api/prospecting-agent/campaigns') {
      const workspaceId = clean(url.searchParams.get('workspaceId'))
      return json(res, { campaigns: state.campaigns.filter((item) => !workspaceId || item.workspaceId === workspaceId) })
    }
    if (req.method === 'POST' && pathname === '/api/prospecting-agent/campaigns') {
      const body = await readBody(req)
      const cadence = body.cadence === 'daily' ? 'daily' : 'weekly'
      const campaign = {
        id: randomUUID(), workspaceId: clean(body.workspaceId), name: clean(body.name) || `${clean(body.segment)} · ${clean((body.regions || []).join('; '))}`,
        cadence, active: true,
        input: {
          segment: clean(body.segment),
          regions: Array.isArray(body.regions) ? body.regions.map(clean).filter(Boolean).slice(0,20) : [],
          targetQuantity: body.targetMode === 'max' ? MAX_RESULTS : Math.min(MAX_RESULTS, Math.max(1, Number(body.targetQuantity) || 50)),
          targetMode: body.targetMode === 'max' ? 'max' : 'quantity',
          areaMode: ['radius','city','neighborhoods','map'].includes(body.areaMode) ? body.areaMode : 'radius',
          radiusKm: Math.min(100, Math.max(1, Number(body.radiusKm) || 15)),
          searchMode: ['coverage','fast','economy'].includes(body.searchMode) ? body.searchMode : 'fast',
          categoryMode: body.categoryMode === 'related' ? 'related' : 'exact',
          mapPolygon: sanitizeMapPolygon(body.mapPolygon),
          searchCenter: Number.isFinite(Number(body.searchCenter?.lat)) && Number.isFinite(Number(body.searchCenter?.lon))
            ? { lat: Number(body.searchCenter.lat), lon: Number(body.searchCenter.lon) } : null,
          enrichWeb: body.enrichWeb !== false,
          enrichCnpj: body.enrichCnpj !== false,
          browserFallback: body.browserFallback !== false,
        },
        existingKeys: Array.isArray(body.existingKeys) ? body.existingKeys.filter((item) => typeof item === 'string').slice(0, MAX_EXISTING_KEYS) : [],
        createdAt: now(), lastRunAt: null, nextRunAt: nextRun(cadence),
      }
      if (!campaign.workspaceId || !campaign.input.segment || !campaign.input.regions.length) return json(res, { error: 'invalid_campaign', message: 'Workspace, segmento e regiões são obrigatórios.' }, 400)
      if (campaign.input.areaMode === 'map' && campaign.input.mapPolygon.length < 3) return json(res, { error: 'invalid_campaign_geometry', message: 'A campanha exige uma área válida desenhada no mapa.' }, 400)
      state.campaigns.unshift(campaign)
      await saveState()
      return json(res, { campaign }, 201)
    }
    const campaignMatch = pathname.match(/^\/api\/prospecting-agent\/campaigns\/([^/]+)\/toggle$/)
    if (req.method === 'POST' && campaignMatch) {
      const campaign = state.campaigns.find((item) => item.id === campaignMatch[1])
      if (!campaign) return json(res, { error: 'campaign_not_found' }, 404)
      campaign.active = !campaign.active
      if (campaign.active && new Date(campaign.nextRunAt).getTime() < Date.now()) campaign.nextRunAt = nextRun(campaign.cadence)
      await saveState()
      return json(res, { campaign })
    }
    return json(res, { error: 'not_found' }, 404)
  } catch (error) {
    return json(res, { error: 'prospecting_agent_error', message: error instanceof Error ? error.message : String(error) }, 500)
  }
})

await loadState()
server.listen(PORT, HOST, () => {
  console.log(`RealTalent Prospecting Agent V${VERSION}`)
  console.log(`API: http://${HOST}:${PORT}`)
  console.log(`State: ${STATE_FILE}`)
  console.log(`Chromium headless: ${CHROMIUM || 'não encontrado (crawler HTTP continua ativo)'}`)
  console.log('Política: somente páginas públicas; sem login, CAPTCHA ou bypass de bloqueios.')
  setTimeout(dispatchQueue, 10)
  setTimeout(campaignTick, 15000)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
