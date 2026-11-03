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
