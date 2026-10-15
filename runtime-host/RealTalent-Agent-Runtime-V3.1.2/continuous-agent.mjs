import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const STATE_DIR = process.env.REALTALENT_AGENT_STATE_DIR || path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'realtalent-agent')
export const CONTINUOUS_MONITORS_FILE = path.join(STATE_DIR, 'continuous-monitors.json')
export const CONTINUOUS_RUNS_FILE = path.join(STATE_DIR, 'continuous-runs.json')
export const CONTINUOUS_FINDINGS_FILE = path.join(STATE_DIR, 'continuous-findings.json')
export const CONTINUOUS_STATE_FILE = path.join(STATE_DIR, 'continuous-state.json')

const nowIso = () => new Date().toISOString()
const clean = (value, max = 5000) => String(value ?? '').trim().slice(0, max)
const ensureDir = () => fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const write = (file, value) => {
  ensureDir(); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file); try { fs.chmodSync(file, 0o600) } catch {}
}

export const continuousInfo = {
  version: '2.0.0',
  policy: {
    automatic: ['observe', 'health', 'qa', 'static_root_cause'],
    approvalRequired: ['builder', 'promote', 'deploy', 'external_mutation'],
    maxConcurrentMonitors: 1,
    lightHardwareAware: true,
  },
  stores: {
    monitors: CONTINUOUS_MONITORS_FILE,
    runs: CONTINUOUS_RUNS_FILE,
    findings: CONTINUOUS_FINDINGS_FILE,
    state: CONTINUOUS_STATE_FILE,
  },
}

export function loadContinuousState() {
  const raw = read(CONTINUOUS_STATE_FILE, { version: 1, paused: false, lastTickAt: null, lastRunAt: null, schedulerStartedAt: null })
  return { version: 1, paused: Boolean(raw.paused), lastTickAt: raw.lastTickAt || null, lastRunAt: raw.lastRunAt || null, schedulerStartedAt: raw.schedulerStartedAt || null }
}
export function saveContinuousState(next) { const value = { ...loadContinuousState(), ...next }; write(CONTINUOUS_STATE_FILE, value); return value }

export function loadMonitorStore() { const raw = read(CONTINUOUS_MONITORS_FILE, { version: 1, monitors: [] }); return { version: 1, monitors: Array.isArray(raw.monitors) ? raw.monitors.slice(-120) : [] } }
export function saveMonitorStore(store) { const value = { version: 1, monitors: Array.isArray(store?.monitors) ? store.monitors.slice(-120) : [] }; write(CONTINUOUS_MONITORS_FILE, value); return value }
export function upsertMonitor(monitor) { const store = loadMonitorStore(); const item = { ...monitor, updatedAt: nowIso() }; const i = store.monitors.findIndex(x => x.id === item.id); if (i >= 0) store.monitors[i] = item; else store.monitors.push(item); saveMonitorStore(store); return item }
export function monitorById(id) { return loadMonitorStore().monitors.find(x => x.id === id) || null }

export function loadRunStore() { const raw = read(CONTINUOUS_RUNS_FILE, { version: 1, runs: [] }); return { version: 1, runs: Array.isArray(raw.runs) ? raw.runs.slice(-300) : [] } }
export function upsertRun(run) { const store = loadRunStore(); const item = { ...run, updatedAt: nowIso() }; const i = store.runs.findIndex(x => x.id === item.id); if (i >= 0) store.runs[i] = item; else store.runs.push(item); store.runs = store.runs.slice(-300); write(CONTINUOUS_RUNS_FILE, store); return item }
export function runById(id) { return loadRunStore().runs.find(x => x.id === id) || null }

