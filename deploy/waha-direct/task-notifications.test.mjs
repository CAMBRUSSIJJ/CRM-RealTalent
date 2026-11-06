import test from 'node:test'
import assert from 'node:assert/strict'
import {taskText} from './task-notifications.mjs'

test('WhatsApp tarefa: texto padronizado sem promessas comerciais',()=>{
 const text=taskText({title:'Revisar proposta',eventType:'assigned'})
 assert.match(text,/Nova tarefa atribuída/)
 assert.match(text,/Revisar proposta/)
})

test('atribuição sem autorização nunca agenda envio WAHA',async()=>{
  const fs=(await import('node:fs')).default, os=(await import('node:os')).default,
    path=(await import('node:path')).default
  const {createWahaTaskNotifications}=await import('./task-notifications.mjs')
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-task-'))
  let sends=0,clock=Date.now()
  const upstream=async route=>{
    if(route==='/api/sessions/realtalent')return {status:'WORKING'}
    if(route==='/api/sendText')sends++
    return {numberExists:true,chatId:'12345678901@lid',id:'provider-id'}
  }
  try{
    const notify=createWahaTaskNotifications({dataDir,session:'realtalent',upstream,clock:()=>clock})
    const workspaceId='ws_test',userId='member_1'
    const task={id:'task_1',assigneeId:userId,title:'Teste',status:'todo',
      reminderEnabled:true,reminderOnAssignment:true,reminderChannels:['whatsapp']}
    await notify.route('member',{workspaceId,userId,phone:'+5551999999999',consentAt:null,autoEnabledAt:null})
    const result=await notify.route('schedule',{workspaceId,task,assignmentChanged:true,
      assignmentAt:new Date(clock).toISOString()})
    assert.equal(result.assignmentScheduled,false)
    clock+=10000
    await notify.tick()
    assert.equal(sends,0)
  }finally{fs.rmSync(dataDir,{recursive:true,force:true})}
})

test('atribuição autorizada usa WAHA GOWS uma única vez',async()=>{
  const fs=(await import('node:fs')).default, os=(await import('node:os')).default,
    path=(await import('node:path')).default
  const {createWahaTaskNotifications}=await import('./task-notifications.mjs')
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-task-'))
  let sends=0,clock=Date.now(),recipient=''
  const upstream=async(route,method,body)=>{
    if(route==='/api/sessions/realtalent')return {status:'WORKING'}
    if(route.startsWith('/api/contacts/check-exists'))return {numberExists:true,chatId:'12345678901@lid'}
    if(route==='/api/sendText'){sends++;recipient=body.chatId;return{id:'accepted_by_waha'}}
    throw Error('Unexpected upstream')
  }
  try{
    const notify=createWahaTaskNotifications({dataDir,session:'realtalent',upstream,clock:()=>clock})
    const workspaceId='ws_test',userId='member_1',at=new Date(clock).toISOString()
    const task={id:'task_1',assigneeId:userId,title:'Preparar reunião',status:'todo',
      reminderEnabled:true,reminderOnAssignment:true,reminderChannels:['in_app']}
    await notify.route('member',{workspaceId,userId,phone:'+5551999999999',consentAt:at,autoEnabledAt:at})
    const result=await notify.route('schedule',{workspaceId,task,assignmentChanged:true,assignmentAt:at})
    assert.equal(result.assignmentScheduled,true)
    clock+=10000
    await notify.tick()
    await notify.tick()
    assert.equal(sends,1)
    assert.equal(recipient,'12345678901@lid')
    const jobs=await notify.route('status',{workspaceId,taskId:'task_1'})
    assert.ok(jobs.jobs.some(job=>job.status==='sent'))
  }finally{fs.rmSync(dataDir,{recursive:true,force:true})}
})
