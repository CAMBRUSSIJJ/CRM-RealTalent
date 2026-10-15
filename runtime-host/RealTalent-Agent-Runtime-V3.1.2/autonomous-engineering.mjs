import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const STATE_DIR = process.env.REALTALENT_AGENT_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'realtalent-agent')
const CASES_FILE = path.join(STATE_DIR, 'engineering-cases.json')

const clean = (value, max = 6000) => String(value ?? '').trim().slice(0, max)
const nowIso = () => new Date().toISOString()
const ensureDir = () => { fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 }) }
const safeRead = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const writeAtomic = (file, value) => {
  ensureDir(); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file); try { fs.chmodSync(file, 0o600) } catch {}
}

export const engineeringInfo = {
  version: '1.10.0',
  store: CASES_FILE,
  maxBuilderRecoveryAttempts: 3,
  phases: ['investigation', 'baseline_qa', 'approval', 'sandbox_build', 'verification'],
  guarantees: ['root-cause-hypotheses-before-write', 'human-write-approval', 'sandbox-before-promotion', 'rollback-on-qa-failure', 'before-after-evidence'],
}

export function loadEngineeringStore() {
  const raw = safeRead(CASES_FILE, { version: 1, cases: [] })
  return { version: 1, cases: Array.isArray(raw.cases) ? raw.cases.slice(-80) : [] }
}

export function upsertEngineeringCase(engineeringCase) {
  const store = loadEngineeringStore()
  const item = { ...engineeringCase, updatedAt: nowIso() }
  const index = store.cases.findIndex((x) => x.id === item.id)
  if (index >= 0) store.cases[index] = item
  else store.cases.push(item)
  store.cases = store.cases.slice(-80)
  writeAtomic(CASES_FILE, store)
  return item
}

export function engineeringCaseById(id) {
  return loadEngineeringStore().cases.find((item) => item.id === id) || null
}

export function createEngineeringCase({ product, objective, investigation, impact = null, projectBrain = null, baselineQaId = null }) {
  if (!['crm', 'blue_ocean'].includes(product)) throw new Error('Produto inválido para Autonomous Engineering.')
  const text = clean(objective, 8000)
  if (!text) throw new Error('Objetivo de engenharia vazio.')
  const now = nowIso()
  const item = {
    id: `eng_${crypto.randomUUID()}`,
    version: 1,
    product,
    objective: text,
    status: baselineQaId ? 'investigating' : 'awaiting_approval',
    phase: baselineQaId ? 'baseline_qa' : 'approval',
    createdAt: now,
    updatedAt: now,
    investigation: investigation || null,
    impact: impact || null,
    projectBrain: projectBrain || null,
    baselineQaId,
    baseline: null,
    approvalId: null,
    builderJobId: null,
    finalQaId: null,
    builderResult: null,
    attempts: 0,
    error: '',
    summary: '',
    events: [
      { at: now, type: 'investigation', message: 'Project Brain e Root Cause Engine prepararam hipóteses antes de qualquer escrita.' },
      ...(baselineQaId ? [{ at: now, type: 'baseline_qa', message: 'Browser QA baseline iniciado em modo somente observação.' }] : []),
    ],
  }
  return upsertEngineeringCase(item)
}

export function addEngineeringEvent(engineeringCase, type, message, extra = {}) {
  engineeringCase.events = Array.isArray(engineeringCase.events) ? engineeringCase.events : []
  engineeringCase.events.push({ at: nowIso(), type: clean(type, 80), message: clean(message, 900), ...extra })
  engineeringCase.events = engineeringCase.events.slice(-120)
  return engineeringCase
}

export function builderObjectiveForEngineering(engineeringCase) {
  const hypotheses = Array.isArray(engineeringCase?.investigation?.hypotheses) ? engineeringCase.investigation.hypotheses.slice(0, 3) : []
  const evidence = hypotheses.map((h, index) => `${index + 1}. ${clean(h.hypothesis, 800)} (confiança ${Math.round(Number(h.confidence || 0) * 100)}%)\nEvidências: ${(h.evidence || []).map((e) => e.path).filter(Boolean).slice(0, 5).join(', ') || 'não conclusivas'}`).join('\n')
  const impact = engineeringCase?.impact
  const baseline = engineeringCase?.baseline
  return clean(`AUTONOMOUS ENGINEERING V1.9\nObjetivo do usuário: ${engineeringCase.objective}\n\nInvestigação prévia — hipóteses, NÃO fatos confirmados:\n${evidence || 'Sem hipótese estática forte; investigue os arquivos candidatos antes de alterar.'}\n\nImpacto estrutural estimado:\n${JSON.stringify(impact || {}).slice(0, 3600)}\n\nBaseline Browser QA:\n${JSON.stringify(baseline || {}).slice(0, 2200)}\n\nRegras de execução:\n- Faça a menor correção segura compatível com as evidências.\n- Valide em sandbox antes de promover.\n- Use os erros reais dos gates para Auto-Recovery, no máximo 3 tentativas.\n- Não trate hipótese estática como causa confirmada sem evidência do código/testes.\n- Se não houver evidência suficiente, não invente alteração; retorne NEEDS_USER/NO_CHANGE.`, 6000)
}

export function publicEngineeringCase(item) {
  if (!item) return null
  return {
    id: item.id, product: item.product, objective: item.objective, status: item.status, phase: item.phase,
    createdAt: item.createdAt, updatedAt: item.updatedAt, attempts: Number(item.attempts || 0),
    baselineQaId: item.baselineQaId || null, approvalId: item.approvalId || null, builderJobId: item.builderJobId || null, finalQaId: item.finalQaId || null,
    investigation: item.investigation || null, impact: item.impact || null, baseline: item.baseline || null,
    builderResult: item.builderResult || null, summary: item.summary || '', error: item.error || '', events: (item.events || []).slice(-40),
  }
}

export function engineeringList() {
  return loadEngineeringStore().cases.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).map(publicEngineeringCase)
}

export function resetEngineeringStoreForTest() {
  writeAtomic(CASES_FILE, { version: 1, cases: [] })
}