export function loadFindingStore() { const raw = read(CONTINUOUS_FINDINGS_FILE, { version: 1, findings: [] }); return { version: 1, findings: Array.isArray(raw.findings) ? raw.findings.slice(-300) : [] } }
const findingFingerprint = (input) => crypto.createHash('sha256').update(JSON.stringify([input.monitorId || '', input.product || '', input.category || '', input.title || ''])).digest('hex').slice(0, 24)
export function recordFinding(input) {
  const store = loadFindingStore(); const fp = input.fingerprint || findingFingerprint(input); const existing = store.findings.find(x => x.fingerprint === fp && x.status !== 'resolved')
  if (existing) {
    Object.assign(existing, input, { id: existing.id, fingerprint: fp, firstSeenAt: existing.firstSeenAt, lastSeenAt: nowIso(), occurrenceCount: Number(existing.occurrenceCount || 1) + 1, updatedAt: nowIso() })
    write(CONTINUOUS_FINDINGS_FILE, store); return existing
  }
  const finding = { id: `finding_${crypto.randomUUID()}`, fingerprint: fp, monitorId: input.monitorId || null, runId: input.runId || null, product: input.product || null, category: clean(input.category || 'monitor', 100), severity: ['low','medium','high','critical'].includes(input.severity) ? input.severity : 'medium', title: clean(input.title || 'Achado de monitoramento', 220), summary: clean(input.summary || '', 2600), evidence: input.evidence || null, investigation: input.investigation || null, status: input.status || 'open', firstSeenAt: nowIso(), lastSeenAt: nowIso(), occurrenceCount: 1, createdAt: nowIso(), updatedAt: nowIso() }
  store.findings.push(finding); store.findings = store.findings.slice(-300); write(CONTINUOUS_FINDINGS_FILE, store); return finding
}
export function updateFinding(id, patch = {}) { const store = loadFindingStore(); const item = store.findings.find(x => x.id === id); if (!item) return null; Object.assign(item, patch, { updatedAt: nowIso() }); write(CONTINUOUS_FINDINGS_FILE, store); return item }
export function findingById(id) { return loadFindingStore().findings.find(x => x.id === id) || null }

const cadenceMinutes = (cadence) => ({ hourly: 60, every_6_hours: 360, daily: 1440, weekly: 10080 }[cadence] || null)
export function computeNextRunAt(monitor, from = new Date()) {
  if (!monitor.enabled || monitor.cadence === 'manual' || monitor.cadence === 'event') return null
  const base = new Date(from)
  const interval = Number(monitor.intervalMinutes || cadenceMinutes(monitor.cadence) || 0)
  if (monitor.cadence === 'daily' && /^\d{2}:\d{2}$/.test(String(monitor.localTime || ''))) {
    const [hh, mm] = String(monitor.localTime).split(':').map(Number); const next = new Date(base); next.setHours(hh, mm, 0, 0); if (next <= base) next.setDate(next.getDate() + 1); return next.toISOString()
  }
  if (monitor.cadence === 'weekly' && /^\d{2}:\d{2}$/.test(String(monitor.localTime || ''))) {
    const [hh, mm] = String(monitor.localTime).split(':').map(Number); const next = new Date(base); next.setHours(hh, mm, 0, 0); next.setDate(next.getDate() + 7); return next.toISOString()
  }
  return interval > 0 ? new Date(base.getTime() + interval * 60_000).toISOString() : null
}

export function createMonitor(input = {}) {
  const now = new Date(); const cadence = ['manual','hourly','every_6_hours','daily','weekly','event'].includes(input.cadence) ? input.cadence : 'manual'
  const monitor = {
    id: `monitor_${crypto.randomUUID()}`,
    title: clean(input.title || 'Monitor RealTalent', 180),
    kind: ['product_health','browser_qa','project_health','http_latency','standing_objective_review','event_regression'].includes(input.kind) ? input.kind : 'product_health',
    product: ['crm','blue_ocean'].includes(input.product) ? input.product : null,
    target: clean(input.target || '', 160),
    objective: clean(input.objective || '', 3000),
    cadence,
    localTime: clean(input.localTime || '', 8),
    intervalMinutes: Number(input.intervalMinutes || cadenceMinutes(cadence) || 0),
    enabled: input.enabled !== false,
    autoInvestigate: Boolean(input.autoInvestigate),
    heavy: Boolean(input.heavy),
    event: cadence === 'event' ? clean(input.event || 'builder_completed', 80) : null,
    config: input.config && typeof input.config === 'object' ? input.config : {},
    createdAt: now.toISOString(), updatedAt: now.toISOString(), lastRunAt: null, nextRunAt: null, lastStatus: 'never', lastSummary: '', lastRunId: null,
  }
  monitor.nextRunAt = computeNextRunAt(monitor, now)
  return upsertMonitor(monitor)
}

