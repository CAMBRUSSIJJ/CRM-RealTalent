import { describe, expect, it } from 'vitest'
import { CRM_CAPABILITIES, crmCapabilityCatalogForModel } from './realtalent-crm-capabilities'

const e2eEnabled = process.env.REALTALENT_OLLAMA_E2E === '1'
const agentUrl = String(process.env.REALTALENT_AGENT_TEST_URL || 'http://127.0.0.1:8791').replace(/\/$/, '')

const argMap = (step: any) => new Map(
  (Array.isArray(step?.args) ? step.args : []).map((item: any) => [String(item?.name || ''), String(item?.value ?? '')]),
)

const plan = async (prompt: string) => {
  const response = await fetch(`${agentUrl}/capabilities/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      context: {
        now: '2026-10-15T18:30:00-03:00',
        timezone: 'America/Sao_Paulo',
        currentRoute: '/goals',
        conversation_context: [],
      },
      capabilities: crmCapabilityCatalogForModel(),
    }),
  })
  const body = await response.json().catch(() => ({})) as any
  if (!response.ok) throw new Error(`Planner HTTP ${response.status}: ${body?.error || 'erro desconhecido'}`)
  return body
}

describe('RealTalent Agent — contrato real Meta + Agenda', () => {
  it('mantém goals.create e calendar.create no catálogo nativo real', () => {
    const goal = CRM_CAPABILITIES.find((item) => item.id === 'goals.create')
    const meeting = CRM_CAPABILITIES.find((item) => item.id === 'calendar.create')

    expect(goal).toBeTruthy()
    expect(goal?.execution).toBe('native')
    expect(goal?.argumentHints).toEqual(expect.arrayContaining(['metric', 'target_value', 'period_start', 'period_end']))

    expect(meeting).toBeTruthy()
    expect(meeting?.execution).toBe('native')
    expect(meeting?.argumentHints).toEqual(expect.arrayContaining(['title', 'starts_at', 'ends_at', 'record_query', 'contact_query']))

    const ids = crmCapabilityCatalogForModel().map((item) => item.id)
    expect(ids).toContain('goals.create')
    expect(ids).toContain('calendar.create')
  })

  it.runIf(e2eEnabled)('usa Ollama de verdade como provider do Agent', async () => {
    const response = await fetch(`${agentUrl}/health`)
    const health = await response.json() as any
    expect(response.ok).toBe(true)
    expect(health?.provider).toBe('ollama')
    expect(health?.ai?.provider).toBe('ollama')
    expect(health?.ai?.local?.online).toBe(true)
  })

  it.runIf(e2eEnabled)('entende meta natural usando o catálogo real', async () => {
    const result = await plan('meta de 40 ligações para amanhã')
    const step = result?.steps?.[0]
    expect(step?.capabilityId).toBe('goals.create')
    const args = argMap(step)
    expect(args.get('metric')).toBe('calls')
    expect(args.get('target_value')).toBe('40')
    expect(args.get('period_start')).toBe('2026-10-16')
    expect(args.get('period_end')).toBe('2026-10-16')
  }, 120_000)

  it.runIf(e2eEnabled)('entende reunião natural mesmo estando na rota de Metas', async () => {
    const result = await plan('marque uma reunião para amanhã às 14:00 com cliente oculto')
    const step = result?.steps?.[0]
    expect(step?.capabilityId).toBe('calendar.create')
    const args = argMap(step)
    expect(args.get('starts_at') || '').toMatch(/2026-10-16.*14:00/)
    const recordQuery = args.get('record_query') || args.get('contact_query') || args.get('lead_query') || ''
    expect(recordQuery.toLowerCase()).toContain('oculto')
  }, 120_000)
})
