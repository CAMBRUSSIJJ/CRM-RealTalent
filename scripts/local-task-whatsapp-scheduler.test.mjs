import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createLocalTaskWhatsAppScheduler } from './local-task-whatsapp-scheduler.mjs'

test('local reminder opt-in, single claim, cancellation and restart',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rt-reminders-'))
  try{
    const file=path.join(folder,'jobs.json')
    let now=Date.parse('2026-11-03T10:00:00Z'),total=0
    const options={file,clock:()=>now,accountFor:async()=>({id:'qr'}),
      send:async()=>{total++;return {id:'event',status:'sent'}}}
    const queue=createLocalTaskWhatsAppScheduler(options)
    const member={workspaceId:'local-workspace',userId:'local-user',phone:'+5553999999999',
      consentAt:new Date(now-1000).toISOString(),autoEnabledAt:new Date(now-1000).toISOString()}
    const task={id:'task-a',assigneeId:member.userId,title:'Revisão',status:'todo',priority:'normal',
      reminderEnabled:true,reminderOnAssignment:true,reminderChannels:['whatsapp'],reminderOffsetsMinutes:[60],
      updatedAt:new Date(now).toISOString(),dueAt:new Date(now+7200000).toISOString()}
    queue.updateMember({...member,autoEnabledAt:null})
    assert.equal(queue.schedule({workspaceId:member.workspaceId,task,assignmentChanged:true}).scheduled,0)
    queue.updateMember(member)
    assert.equal(queue.schedule({workspaceId:member.workspaceId,task,assignmentChanged:true}).scheduled,2)
    now+=9000
    await queue.tick()
    assert.equal(total,1)
    const resumed=createLocalTaskWhatsAppScheduler(options)
    await resumed.tick()
    assert.equal(total,1)
    resumed.updateMember({...member,autoEnabledAt:null})
    now+=7200000
    await resumed.tick()
    assert.equal(total,1)
  }finally{fs.rmSync(folder,{recursive:true,force:true})}
})

test('a server-confirmed opt-in survives gateway restart without reopening CRM',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rt-reminders-restart-'))
  try {
    const file=path.join(folder,'jobs.json')
    let now=Date.parse('2026-11-03T10:00:00Z'),sent=0
    const options={file,clock:()=>now,accountFor:async()=>({id:'qr'}),
      send:async()=>({id:'sent-'+(++sent),status:'sent'})}
    const queue=createLocalTaskWhatsAppScheduler(options)
    const workspaceId='workspace-restart',userId='member-restart'
    const member={workspaceId,userId,phone:'+5553999999999',consentAt:new Date(now).toISOString(),autoEnabledAt:new Date(now).toISOString()}
    const task={id:'task-restart',assigneeId:userId,title:'Teste de prazo',status:'todo',
      reminderEnabled:true,reminderOnAssignment:false,reminderChannels:['whatsapp'],
      reminderOffsetsMinutes:[60],dueAt:new Date(now+2*60*60_000).toISOString(),
      updatedAt:new Date(now).toISOString()}
    queue.updateMember(member)
    assert.equal(queue.schedule({workspaceId,task,assignmentChanged:false}).scheduled,1)
    const restarted=createLocalTaskWhatsAppScheduler(options)
    now+=60*60_000+5000
    await restarted.tick() // browser never reopened
    assert.equal(sent,1)
    await restarted.tick()
    assert.equal(sent,1)
  } finally {fs.rmSync(folder,{recursive:true,force:true})}
})

test('background reconciliation cannot grant opt-in after server revocation',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rt-reminders-consent-'))
  try {
    const queue=createLocalTaskWhatsAppScheduler({file:path.join(folder,'jobs.json'),
      accountFor:async()=>({id:'qr'}),send:async()=>{throw Error('should not send')}})
    const member={workspaceId:'ws',userId:'member',phone:'+5553999999999',
      consentAt:'2026-11-03T10:00:00Z',autoEnabledAt:'2026-11-03T10:00:00Z'}
    queue.updateMember({...member,autoEnabledAt:null})
    assert.equal(queue.updateMember({...member,reconcileOnly:true}).active,false)
    assert.equal(queue.memberStatus({workspaceId:'ws',userId:'member'}).active,false)
    assert.equal(queue.updateMember(member).active,true) // only explicit action
  } finally {fs.rmSync(folder,{recursive:true,force:true})}
})

test('unknown outcome is never retried after gateway restart',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rt-reminders-unknown-'))
  try {
    let now=Date.parse('2026-11-03T10:00:00Z'),calls=0
    const options={file:path.join(folder,'jobs.json'),clock:()=>now,accountFor:async()=>({id:'qr'}),
      send:async()=>{calls++;throw new Error('timeout')}}
    const queue=createLocalTaskWhatsAppScheduler(options)
    const workspaceId='ws',userId='member'
    queue.updateMember({workspaceId,userId,phone:'+5553999999999',
      consentAt:new Date(now).toISOString(),autoEnabledAt:new Date(now).toISOString()})
    queue.schedule({workspaceId,assignmentChanged:true,task:{id:'task',title:'teste',assigneeId:userId,
      status:'todo',updatedAt:new Date(now).toISOString(),reminderEnabled:true,
      reminderOnAssignment:true,reminderChannels:['whatsapp']}})
    now+=10000
    await queue.tick()
    assert.equal(calls,1)
    assert.equal(queue.status({workspaceId}).counts.unknown,1)
    const resumed=createLocalTaskWhatsAppScheduler(options)
    await resumed.tick()
    assert.equal(calls,1)
  }finally{fs.rmSync(folder,{recursive:true,force:true})}
})

test('full workspace reconciliation cancels orphaned schedules',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rt-reminders-orphans-'))
  try {
    const now=Date.parse('2026-11-03T10:00:00Z')
    const queue=createLocalTaskWhatsAppScheduler({file:path.join(folder,'jobs.json'),
      clock:()=>now,accountFor:async()=>null,send:async()=>({id:'never'})})
    queue.updateMember({workspaceId:'workspace',userId:'member',phone:'+5553999999999',
      consentAt:new Date(now).toISOString(),autoEnabledAt:new Date(now).toISOString()})
    queue.schedule({workspaceId:'workspace',assignmentChanged:false,task:{
      id:'orphan',assigneeId:'member',title:'test',status:'todo',
      reminderEnabled:true,reminderOnAssignment:false,reminderChannels:['whatsapp'],
      reminderOffsetsMinutes:[60],dueAt:new Date(now+7200000).toISOString(),
    }})
    assert.equal(queue.status({workspaceId:'workspace'}).counts.pending,1)
    assert.equal(queue.reconcileWorkspace({workspaceId:'workspace',taskIds:[]}).cancelled,1)
    assert.equal(queue.status({workspaceId:'workspace'}).counts.pending,0)
  }finally{fs.rmSync(folder,{recursive:true,force:true})}
})
