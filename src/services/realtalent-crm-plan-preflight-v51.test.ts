import {describe,expect,it} from 'vitest'
import { preflightCrmPlanV51 } from './realtalent-crm-plan-preflight-v51'
import { universalCrmCapabilityById } from './realtalent-crm-universal-registry'
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
const step=(id:string,capabilityId:string):CrmCapabilityPlanStep=>{
  const capability=universalCrmCapabilityById(capabilityId)
  if(!capability)throw Error('no capability')
  return {id,capabilityId,risk:capability.risk,title:capability.title,reason:'',args:[]}
}
describe('V5.1 - CRM execution preflight',()=>{
  it('accepts two authorized native tools',()=>{
    expect(preflightCrmPlanV51([step('a','tasks.create'),step('b','calendar.create')]).ok).toBe(true)
  })
  it('rejects forged unknown tools and model-provided risk downgrades',()=>{
    expect(preflightCrmPlanV51([{...step('a','tasks.create'),capabilityId:'nonexistent'}]).ok).toBe(false)
    expect(preflightCrmPlanV51([{...step('a','contacts.delete'),risk:'read'}]).ok).toBe(false)
  })
  it('rejects duplicate IDs and unsafe undo composition',()=>{
    expect(preflightCrmPlanV51([step('same','tasks.create'),step('same','calendar.create')]).ok).toBe(false)
    expect(preflightCrmPlanV51([step('a','agent.undo_last'),step('b','tasks.create')]).ok).toBe(false)
  })
  it('rejects empty or oversized plans',()=>{
    expect(preflightCrmPlanV51([]).ok).toBe(false)
    expect(preflightCrmPlanV51(Array.from({length:9},(_,i)=>step(String(i),'tasks.create'))).ok).toBe(false)
  })
})
