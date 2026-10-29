import {describe,it,expect,vi} from 'vitest'
import type {PipelineStage,Lead,OpportunityRecord,AutomationRule} from '../../domain/types'
import {draftStage,validStage,stageIsChanged,moveStageOrder,stageUsage,missingPresetStages,
  PIPELINE_PRESETS,validateStageOrder,normalizeAuxItems} from './pipeline-editor-model'
import {commitStageOrder} from './pipeline-editor-order'
const stage=(id:string,order:number,extra:Partial<PipelineStage>={}):PipelineStage=>({
  id,workspaceId:'ws',name:'Etapa '+id,order,probability:order*10,color:'#4261EE',
  isWon:false,isLost:false,...extra,
})
describe('Configurações S3.3.1 — editor seguro do Pipeline',()=>{
  const stages=[stage('a',1),stage('b',2),stage('c',3)]
  it('validates stage draft, probability, name and duplicates',()=>{
    const a=draftStage(stages[0])
    expect(validStage(a,[a,draftStage(stages[1])])).toBeNull()
    expect(validStage({...a,name:''},[a])).toMatch(/nome/i)
    expect(validStage({...a,probability:112},[a])).toMatch(/probabilidade/i)
    expect(validStage({...a,name:'Etapa b'},[a,draftStage(stages[1])])).toMatch(/mesmo nome/)
    expect(stageIsChanged(stages[0],{...a,name:'Outro'})).toBe(true)
    expect(stageIsChanged(stages[0],a)).toBe(false)
  })
  it('supports drag and keyboard ordering without losing or cloning entries',()=>{
    expect(moveStageOrder(['a','b','c'],'c','a')).toEqual(['c','a','b'])
    expect(moveStageOrder(['a','b','c'],'b','b')).toEqual(['a','b','c'])
    expect(validateStageOrder(['c','a','b'],stages)).toBe(true)
    expect(validateStageOrder(['c','c','b'],stages)).toBe(false)
  })
  it('counts actual linked leads, opportunities and automations for guarded delete',()=>{
    const leads=[{stageId:'a'},{stageId:'a'},{stageId:'b'}] as Lead[]
    const opportunities=[{stageId:'a'}] as OpportunityRecord[]
    const rules=[{actions:[{type:'move_stage',value:'a'}]}] as AutomationRule[]
    expect(stageUsage('a',leads,opportunities,rules)).toEqual({leads:2,opportunities:1,automations:1,total:4})
  })
  it('adds only absent stages in templates and does not overwrite existing stages',()=>{
    const current=[stage('1',1,{name:'Novo lead',probability:99})]
    const missing=missingPresetStages(current,'prospecting')
    expect(PIPELINE_PRESETS.prospecting.stages).toHaveLength(6)
    expect(missing.some(s=>s.name==='Novo lead')).toBe(false)
    expect(missing.length).toBe(5)
    expect(current[0].probability).toBe(99)
  })
  it('reorders with temporary slots, preserving stage identities and previous values',async()=>{
    const update=vi.fn(async(_id:string,_order:number)=>undefined)
    const result=await commitStageOrder(stages,['c','a','b'],update)
    expect(result).toMatchObject({changed:true,saved:true,restored:true})
    expect(update).toHaveBeenCalledTimes(6)
    expect(update.mock.calls.slice(3)).toEqual([['c',1],['a',2],['b',3]])
  })
  it('attempts compensating rollback and reports unsuccessful reorder',async()=>{
    let count=0
    const update=vi.fn(async(_id:string,_order:number)=>{
      count++
      if(count===3)throw Error('service unavailable')
    })
    const result=await commitStageOrder(stages,['c','a','b'],update)
    expect(result.saved).toBe(false)
    expect(result.restored).toBe(true)
    expect(result.error).toContain('restaurada')
    expect(update.mock.calls.slice(-3)).toEqual([['a',1],['b',2],['c',3]])
  })
  it('never writes when order already matches',async()=>{
    const update=vi.fn(async()=>undefined)
    const result=await commitStageOrder(stages,['a','b','c'],update)
    expect(result).toMatchObject({changed:false,saved:true})
    expect(update).not.toHaveBeenCalled()
  })
  it('normalizes auxiliary items in the draft without mutating input',()=>{
    const arr=['Preços',' Preços ','Retorno','']
    expect(normalizeAuxItems(arr)).toEqual(['Preços','Retorno'])
    expect(arr).toHaveLength(4)
  })
})
