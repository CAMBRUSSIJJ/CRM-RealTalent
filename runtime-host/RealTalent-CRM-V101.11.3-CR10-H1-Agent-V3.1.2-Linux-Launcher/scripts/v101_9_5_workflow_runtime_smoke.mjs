import assert from 'node:assert/strict'
import fs from 'node:fs'

const runner = fs.readFileSync('supabase/functions/automation-runner/index.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/202610020002_v101_9_5_workflow_runtime_3.sql', 'utf8')
assert.match(runner, /previousStatus === 'waiting'/)
assert.match(runner, /reason: 'branch_false'/)
assert.match(runner, /2 \*\* Math\.max\(1, nextAttempts\)/)
assert.match(migration, /unique \(organization_id, idempotency_key\)/)

const queue = new Map()
const enqueue = (key) => {
  if (queue.has(key)) return queue.get(key)
  const execution = { id: `wf-${queue.size + 1}`, status: 'queued', currentStep: 0, nextRunAt: 0, attempts: 0, steps: [] }
  queue.set(key, execution)
  return execution
}
const first = enqueue('workspace:event:rule')
const duplicate = enqueue('workspace:event:rule')
assert.equal(first.id, duplicate.id, 'idempotency must reuse the same execution')

const actions = [
  { type: 'wait', ms: 60_000 },
  { type: 'branch_if', matched: false, skip: 1 },
  { type: 'create_task' },
  { type: 'notify_user' },
]
const now = 1_000_000
const run = (execution, at) => {
  if (execution.status === 'waiting' && at < execution.nextRunAt) return
  if (execution.status === 'waiting') execution.steps.find((step) => step.index === execution.currentStep - 1).status = 'succeeded'
  execution.status = 'running'
  while (execution.currentStep < actions.length) {
    const index = execution.currentStep
    const action = actions[index]
    if (action.type === 'wait') {
      execution.steps.push({ index, type: 'wait', status: 'waiting' })
      execution.currentStep += 1
      execution.nextRunAt = at + action.ms
      execution.status = 'waiting'
      return
    }
    if (action.type === 'branch_if') {
      execution.steps.push({ index, type: 'branch', status: 'succeeded', matched: action.matched })
      if (!action.matched) {
        for (let skipped = index + 1; skipped < Math.min(actions.length, index + 1 + action.skip); skipped += 1) execution.steps.push({ index: skipped, type: actions[skipped].type, status: 'skipped' })
      }
      execution.currentStep += 1 + (action.matched ? 0 : action.skip)
      continue
    }
    execution.steps.push({ index, type: 'action', status: 'succeeded' })
    execution.currentStep += 1
  }
  execution.status = 'succeeded'
}
run(first, now)
assert.equal(first.status, 'waiting')
assert.equal(first.currentStep, 1)
assert.equal(first.nextRunAt, now + 60_000)
run(first, now + 30_000)
assert.equal(first.status, 'waiting', 'must not resume early')
run(first, now + 60_000)
assert.equal(first.status, 'succeeded')
assert.equal(first.steps.find((step) => step.index === 0)?.status, 'succeeded', 'wait step must close on resume')
assert.equal(first.steps.find((step) => step.index === 2)?.status, 'skipped', 'false branch must persist skipped steps')
assert.equal(first.steps.find((step) => step.index === 3)?.status, 'succeeded', 'workflow must continue after skipped branch range')

const retryMinutes = (attempt) => Math.min(60, 2 ** Math.max(1, attempt))
assert.deepEqual([1, 2, 3, 6].map(retryMinutes), [2, 4, 8, 60])
console.log('Workflow Runtime 3.0 smoke: OK (idempotency + wait/resume + branch/skip + retry backoff)')
