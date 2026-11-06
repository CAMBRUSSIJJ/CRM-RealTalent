import {beforeEach,describe,expect,it,vi} from 'vitest'
import {consumeWahaTaskHandoff,stageWahaTaskHandoff} from './waha-task-handoff'

describe('WAHA → tarefa: somente rascunho revisável',()=>{
  let storage:Map<string,string>
  beforeEach(()=>{
    storage=new Map()
    vi.stubGlobal('window',{sessionStorage:{
      getItem:(k:string)=>storage.get(k)??null,
      setItem:(k:string,v:string)=>{storage.set(k,v)},
      removeItem:(k:string)=>{storage.delete(k)},
    }})
  })
  it('transferência é única, limitada e não cria tarefa automaticamente',()=>{
    stageWahaTaskHandoff({title:'Revisar proposta do cliente',description:'Verificar valor e prazo'})
    const value=consumeWahaTaskHandoff()
    expect(value).toMatchObject({title:'Revisar proposta do cliente',
      description:'Verificar valor e prazo',source:'waha-local'})
    expect(consumeWahaTaskHandoff()).toBeNull()
    expect(storage.size).toBe(0)
  })
  it('descarta informação expirada, inválida ou introduzida por outro módulo',()=>{
    storage.set('realtalent.waha.task-handoff.v1',JSON.stringify({
      source:'other',title:'Nova tarefa',description:'',createdAt:Date.now(),
    }))
    expect(consumeWahaTaskHandoff()).toBeNull()
    storage.set('realtalent.waha.task-handoff.v1',JSON.stringify({
      source:'waha-local',title:'Tarefa antiga',description:'',createdAt:Date.now()-11*60*1000,
    }))
    expect(consumeWahaTaskHandoff()).toBeNull()
    expect(()=>stageWahaTaskHandoff({title:'  \n '})).toThrow()
  })
})
