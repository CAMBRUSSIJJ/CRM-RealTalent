import { describe, expect, it } from 'vitest'
import type { CallRecord, Lead, Playbook, WorkspaceSnapshot } from '../../domain/types'
import { buildLeadPlaybookAdvice, classifyCallApproach, recommendApproachPlaybook } from './call-session-approaches'

const lead = { id:'lead-a', stageId:'new', temperature:'warm', decisionRole:null } as Lead
const call = (outcome: CallRecord['outcome'], startedAt='2026-11-07T12:00:00.000Z') =>
  ({ leadId:'lead-a', outcome, startedAt } as CallRecord)
const script = (id: string, title: string) => ({
  id, title, category:'Vendas', kind:'script', active:true, tags:[], guidance:{},
} as Playbook)

describe('per-lead call approach recommendation', () => {
  const now = new Date('2026-11-08T12:00:00.000Z')
  it('distinguishes first contact from recent follow-up', () => {
    expect(classifyCallApproach({lead,calls:[],now})).toBe('first_contact')
    expect(classifyCallApproach({lead,calls:[call('answered')],now})).toBe('follow_up')
  })
  it('prioritizes an actual requested callback', () => {
    expect(classifyCallApproach({lead,calls:[call('callback_requested')],now})).toBe('callback')
  })
  it('identifies an existing proposal and does not invent one', () => {
    expect(classifyCallApproach({lead,calls:[],proposalExists:true,now})).toBe('proposal')
  })
  it('identifies inactive contacts from actual dated interactions', () => {
    expect(classifyCallApproach({lead,calls:[call('answered','2026-04-01T10:00:00.000Z')],now})).toBe('reactivation')
  })
  it('prefers a script matching the contact type when one exists', () => {
    const playbooks = [script('new','Abordagem consultiva inicial'),script('follow','Continuidade comercial — follow-up')]
    expect(recommendApproachPlaybook({lead,approach:'follow_up',objective:'first_meeting',playbooks})?.id).toBe('follow')
    expect(recommendApproachPlaybook({lead,approach:'first_contact',objective:'first_meeting',playbooks})?.id).toBe('new')
  })
  it('falls back to a real active script; never invents playbooks', () => {
    expect(recommendApproachPlaybook({lead,approach:'callback',objective:'first_meeting',playbooks:[] })).toBe(null)
  })
})

describe('CRM sourced playbook context', () => {
  const now = new Date('2026-11-08T12:00:00.000Z')
  const snapshot = (input: Record<string,unknown> = {}) => ({
    workspace:{ id:'workspace-a' }, stages:[{ id:'new', name:'Proposta enviada' }],
    playbooks:[script('proposal','Negociação da proposta')],
    calls:[], activities:[], events:[], contacts:[], proposals:[],
    leads:[lead], ...input,
  } as unknown as WorkspaceSnapshot)

  it('marks active proposal and linked pipeline as real evidence', () => {
    const s = snapshot({
      proposals:[{ id:'proposal-1', leadId:lead.id, title:'Proposta Comercial', version:2, isCurrentVersion:true, status:'sent' }],
      activities:[{ leadId:lead.id,type:'followup',completedAt:null }],
    })
    const result = buildLeadPlaybookAdvice({lead,snapshot:s,objective:'proposal_followup',now})
    expect(result.approach).toBe('proposal')
    expect(result.recommended?.title).toBe('Negociação da proposta')
    expect(result.isSpecific).toBe(true)
    expect(result.related.proposalId).toBe('proposal-1')
    expect(result.related.pendingActivities).toBe(1)
    expect(result.context.some((entry)=>entry.includes('Proposta Comercial'))).toBe(true)
  })
  it('never counts an unsent future task or an internal note as customer contact', () => {
    const s=snapshot({
      proposals:[],
      activities:[{leadId:lead.id,type:'note',completedAt:null,createdAt:'2026-11-08T11:00:00Z'}],
    })
    const result=buildLeadPlaybookAdvice({lead,snapshot:s,objective:'first_meeting',now})
    expect(result.approach).toBe('first_contact')
  })
  it('does not invent WhatsApp evidence or a playbook when none exists', () => {
    const result=buildLeadPlaybookAdvice({lead,snapshot:snapshot({playbooks:[]}),objective:'first_meeting',now})
    expect(result.recommended).toBe(null)
    expect(result.context.some((item)=>/WhatsApp/i.test(item))).toBe(false)
  })
  it('surfaces an explicitly reviewed WAHA/Ollama note without treating it as a pending task', () => {
    const s = snapshot({
      activities:[{
        leadId:lead.id,type:'note',createdAt:'2026-11-07T18:00:00.000Z',completedAt:null,
        resolutionReason:'pinned_call_note',
        description:'[WAHA_CONTEXT_V1] Fonte: WAHA\\nResumo: cliente pediu revisão da proposta',
      }],
    })
    const advice=buildLeadPlaybookAdvice({lead,snapshot:s,objective:'proposal_followup',now})
    expect(advice.related.pendingActivities).toBe(0)
    expect(advice.context.some((line)=>line.includes('cliente pediu revisão da proposta'))).toBe(true)
  })
  it('distinguishes a general script from a specialized one', () => {
    const s=snapshot({playbooks:[script('general','Outbound consultivo')]})
    const result=buildLeadPlaybookAdvice({lead,snapshot:s,objective:'proposal_followup',manualApproach:'proposal',now})
    expect(result.isSpecific).toBe(false)
    expect(result.explanation).toContain('Roteiro geral')
  })
})
