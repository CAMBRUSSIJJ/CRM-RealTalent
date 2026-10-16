import { describe, expect, it } from 'vitest'
import { DEFAULT_STAGES, DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACT_RELATIONSHIPS, DEMO_CONTACTS, DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_PRODUCTS, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES, DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE } from '../domain/defaults'
import type { CallRecord, WorkspaceSnapshot } from '../domain/types'
import { CALL_SESSION_SCHEMA_VERSION, callSessionStorageKey } from './call-session-storage-v10151'
import { realTalentAiGateway } from './realtalent-ai-gateway'
import { REALTALENT_UNIVERSAL_CAPABILITIES } from './realtalent-crm-universal-registry'
import { buildLiveSalesCoach, buildLiveSalesCoachAssistantAnswer, formatLiveSalesCoach, readActiveLiveCallSession } from './realtalent-live-sales-coach'

const baseSnapshot: WorkspaceSnapshot = { workspace: DEMO_WORKSPACE, stages: DEFAULT_STAGES, leads: DEMO_LEADS, activities: DEMO_ACTIVITIES, calls: DEMO_CALLS, events: DEMO_EVENTS, playbooks: DEMO_PLAYBOOKS, goals: DEMO_GOALS, automationRules: DEMO_AUTOMATION_RULES, automationRuns: DEMO_AUTOMATION_RUNS, companies: DEMO_COMPANIES, contacts: DEMO_CONTACTS, contactRelationships: DEMO_CONTACT_RELATIONSHIPS, opportunities: DEMO_OPPORTUNITIES, socialProfiles: DEMO_SOCIAL_PROFILES, products: DEMO_PRODUCTS, proposals: DEMO_PROPOSALS, revenueEntries: DEMO_REVENUE_ENTRIES }
const now = new Date('2026-10-16T13:00:00.000Z')
const lead = DEMO_LEADS[0]
const call = (outcome: CallRecord['outcome'], transcript = '', notes = ''): CallRecord => ({ id: `call-live-${outcome}`, workspaceId: baseSnapshot.workspace.id, leadId: lead.id, contactId: lead.primaryContactId ?? null, userId: lead.ownerId, outcome, durationSeconds: 180, notes, transcript, recordingPath: null, startedAt: '2026-10-16T12:50:00.000Z', endedAt: '2026-10-16T12:53:00.000Z', createdAt: '2026-10-16T12:53:00.000Z' })