export function bootstrapDefaultMonitors() {
  const current = loadMonitorStore(); if (current.monitors.length) return current.monitors
  const defs = [
    { title: 'CRM Daily Health', kind: 'product_health', product: 'crm', target: 'crm', cadence: 'daily', localTime: '07:30', enabled: true, autoInvestigate: true, heavy: false, objective: 'Verificar workspace, Project Brain, saúde estrutural e disponibilidade do CRM. Não modificar dados nem código.' },
    { title: 'Project Brain Drift', kind: 'project_health', product: 'crm', target: 'project_brain', cadence: 'every_6_hours', enabled: true, autoInvestigate: false, heavy: false, objective: 'Sincronizar Project Brain incrementalmente e registrar mudanças estruturais relevantes.' },
    { title: 'WhatsApp Watch', kind: 'browser_qa', product: 'crm', target: 'communications', cadence: 'hourly', enabled: false, autoInvestigate: true, heavy: true, objective: 'Observar Communications/WhatsApp em modo somente leitura: disponibilidade, console, rede, duplicidades visíveis e regressões. Não enviar mensagens.' },
    { title: 'Blue Ocean QA', kind: 'browser_qa', product: 'blue_ocean', target: 'blue_ocean', cadence: 'daily', localTime: '08:00', enabled: false, autoInvestigate: true, heavy: true, objective: 'Executar Browser QA somente observação nas superfícies críticas do Blue Ocean e comparar regressões.' },
    { title: 'Production Regression', kind: 'event_regression', product: null, target: 'post_builder', cadence: 'event', event: 'builder_completed', enabled: true, autoInvestigate: true, heavy: true, objective: 'Após Builder concluído, executar verificação de regressão somente observação no produto afetado.' },
  ]
  return defs.map(createMonitor)
}

export function dueMonitors(at = new Date()) {
  const now = at.getTime(); return loadMonitorStore().monitors.filter(m => m.enabled && m.nextRunAt && Date.parse(m.nextRunAt) <= now).sort((a,b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt))
}
export function eventMonitors(event, product = null) { return loadMonitorStore().monitors.filter(m => m.enabled && m.cadence === 'event' && m.event === event && (!m.product || !product || m.product === product)) }
export function markMonitorStarted(monitor, runId, at = new Date()) { monitor.lastRunAt = at.toISOString(); monitor.lastRunId = runId; monitor.lastStatus = 'running'; monitor.nextRunAt = computeNextRunAt(monitor, at); return upsertMonitor(monitor) }
export function markMonitorFinished(monitor, status, summary, runId) { monitor.lastStatus = status; monitor.lastSummary = clean(summary, 1800); monitor.lastRunId = runId || monitor.lastRunId; return upsertMonitor(monitor) }

export function publicContinuousState() {
  const state = loadContinuousState(); const monitors = loadMonitorStore().monitors.slice().sort((a,b) => String(a.nextRunAt || '9999').localeCompare(String(b.nextRunAt || '9999'))); const runs = loadRunStore().runs.slice().sort((a,b) => String(b.startedAt || '').localeCompare(String(a.startedAt || ''))); const findings = loadFindingStore().findings.slice().sort((a,b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
  return { enabled: true, version: continuousInfo.version, policy: continuousInfo.policy, scheduler: state, monitors, activeRuns: runs.filter(r => ['starting','running','waiting_qa'].includes(r.status)), recentRuns: runs.slice(0, 40), findings: { open: findings.filter(f => f.status === 'open'), acknowledged: findings.filter(f => f.status === 'acknowledged').slice(0,40), recent: findings.slice(0,80) } }
}

export function resetContinuousForTest() {
  ensureDir(); write(CONTINUOUS_MONITORS_FILE, { version: 1, monitors: [] }); write(CONTINUOUS_RUNS_FILE, { version: 1, runs: [] }); write(CONTINUOUS_FINDINGS_FILE, { version: 1, findings: [] }); write(CONTINUOUS_STATE_FILE, { version: 1, paused: false, lastTickAt: null, lastRunAt: null, schedulerStartedAt: null })
}
