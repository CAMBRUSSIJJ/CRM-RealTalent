import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const work=read('src/services/work-management.ts')
const tasks=read('src/features/tasks/tasks-page.tsx')
const orchestrator=read('src/services/notifications/notification-orchestrator.ts')
const queue=read('scripts/local-task-whatsapp-scheduler.mjs')
const center=read('src/features/communications-automations/communication-automation-center.tsx')

test('local tasks and notification intents share one persisted browser snapshot',()=>{
  assert.match(work,/notificationIntents\??: TaskNotificationIntent\[\]/)
  const start=work.indexOf('export async function saveTask')
  const end=work.indexOf('export async function updateTaskStatus',start)
  const fn=work.slice(start,end)
  assert.match(fn,/recordNotificationIntent\(snapshot,id,next\.assigneeId,'assignment'/)
  assert.match(fn,/writeLocal\(workspaceId, snapshot\)/)
  assert.ok(fn.indexOf('recordNotificationIntent')<fn.lastIndexOf('writeLocal(workspaceId, snapshot)'))
  assert.match(work,/recordNotificationIntent\(snapshot,taskId,target\.assigneeId/)
})

test('gateway outage does not prevent task completion or deletion',()=>{
  const status=tasks.slice(tasks.indexOf('  const changeStatus = async'),tasks.indexOf('  const remove = async'))
  const deletion=tasks.slice(tasks.indexOf('  const remove = async'),tasks.indexOf('  const openEdit'))
  assert.ok(status.indexOf('await updateTaskStatus') < status.indexOf('flushTaskNotificationIntents'))
  assert.ok(deletion.indexOf('await deleteTask') < deletion.indexOf('flushTaskNotificationIntents'))
  assert.doesNotMatch(status,/throw new Error\('Não foi possível cancelar o lembrete automático/)
  assert.doesNotMatch(deletion,/throw new Error\('Gateway indisponível/)
})

test('replay serializes per workspace and skips obsolete assignments',()=>{
  assert.match(orchestrator,/const flushing=new Map/)
  assert.match(orchestrator,/if\(existing\)return existing/)
  assert.match(orchestrator,/task\.assigneeId!==intent\.recipientId/)
  assert.match(orchestrator,/assignmentAt:intent\.occurredAt/)
  assert.match(orchestrator,/acknowledgeTaskNotificationIntent\(workspaceId,intent\.id\)/)
  assert.match(orchestrator,/const fresh=await loadWorkManagement\('local',workspaceId\)/)
})

test('outbox status remains visible while gateway is offline',()=>{
  assert.match(center,/pendingTaskNotificationIntents/)
  assert.match(center,/aguardando sincronização/)
  assert.match(queue,/deliveryLedger/)
  assert.match(queue,/job\.status!=='pending'\) continue/)
  assert.match(queue,/assignment_replayed_after_15min/)
})

test('corrupt storage fails closed rather than pretending all tasks were removed',()=>{
  assert.match(work,/throw new Error\('O armazenamento de tarefas está corrompido/)
  assert.match(queue,/unverifiedEmpty:true/)
  assert.match(queue,/input\?\.verifiedEmpty!==true/)
})
