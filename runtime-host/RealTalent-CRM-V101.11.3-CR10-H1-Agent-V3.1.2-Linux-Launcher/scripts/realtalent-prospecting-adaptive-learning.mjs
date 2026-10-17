export const ADAPTIVE_LEARNING_VERSION = '4.2'

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')
const norm = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const round = (value) => Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000
const emptyMetric = () => ({ attempts: 0, discovered: 0, accepted: 0, rejected: 0, duplicates: 0, ready: 0, attention: 0, yieldRate: 0, duplicateRate: 0, qualityRate: 0, score: 0, state: 'learning', lastRunAt: null })

export function emptyAdaptiveLearning() {
  return { version: ADAPTIVE_LEARNING_VERSION, perQuery: {}, perSource: {}, perCell: {}, bestQuery: null, bestSource: null, adaptations: [] }
}

function recalc(metric) {
  const discovered = Math.max(1, metric.discovered)
  const accepted = Math.max(1, metric.accepted)
  metric.yieldRate = round(metric.accepted / discovered)
  metric.duplicateRate = round(metric.duplicates / discovered)
  metric.qualityRate = round((metric.ready + metric.attention * 0.35) / accepted)
  metric.score = round(metric.yieldRate * 0.58 + metric.qualityRate * 0.32 - metric.duplicateRate * 0.34)
  if (metric.discovered >= 5 && metric.duplicateRate >= 0.65) metric.state = 'duplicate_heavy'
  else if (metric.discovered >= 5 && metric.yieldRate < 0.15) metric.state = 'low_yield'
  else if (metric.discovered >= 5 && metric.yieldRate >= 0.5 && metric.accepted >= 2) metric.state = 'high_yield'
  else metric.state = 'learning'
}

const normalizeMetric = (raw = {}) => {
  const metric = { ...emptyMetric(), ...(raw || {}) }
  for (const key of ['attempts','discovered','accepted','rejected','duplicates','ready','attention']) metric[key] = Math.max(0, Number(metric[key]) || 0)
  recalc(metric)
  return metric
}

export function normalizeAdaptiveLearning(raw) {
  const learning = { ...emptyAdaptiveLearning(), ...(raw && typeof raw === 'object' ? raw : {}) }
  learning.version = ADAPTIVE_LEARNING_VERSION
  for (const bucket of ['perQuery','perSource','perCell']) {
    const source = learning[bucket] && typeof learning[bucket] === 'object' ? learning[bucket] : {}
    learning[bucket] = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, normalizeMetric(value)]))
  }
  learning.adaptations = Array.isArray(learning.adaptations) ? learning.adaptations.slice(-80) : []
  learning.bestQuery = clean(learning.bestQuery) || null
  learning.bestSource = clean(learning.bestSource) || null
  return learning
}

export function captureAdaptiveCounters(job) {
  return {
    accepted: Math.max(0, Number(job?.stats?.unique) || 0),
    duplicates: Math.max(0, Number(job?.stats?.duplicates) || 0),
    rejected: Math.max(0, Number(job?.stats?.scopeRejectedCategory || 0) + Number(job?.stats?.scopeRejectedLocation || 0) + Number(job?.stats?.scopeRejectedOther || 0) + Number(job?.stats?.webRejectedDocuments || 0)),
    ready: Math.max(0, Number(job?.processing?.ready) || 0),
    attention: Math.max(0, Number(job?.processing?.attention) || 0),
  }
}

function metricFor(learning, bucket, key) {
  const normalized = clean(key) || 'unknown'
  learning[bucket][normalized] = normalizeMetric(learning[bucket][normalized])
  return learning[bucket][normalized]
}

function addSample(metric, sample) {
  metric.attempts += 1
  for (const key of ['discovered','accepted','rejected','duplicates','ready','attention']) metric[key] += Math.max(0, Number(sample[key]) || 0)
  metric.lastRunAt = new Date().toISOString()
  recalc(metric)
}

