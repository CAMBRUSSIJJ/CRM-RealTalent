import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadAutomationOperations, markContactDraft, markSellerNotification, recordContactDraft, recordSellerNotification,
} from './automation-operations'

describe('automation operations', () => {
  beforeEach(() => localStorage.clear())

  it('registra avisos e mensagens assistidas sem duplicar a mesma execução', async () => {
    const workspaceId = crypto.randomUUID()
    const leadId = crypto.randomUUID()
    const notification = { workspaceId, userId: null, leadId, title: 'Lead preparado', body: 'Pronto para contato.', severity: 'success' as const, actionRoute: 'automations', sourceType: 'automation', sourceId: 'run-1' }
    const draft = { workspaceId, leadId, channel: 'whatsapp' as const, subject: '', message: 'Olá, tudo bem?', sourceType: 'automation', sourceId: 'run-1' }
    await recordSellerNotification(notification)
    await recordSellerNotification(notification)
    await recordContactDraft(draft)
    await recordContactDraft(draft)
    const state = await loadAutomationOperations(workspaceId)
    expect(state.notifications).toHaveLength(1)
    expect(state.drafts).toHaveLength(1)
  })

  it('marca aviso como lido e rascunho como utilizado', async () => {
    const workspaceId = crypto.randomUUID()
    const leadId = crypto.randomUUID()
    await recordSellerNotification({ workspaceId, userId: null, leadId, title: 'Aviso', body: '', severity: 'info', actionRoute: 'automations', sourceType: 'test', sourceId: 'one' })
    await recordContactDraft({ workspaceId, leadId, channel: 'email', subject: 'Contato', message: 'Mensagem', sourceType: 'test', sourceId: 'one' })
    let state = await loadAutomationOperations(workspaceId)
    await markSellerNotification(workspaceId, state.notifications[0].id)
    await markContactDraft(workspaceId, state.drafts[0].id)
    state = await loadAutomationOperations(workspaceId)
    expect(state.notifications[0].status).toBe('read')
    expect(state.drafts[0].status).toBe('used')
  })
})
