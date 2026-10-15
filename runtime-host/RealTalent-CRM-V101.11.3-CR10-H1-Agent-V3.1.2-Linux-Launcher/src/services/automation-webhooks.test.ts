import { beforeEach, describe, expect, it } from 'vitest'
import { dispatchAutomationWebhook, loadWebhookState, saveWebhook, validateWebhookInput } from './automation-webhooks'

describe('automation webhooks', () => {
  beforeEach(() => localStorage.clear())

  it('exige HTTPS para destinos externos', () => {
    const errors = validateWebhookInput({ name: 'Teste', url: 'http://example.com/hook', method: 'POST', enabled: true, secretToken: '', timeoutSeconds: 10, maxAttempts: 3, headers: {} })
    expect(errors).toContain('Webhooks externos devem utilizar HTTPS.')
  })

  it('permite localhost e simula entregas no modo local', async () => {
    const workspaceId = crypto.randomUUID()
    const endpoint = await saveWebhook(workspaceId, { name: 'Local', url: 'http://localhost:4000/hook', method: 'POST', enabled: true, secretToken: 'secret', timeoutSeconds: 10, maxAttempts: 3, headers: { 'x-team': 'sales' } })
    const delivery = await dispatchAutomationWebhook({ workspaceId, webhookId: endpoint.id, runId: null, rule: null, lead: null, eventType: 'lead_created', correlationId: 'corr:test' })
    expect(delivery.status).toBe('simulated')
    const state = await loadWebhookState(workspaceId)
    expect(state.endpoints).toHaveLength(1)
    expect(state.deliveries).toHaveLength(1)
  })
})
