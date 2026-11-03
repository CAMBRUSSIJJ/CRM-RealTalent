import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLocalTaskWhatsAppScheduler } from './local-task-whatsapp-scheduler.mjs'
import { notificationEvent, taskNotificationEvent } from './notifications/notification-event-contract.mjs'

const fixture=()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rt-notification-diagnosis-'))
  let now=Date.parse('2026-11-03T14:00:00Z'),sends=0
  const engine=createLocalTaskWhatsAppScheduler({
    file:path.join(dir,'queue.json'),clock:()=>now,accountFor:async()=>({id:'qr'}),
    send:async()=>({id:'send-'+(++sends),status:'sent'}),
  })
  const member={workspaceId:'workspace',userId:'member',phone:'+5553999999999',
    consentAt:new Date(now-10_000).toISOString(),autoEnabledAt:new Date(now-10_000).toISOString()}
  const task={id:'task',assigneeId:member.userId,title:'Enviar proposta',status:'todo',
    reminderEnabled:true,reminderOnAssignment:true,reminderChannels:['whatsapp'],
    reminderOffsetsMinutes:[],dueAt:null,updatedAt:new Date(now-5*60_000).toISOString()}
  const schedule=(assignmentChanged=false)=>engine.schedule({workspaceId:'workspace',task,assignmentChanged})
  return {engine,member,task,schedule,advance:ms=>{now+=ms},get sends(){return sends},
    close:()=>fs.rmSync(dir,{recursive:true,force:true})}
}

test('domain contract rejects unrecognized events and invalid entities',()=>{
  const event=notificationEvent({type:'task.assigned',workspaceId:'workspace',entityId:'task',
    recipientId:'member',occurredAt:'2026-11-03T14:00:00Z'})
  assert.equal(event.type,'task.assigned')
  assert.equal(taskNotificationEvent({id:'task',assigneeId:'member',title:'Proposta'},'workspace',
    'task.reminder_requested','2026-11-03T14:00:00Z').type,'task.reminder_requested')
  assert.throws(()=>notificationEvent({type:'unsupported',workspaceId:'w',entityId:'t',recipientId:'m'}),/unsupported/)
  assert.throws(()=>notificationEvent({type:'task.assigned',workspaceId:'',entityId:'t',recipientId:'m'}),/invalid/)
})

test('diagnostics explain why an assigned task has no scheduled WhatsApp job',()=>{
  const x=fixture()
  try {
    x.schedule(false)
    assert.equal(x.engine.diagnose({workspaceId:'workspace',taskId:'task'}).code,'member_not_confirmed')
    x.engine.updateMember({...x.member,autoEnabledAt:null})
    assert.equal(x.engine.diagnose({workspaceId:'workspace',taskId:'task'}).code,'automatic_off')
    x.engine.updateMember(x.member)
    const d=x.engine.diagnose({workspaceId:'workspace',taskId:'task'})
    assert.equal(d.code,'assignment_already_happened')
    assert.equal(d.canRequest,true)
  }finally{x.close()}
})

test('a user-confirmed one-time request is scheduled once and never blindly retried',async()=>{
  const x=fixture()
  try {
    x.engine.updateMember(x.member)
    x.schedule(false)
    const diagnostic=x.engine.diagnose({workspaceId:'workspace',taskId:'task'})
    assert.equal(diagnostic.canRequest,true)
    const response=x.engine.requestOneOff({workspaceId:'workspace',taskId:'task'})
    assert.equal(response.scheduled,1)
    assert.equal(x.engine.diagnose({workspaceId:'workspace',taskId:'task'}).code,'scheduled')
    assert.throws(()=>x.engine.requestOneOff({workspaceId:'workspace',taskId:'task'}),/not_eligible/)
    x.advance(10_000)
    await x.engine.tick()
    assert.equal(x.sends,1)
    assert.equal(x.engine.status({workspaceId:'workspace'}).counts.sent,1)
    assert.equal(x.engine.diagnose({workspaceId:'workspace',taskId:'task'}).code,'accepted')
    await x.engine.tick()
    assert.equal(x.sends,1)
  }finally{x.close()}
})

test('one-time request requires employee opt-in and stays idempotent with default CRM task channel',()=>{
  const x=fixture()
  try {
    x.engine.updateMember({...x.member,autoEnabledAt:null})
    x.schedule(false)
    assert.throws(()=>x.engine.requestOneOff({workspaceId:'workspace',taskId:'task'}),/not_eligible:automatic_off/)
    x.engine.updateMember(x.member)
    x.task.reminderChannels=['in_app']
    x.schedule(false)
    assert.equal(x.engine.diagnose({workspaceId:'workspace',taskId:'task'}).code,'assignment_already_happened')
    assert.equal(x.engine.requestOneOff({workspaceId:'workspace',taskId:'task'}).scheduled,1)
    assert.throws(()=>x.engine.requestOneOff({workspaceId:'workspace',taskId:'task'}),/not_eligible/)
  }finally{x.close()}
})
