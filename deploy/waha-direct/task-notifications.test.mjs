import test from 'node:test'
import assert from 'node:assert/strict'
import {taskText} from './task-notifications.mjs'

test('WhatsApp tarefa: texto padronizado sem promessas comerciais',()=>{
 const text=taskText({title:'Revisar proposta',eventType:'assigned'})
 assert.match(text,/Nova tarefa atribuída/)
 assert.match(text,/Revisar proposta/)
})
