import {describe,it,expect} from 'vitest'
import type {WorkspaceSnapshot} from '../domain/types'
import type {ProspectRecord} from './prospecting-workspace'
import {explainProspectScore} from './prospecting-g1g2-intelligence'
const snapshot={leads:[
  {id:'l1',status:'won',temperature:'hot',companyId:'c1',city:'Rio Grande',value:5000},
  {id:'l2',status:'won',temperature:'hot',companyId:'c1',city:'Rio Grande',value:8000},
  {id:'l3',status:'won',temperature:'hot',companyId:'c1',city:'Rio Grande',value:3000},
],companies:[{id:'c1',segment:'Paisagismo'}]} as unknown as WorkspaceSnapshot
const record=(patch:Partial<ProspectRecord>={}):ProspectRecord=>({
  id:'prospect',workspaceId:'ws1',createdBy:'u1',name:'Empresa de Jardins',
  company:'Empresa de Jardins',phone:'51911112222',email:'',city:'Rio Grande',
  address:'Centro',cnpj:'12345678000199',instagram:'',website:'https://example.org',
  bookingUrl:'',systemName:'',description:'Paisagismo e manutenção de jardins',
  followers:null,source:'maps',sourceDetail:'fonte pública',status:'review',
  confidence:87,duplicateLevel:'none',duplicateLeadId:null,duplicateReasons:[],
  notes:'',rawData:{category:'Paisagismo',placeType:'physical_place'},
  createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z',
  analyzedAt:null,sentAt:null,...patch
})
describe('Garimpo explainable qualification G2',()=>{
  it('separates fit, potential and evidence-confidence',()=>{
    const value=explainProspectScore(record(),snapshot)
    for(const key of ['fit','opportunity','evidenceConfidence'] as const){
      expect(value[key]).toBeGreaterThanOrEqual(0)
      expect(value[key]).toBeLessThanOrEqual(100)
    }
    expect(value.evidence.some(e=>e.type==='provided_field')).toBe(true)
    expect(value.reasons).not.toContain('Empresa precisa contratar consultoria')
  })
  it('never promotes confirmed duplicates as priority',()=>{
    const value=explainProspectScore(record({duplicateLevel:'confirmed'}),snapshot)
    expect(value.decision).toBe('verify_first')
    expect(value.evidenceConfidence).toBeLessThanOrEqual(25)
  })
  it('rejects directory and non-business entities',()=>{
    const value=explainProspectScore(record({rawData:{placeType:'directory'}}),snapshot)
    expect(value.decision).toBe('do_not_advance')
    expect(value.evidenceConfidence).toBeLessThanOrEqual(15)
  })
  it('marks small ICP samples as provisional, not a sales prediction',()=>{
    const sample={...snapshot,leads:[snapshot.leads[0]]} as WorkspaceSnapshot
    const value=explainProspectScore(record(),sample)
    expect(value.fit).toBeLessThanOrEqual(65)
    expect(value.uncertainties.some(x=>x.includes('menos de 3'))).toBe(true)
  })
  it('prevents a sparse record from being falsely prioritized',()=>{
    const value=explainProspectScore(record({
      website:'',description:'',phone:'',cnpj:'',city:'',address:'',
      confidence:15
    }),snapshot)
    expect(value.opportunity).toBeLessThanOrEqual(45)
    expect(value.decision).not.toBe('prioritize')
  })
})
