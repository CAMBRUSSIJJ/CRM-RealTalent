import {describe,expect,it} from 'vitest'
import type {Lead} from '../domain/types'
import type {ProspectRecord} from './prospecting-workspace'
import type {TriggerReviewRecordG4} from './prospecting-triggers-g4'
import type {Database} from '../lib/supabase.types'
import {
  isMissingG43Migration,loadLocalApprovedPipelineTriggersG43,mapRemoteTriggerG43
} from './prospecting-triggers-g43-remote'

const lead={id:'crm-1',workspaceId:'ws-a'} as Lead
const prospect={id:'p-1',workspaceId:'ws-a',rawData:{crmLeadId:'crm-1'}} as ProspectRecord
const review={
  id:'event-1',workspaceId:'ws-a',prospectId:'p-1',
  category:'transition',event:'Mudança de direção',
  quote:'A instituição anunciou nova direção em novembro',
  dateQuote:null,hypothesis:'Pode precisar de capacitação',
  rationale:'A direção mudou',suggestedQuestion:'Quais são as novas prioridades?',
  status:'needs_review',sourceUrl:'https://example.org/noticia',
  sourceCheck:'not_verified',investigationPriority:0,
  reviewStatus:'approved',sourceConfirmed:true,reviewerNote:'Conferido',
  reviewedAt:'2026-11-06T12:00:00Z',updatedAt:'2026-11-06T12:00:00Z'
} satisfies TriggerReviewRecordG4

describe('G4.3 — sinais no Pipeline',()=>{
  it('mostra somente aprovado, conferido e vinculado à oportunidade autorizada',()=>{
    const rows=loadLocalApprovedPipelineTriggersG43('ws-a',[lead],[prospect],[review])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({leadId:'crm-1',event:'Mudança de direção'})
    expect(loadLocalApprovedPipelineTriggersG43('ws-a',[lead],[prospect],[{...review,reviewStatus:'needs_review'}])).toEqual([])
    expect(loadLocalApprovedPipelineTriggersG43('ws-a',[lead],[prospect],[{...review,sourceConfirmed:false}])).toEqual([])
  })
  it('impede vazamento entre workspaces e leads fora do escopo',()=>{
    expect(loadLocalApprovedPipelineTriggersG43('ws-b',[lead],[prospect],[review])).toEqual([])
    expect(loadLocalApprovedPipelineTriggersG43('ws-a',[lead],[{...prospect,workspaceId:'ws-b'}],[review])).toEqual([])
    expect(loadLocalApprovedPipelineTriggersG43('ws-a',[{id:'outra'} as Lead],[prospect],[review])).toEqual([])
  })
  it('converte apenas campos recebidos do Supabase e mantém status efetivo',()=>{
    const row={
      id:'event-1',organization_id:'ws-a',prospect_id:'p-1',
      category:'transition',event_label:'Mudança de direção',
      source_url:'https://example.org/noticia',source_excerpt:review.quote,
      source_quote:review.quote,date_quote:null,
      hypothesis:'Talvez exista treinamento',rationale:'Mudança observada',
      suggested_question:'Quais metas foram definidas?',review_status:'approved',
      source_confirmed:true,reviewer_note:'Fonte conferida',
      reviewed_at:'2026-11-06T12:00:00Z',reviewed_by:'auth-user',
      updated_at:'2026-11-06T12:01:00Z',crm_lead_id:'crm-1',
    } as Database['public']['Tables']['prospecting_trigger_events']['Row']
    expect(mapRemoteTriggerG43(row)).toMatchObject({
      workspaceId:'ws-a',prospectId:'p-1',reviewStatus:'approved',
      crmLeadId:'crm-1',reviewedBy:'auth-user',sourceCheck:'not_verified',
    })
  })
  it('identifica migração indisponível sem transformar erro de autorização em fallback',()=>{
    expect(isMissingG43Migration({code:'42P01'})).toBe(true)
    expect(isMissingG43Migration({code:'PGRST205'})).toBe(true)
    expect(isMissingG43Migration({code:'42501',message:'permission denied'})).toBe(false)
  })
})