describe('RealTalent Agent — Live Sales Coach V1', () => {
  it('usa objeção financeira explícita da transcrição para orientar a próxima pergunta', () => {
    const result = buildLiveSalesCoach({ lead, snapshot: baseSnapshot, phase: 'during', transcript: 'O preço ficou caro para o nosso orçamento.', now })
    expect(result.signals.some((item) => item.kind === 'price' || item.kind === 'budget')).toBe(true)
    expect(result.recommendation.kind).toBe('clarify')
    expect(result.recommendation.suggestedQuestion).toMatch(/critério|valor|investimento/i)
  })

  it('separa o que o fluxo comercial já persiste depois de pedido de retorno', () => {
    const saved = call('callback_requested', '', 'Cliente pediu retorno amanhã.')
    const snapshot = { ...baseSnapshot, calls: [...baseSnapshot.calls, saved] }
    const result = buildLiveSalesCoach({ lead, snapshot, phase: 'after', call: saved, now })
    expect(result.signals.some((item) => item.kind === 'callback')).toBe(true)
    expect(result.postCall.persistedByCallOutcome.join(' ')).toMatch(/próximo passo|fluxo comercial/i)
    expect(result.recommendation.suggestedCapabilityId).toBeNull()
    expect(result.recommendation.title).toMatch(/retorno já agendado/i)
  })

  it('não fabrica objeção quando não há transcrição, nota ou desfecho específico', () => {
    const result = buildLiveSalesCoach({ lead, snapshot: baseSnapshot, phase: 'after', call: call('answered'), now })
    expect(result.signals).toHaveLength(0)
    expect(result.recommendation.reason).toMatch(/não há sinal explícito/i)
    expect(result.grounding).toMatch(/não inventa objeções/i)
  })

  it('contato incorreto leva a mapeamento de stakeholder sem inventar identidade', () => {
    const result = buildLiveSalesCoach({ lead, snapshot: baseSnapshot, phase: 'after', call: call('wrong_person'), now })
    expect(result.recommendation.kind).toBe('map_stakeholder')
    expect(result.recommendation.suggestedQuestion).toMatch(/quem.*decisão|aprovação/i)
    expect(result.signals.find((item) => item.kind === 'wrong_person')?.evidence).not.toMatch(/João|Maria|Carlos/)
  })

  it('solicitação de proposta recomenda validação sem alterar o CRM por leitura', () => {
    const before = lead.status
    const result = buildLiveSalesCoach({ lead, snapshot: baseSnapshot, phase: 'after', call: call('proposal_requested', 'Pode me mandar uma proposta?'), now })
    expect(result.recommendation.kind).toBe('proposal')
    expect(result.recommendation.suggestedCapabilityId).toBe('proposals.create')
    expect(lead.status).toBe(before)
  })

  it('texto livre sozinho não marca a oportunidade como ganha', () => {
    const before = lead.status
    const result = buildLiveSalesCoach({ lead, snapshot: baseSnapshot, phase: 'during', transcript: 'Acho que fechou, depois confirmamos.', outcome: 'answered', now })
    expect(result.signals.some((item) => item.kind === 'sale')).toBe(false)
    expect(lead.status).toBe(before)
  })

  it('publica as duas capacidades como leituras seguras', () => {
    expect(REALTALENT_UNIVERSAL_CAPABILITIES.find((item) => item.id === 'sales.live_call_coach')).toMatchObject({ action: 'read', risk: 'read', execution: 'native', permissionAction: 'view' })
    expect(REALTALENT_UNIVERSAL_CAPABILITIES.find((item) => item.id === 'sales.post_call_review')).toMatchObject({ action: 'read', risk: 'read', execution: 'native', permissionAction: 'view' })
  })

  it('lê a sessão ativa autosalva durante a ligação', async () => {
    const userId = lead.ownerId ?? 'user-live'
    const key = callSessionStorageKey(baseSnapshot.workspace.id, userId)
    const payload = JSON.stringify({ schemaVersion: CALL_SESSION_SCHEMA_VERSION, workspaceId: baseSnapshot.workspace.id, userId, leadId: lead.id, session: 'running', transcript: 'O preço ficou acima do nosso orçamento.', notes: 'Cliente comparando investimento.', outcome: 'answered', startedAt: '2026-10-16T12:59:00.000Z' })
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (item: string) => item === key ? payload : null } })
    try {
      expect(readActiveLiveCallSession(baseSnapshot.workspace.id, userId)?.leadId).toBe(lead.id)
      const result = await realTalentAiGateway.answer('o que digo agora?', baseSnapshot, { now, currentUserId: userId })
      expect(result.trace.providerId).toBe('sales-coaching:live-grounded-v1')
      expect(result.trace.sendsDataExternally).toBe(false)
      expect(result.answer.text).toMatch(/preço|orçamento|investimento/i)
    } finally {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
      else delete (globalThis as typeof globalThis & { localStorage?: unknown }).localStorage
    }
  })

  it('roteia revisão pós-ligação localmente sem provedor externo', async () => {
    const saved = call('wrong_person', 'Precisa falar com quem decide isso.')
    const snapshot = { ...baseSnapshot, calls: [...baseSnapshot.calls, saved] }
    const result = await realTalentAiGateway.answer(`analise a última ligação com ${lead.name}`, snapshot, { now, focusLeadId: lead.id })
    expect(result.trace.providerId).toBe('sales-coaching:live-grounded-v1')
    expect(result.trace.sendsDataExternally).toBe(false)
    expect(result.answer.text).toContain('Live Sales Coach')
  })

  it('formata claramente a base de verdade', () => {
    const text = formatLiveSalesCoach({ lead, snapshot: baseSnapshot, phase: 'during', transcript: 'O orçamento é uma preocupação.', now })
    expect(text).toContain('Próximo movimento:')
    expect(text).toContain('Sinais explícitos:')
    expect(text).toContain('Base de verdade:')
  })

  it('não recomenda criar outra proposta quando o desfecho já é proposta enviada', () => {
    const result = buildLiveSalesCoach({ lead, snapshot: { ...baseSnapshot, calls: [call('proposal_sent')] }, phase: 'after', now })
    expect(result.signals.some((signal) => signal.kind === 'proposal_sent')).toBe(true)
    expect(result.recommendation.title).toMatch(/proposta já enviada/i)
    expect(result.recommendation.suggestedCapabilityId).toBeNull()
    expect(result.postCall.persistedByCallOutcome.join(' ')).toMatch(/próximo passo/i)
  })

  it('expõe sugestão executável para pedido de proposta sem executar mutação', () => {
    const snapshot = { ...baseSnapshot, calls: [call('proposal_requested')] }
    const answer = buildLiveSalesCoachAssistantAnswer(`analise a última ligação de ${lead.company || lead.name}`, snapshot, { now, currentUserId: lead.ownerId })
    expect(answer?.executionSuggestion?.capabilityId).toBe('proposals.create')
    expect(answer?.executionSuggestion?.seed).toMatch(/crie uma proposta/i)
    expect(answer?.plan).toBeUndefined()
  })

  it('não oferece execução duplicada quando a reunião já foi salva pelo fluxo da ligação', () => {
    const snapshot = { ...baseSnapshot, calls: [call('meeting_scheduled')] }
    const answer = buildLiveSalesCoachAssistantAnswer(`revise a última ligação de ${lead.company || lead.name}`, snapshot, { now, currentUserId: lead.ownerId })
    expect(answer?.executionSuggestion).toBeNull()
    expect(answer?.text).toMatch(/reunião já agendada/i)
  })

})