function addDecision(learning, type, scope, key, message, metric) {
  const signature = `${type}:${scope}:${key}`
  if (learning.adaptations.some((item) => item.signature === signature)) return null
  const item = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`, signature, type, scope, key, message, at: new Date().toISOString(), metrics: { yieldRate: metric.yieldRate, duplicateRate: metric.duplicateRate, qualityRate: metric.qualityRate, score: metric.score, discovered: metric.discovered, accepted: metric.accepted } }
  learning.adaptations.push(item)
  learning.adaptations = learning.adaptations.slice(-80)
  return item
}

const delta = (after, before, key) => Math.max(0, Number(after?.[key] || 0) - Number(before?.[key] || 0))

export function recordAdaptiveRun(job, context, before, after) {
  if (!job.runtime || typeof job.runtime !== 'object') job.runtime = {}
  const learning = job.runtime.learning = normalizeAdaptiveLearning(job.runtime.learning)
  const sample = {
    discovered: Math.max(0, Number(context?.discovered) || 0),
    accepted: delta(after, before, 'accepted'),
    rejected: delta(after, before, 'rejected'),
    duplicates: delta(after, before, 'duplicates'),
    ready: delta(after, before, 'ready'),
    attention: delta(after, before, 'attention'),
  }
  const touched = []
  const query = clean(context?.query); const source = clean(context?.source); const cellId = clean(context?.cellId)
  if (query) { const metric = metricFor(learning, 'perQuery', query); addSample(metric, sample); touched.push(['query', query, metric]) }
  if (source) { const metric = metricFor(learning, 'perSource', source); addSample(metric, sample); touched.push(['source', source, metric]) }
  if (cellId) { const metric = metricFor(learning, 'perCell', cellId); addSample(metric, sample); touched.push(['cell', cellId, metric]) }
  const decisions = []
  for (const [scope, key, metric] of touched) {
    let item = null
    if (metric.state === 'duplicate_heavy') item = addDecision(learning, 'stopped_duplicate_heavy', scope, key, `${scope === 'query' ? 'Consulta' : scope === 'source' ? 'Fonte' : 'Célula'} “${key}” ficou dominada por duplicidades e será evitada nas próximas tentativas.`, metric)
    else if (metric.state === 'low_yield') item = addDecision(learning, scope === 'source' ? 'deprioritized_source' : 'deprioritized_query', scope, key, `${scope === 'query' ? 'Consulta' : scope === 'source' ? 'Fonte' : 'Célula'} “${key}” teve baixo rendimento e perdeu prioridade.`, metric)
    else if (metric.state === 'high_yield') item = addDecision(learning, scope === 'source' ? 'promoted_source' : 'promoted_query', scope, key, `${scope === 'query' ? 'Consulta' : scope === 'source' ? 'Fonte' : 'Célula'} “${key}” está trazendo empresas válidas e ganhou prioridade.`, metric)
    if (item) decisions.push(item)
  }
  const rankedQueries = Object.entries(learning.perQuery).filter(([,m]) => m.attempts > 0).sort((a,b) => b[1].score - a[1].score)
  const rankedSources = Object.entries(learning.perSource).filter(([,m]) => m.attempts > 0).sort((a,b) => b[1].score - a[1].score)
  learning.bestQuery = rankedQueries[0]?.[0] || null
  learning.bestSource = rankedSources[0]?.[0] || null
  return { learning, sample, decisions }
}

export function getAdaptiveMetric(job, scope, key) {
  const learning = normalizeAdaptiveLearning(job?.runtime?.learning)
  const bucket = scope === 'query' ? learning.perQuery : scope === 'source' ? learning.perSource : learning.perCell
  return bucket[clean(key)] || null
}

export function adaptiveQueryPriority(job, query, explicitQuery = '') {
  const metric = getAdaptiveMetric(job, 'query', query)
  const explicit = norm(query) === norm(explicitQuery)
  if (explicit && (!metric || metric.attempts === 0)) return 10000
  if (!metric) return 100
  const stateBoost = metric.state === 'high_yield' ? 400 : metric.state === 'low_yield' ? -350 : metric.state === 'duplicate_heavy' ? -700 : 0
  return Math.round(metric.score * 1000) + stateBoost + (explicit ? 50 : 0)
}

export function shouldSkipAdaptiveQuery(job, query, explicitQuery = '') {
  const metric = getAdaptiveMetric(job, 'query', query)
  if (!metric) return false
  if (norm(query) === norm(explicitQuery) && metric.attempts === 0) return false
  return metric.state === 'low_yield' || metric.state === 'duplicate_heavy'
}

export function shouldStopAdaptiveSource(job, source) {
  const metric = getAdaptiveMetric(job, 'source', source)
  if (!metric || metric.attempts < 2 || metric.discovered < 10) return false
  return metric.state === 'low_yield' || metric.state === 'duplicate_heavy'
}

export function shouldSubdivideAdaptiveCell(job, cellId) {
  const metric = getAdaptiveMetric(job, 'cell', cellId)
  return Boolean(metric && metric.discovered >= 6 && metric.accepted >= 3 && metric.yieldRate >= 0.5 && metric.duplicateRate < 0.5)
}
