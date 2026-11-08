import { describe, expect, it } from 'vitest'
import type { CallRecord, Lead, Playbook } from '../../domain/types'
import { classifyCallApproach, recommendApproachPlaybook } from './call-session-approaches'

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
