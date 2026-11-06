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
