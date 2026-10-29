import {describe,it,expect} from 'vitest'
import type {ProspectRecord} from './prospecting-workspace'
import {buildProspectingHandoffMetrics,isProspectTransferable,
  transferableProspectIds,linkedCrmLeadId,linkedCrmCompanyId,summarizeHandoffReceipt} from './prospecting-handoff-r1'

const record=(patch:Partial<ProspectRecord>={}):ProspectRecord=>({
  id:'p1',workspaceId:'ws',createdBy:'owner',name:'Jardim Alegre',
  company:'Jardim Alegre',phone:'51999998888',email:'contato@jardins.test',city:'Rio Grande',
  address:'Rua do Centro, 10',cnpj:'',instagram:'',website:'https://jardins.test',
  bookingUrl:'',systemName:'',description:'Jardinagem e paisagismo',followers:null,
  source:'maps',sourceDetail:'busca real',status:'approved',confidence:94,
  duplicateLevel:'none',duplicateLeadId:null,duplicateReasons:[],notes:'',
  rawData:{placeType:'physical_place',latitude:-32.04,longitude:-52.1},
  createdAt:'2026-10-29T10:00:00Z',updatedAt:'2026-10-29T10:00:00Z',
  analyzedAt:null,sentAt:null,...patch
})
describe('R1: evidence-backed Garimpo -> CRM handoff',()=>{
  it('selects approved and eligible records only',()=>{
    const a=record()
    const blocked=record({id:'p2',status:'approved',duplicateLevel:'confirmed'})
    const unreviewed=record({id:'p3',status:'review'})
    const sent=record({id:'p4',status:'sent'})
    expect(isProspectTransferable(a)).toBe(true)
    expect(isProspectTransferable(blocked)).toBe(false)
    expect(transferableProspectIds([a,blocked,unreviewed,sent])).toEqual(['p1'])
  })
  it('counts real transferred canonical companies and opportunity links',()=>{
    const rows=[
      record({id:'new',status:'review'}),
      record({id:'approved'}),
      record({id:'blocked',status:'approved',duplicateLevel:'confirmed'}),
      record({id:'company',status:'sent',rawData:{crmCompanyId:'company-1'}}),
      record({id:'opportunity',status:'sent',rawData:{crmCompanyId:'company-2',crmLeadId:'lead-2'}}),
    ]
    expect(buildProspectingHandoffMetrics(rows)).toMatchObject({
      collected:5,toReview:1,approved:2,transferable:1,blocked:1,sent:2,
      transferredCompanies:2,linkedOpportunities:1,
    })
  })
  it('never treats unverified remote CRM IDs as valid links',()=>{
    const p=record({rawData:{crmLeadId:'other-workspace-lead',crmCompanyId:'company-1'}})
    expect(linkedCrmLeadId(p,new Set(['lead-2']))).toBeNull()
    expect(linkedCrmCompanyId(p,new Set(['company-1']))).toBe('company-1')
  })
  it('accounts for failures and skips without claiming 100 percent success',()=>{
    expect(summarizeHandoffReceipt({id:'b',createdAt:'2026-10-29T10:00:00Z',activityWarnings:1,rows:[
      {id:'1',company:'Empresa 1',prospectId:'1',status:'transferred',crmCompanyId:'c1'},
      {id:'2',company:'Empresa 2',prospectId:'2',status:'transferred',crmLeadId:'l2'},
      {id:'3',company:'Empresa 3',prospectId:'3',status:'failed',note:'erro'},
      {id:'4',company:'Empresa 4',prospectId:'4',status:'skipped',note:'duplicada'},
    ].map(r=>({note:'ok',...r}))})).toEqual({transferred:2,skipped:1,failed:1,opportunities:1})
  })
})
