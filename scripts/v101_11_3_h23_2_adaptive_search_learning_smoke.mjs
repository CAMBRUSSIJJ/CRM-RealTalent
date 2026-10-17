import assert from 'node:assert/strict'
import { adaptiveQueryPriority, captureAdaptiveCounters, emptyAdaptiveLearning, getAdaptiveMetric, recordAdaptiveRun, shouldSkipAdaptiveQuery, shouldStopAdaptiveSource, shouldSubdivideAdaptiveCell } from '../runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/realtalent-prospecting-adaptive-learning.mjs'
const job = { runtime: { learning: emptyAdaptiveLearning() }, stats: { unique: 0, duplicates: 0, scopeRejectedCategory: 0, scopeRejectedLocation: 0, scopeRejectedOther: 0, webRejectedDocuments: 0 }, processing: { ready: 0, attention: 0 } }
assert.equal(shouldSkipAdaptiveQuery(job, 'Barbearias', 'Barbearias'), false)
let before = captureAdaptiveCounters(job)
job.stats.scopeRejectedCategory = 6
recordAdaptiveRun(job, { query: 'barber shop porto alegre', source: 'web', discovered: 6 }, before, captureAdaptiveCounters(job))
assert.equal(shouldSkipAdaptiveQuery(job, 'barber shop porto alegre', 'Barbearias'), true)
before = captureAdaptiveCounters(job)
job.stats.unique += 4; job.processing.ready += 3
recordAdaptiveRun(job, { query: 'barbearia porto alegre', source: 'web', cellId: 'cell-hot', discovered: 6 }, before, captureAdaptiveCounters(job))
assert.equal(getAdaptiveMetric(job, 'query', 'barbearia porto alegre').state, 'high_yield')
assert.equal(shouldSubdivideAdaptiveCell(job, 'cell-hot'), true)
assert.ok(adaptiveQueryPriority(job, 'barbearia porto alegre', 'Barbearias') > adaptiveQueryPriority(job, 'barber shop porto alegre', 'Barbearias'))
before = captureAdaptiveCounters(job)
job.stats.duplicates += 7
recordAdaptiveRun(job, { query: 'lista de barbearias', source: 'web-duplicate-test', discovered: 8 }, before, captureAdaptiveCounters(job))
assert.equal(shouldSkipAdaptiveQuery(job, 'lista de barbearias', 'Barbearias'), true)
before = captureAdaptiveCounters(job)
job.stats.scopeRejectedCategory += 6
recordAdaptiveRun(job, { query: 'ruim 2', source: 'web-low', discovered: 6 }, before, captureAdaptiveCounters(job))
before = captureAdaptiveCounters(job)
job.stats.scopeRejectedCategory += 6
recordAdaptiveRun(job, { query: 'ruim 3', source: 'web-low', discovered: 6 }, before, captureAdaptiveCounters(job))
assert.equal(shouldStopAdaptiveSource(job, 'web-low'), true)
assert.equal(job.runtime.learning.version, '4.2')
assert.ok(job.runtime.learning.adaptations.length >= 3)
console.log('Garimpo Adaptive Search Learning 4.2 smoke: OK')
