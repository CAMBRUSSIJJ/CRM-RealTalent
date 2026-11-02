import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkTask } from '../domain/types'

const gateway = vi.hoisted(() => ({
  loadGatewayWhatsAppQrStatus: vi.fn(),
  loadGatewayAccounts: vi.fn(),
  sendGatewayCommunication: vi.fn(),
}))
vi.mock('./local-communications-gateway', () => gateway)

import {
  checkTaskWhatsAppTestConnection,
  composeTaskWhatsAppTestMessage,
  eligibleTaskForOwnTest,
  normalizeTaskTestPhone,
  qrAccountForTaskTest,
  sendOwnTaskWhatsAppTest,
} from './task-reminder-whatsapp-test'

const task = {
  id: 'test-task-id', workspaceId: 'workspace-1', assigneeId: 'user-1',
  title: 'Preparar proposta comercial', priority: 'high', status: 'todo',
  dueAt: '2026-11-03T17:00:00Z',
} as WorkTask
const qrAccount = {
  id: 'qr-account-1', provider: 'whatsapp_cloud', status: 'connected',
  connectionMode: 'live', capabilities: { messages: true }, metadata: { transport: 'qr' },
}

beforeEach(() => {
  vi.clearAllMocks()
  gateway.loadGatewayWhatsAppQrStatus.mockResolvedValue({ state: 'connected', phone: '5551999999999' })
  gateway.loadGatewayAccounts.mockResolvedValue([qrAccount])
  gateway.sendGatewayCommunication.mockResolvedValue({ id: 'event-1', status: 'sent' })
})

describe('Teste WhatsApp de tarefa pelo CRM', () => {
  it('aceita somente telefone explícito em formato internacional', () => {
    expect(normalizeTaskTestPhone('+5551988887777')).toBe('5551988887777')
    expect(normalizeTaskTestPhone('51988887777')).toBe('5551988887777')
    expect(normalizeTaskTestPhone('+55 51 98888 7777')).toBe('5551988887777')
    expect(normalizeTaskTestPhone('55 51 98888-7777')).toBe('5551988887777')
    expect(normalizeTaskTestPhone('51 3888-7777')).toBe('555138887777')
    expect(normalizeTaskTestPhone('+0551988887777')).toBeNull()
    expect(normalizeTaskTestPhone('+12025550123')).toBeNull()
    expect(normalizeTaskTestPhone('')).toBeNull()
  })

  it('permite somente tarefa aberta atribuída ao usuário logado', () => {
    expect(eligibleTaskForOwnTest(task, 'user-1')).toBe(true)
    expect(eligibleTaskForOwnTest(task, 'user-2')).toBe(false)
    expect(eligibleTaskForOwnTest({ ...task, status: 'completed' }, 'user-1')).toBe(false)
  })

  it('não confunde conta Meta Cloud com sessão QR', () => {
    expect(qrAccountForTaskTest([{ ...qrAccount, metadata: { transport: 'cloud' } }] as never)).toBeNull()
    expect(qrAccountForTaskTest([{ ...qrAccount, status: 'revoked' }] as never)).toBeNull()
    expect(qrAccountForTaskTest([{ ...qrAccount, status: 'attention' }] as never)?.id).toBe('qr-account-1')
    expect(qrAccountForTaskTest([qrAccount] as never)?.id).toBe('qr-account-1')
  })

  it('informa bloqueio quando a sessão QR não está realmente conectada', async () => {
    gateway.loadGatewayWhatsAppQrStatus.mockResolvedValue({ state: 'disconnected', phone: '' })
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    expect(readiness.available).toBe(false)
    expect(readiness.accountId).toBeNull()
  })

  it('o status QR do gateway expõe accountId apenas para uma sessão conectada', () => {
    const source = readFileSync(new URL('../../scripts/whatsapp-browser-qr-bridge.mjs', import.meta.url), 'utf8')
    expect(source).toContain("accountId: s.state === 'connected' ? (s.accountId || null) : null")
    expect(source).toContain("session.accountId = account.id")
  })

  it('herda a identidade da sessão QR conectada sem depender da lista de contas', async () => {
    gateway.loadGatewayWhatsAppQrStatus.mockResolvedValue({ state: 'connected', phone: '5551999999999', accountId: 'qr-account-1' })
    gateway.loadGatewayAccounts.mockRejectedValue(new Error('Lista temporariamente indisponível'))
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    expect(readiness).toMatchObject({ available: true, accountId: 'qr-account-1' })
    expect(gateway.loadGatewayAccounts).not.toHaveBeenCalled()
  })

  it('aceita conta QR temporariamente marcada atenção se o status de sessão estiver conectado', async () => {
    gateway.loadGatewayAccounts.mockResolvedValue([{ ...qrAccount, status: 'attention' }])
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    expect(readiness).toMatchObject({ available: true, accountId: 'qr-account-1' })
  })

  it('não usa número memorizado quando a sessão não está de fato conectada', async () => {
    gateway.loadGatewayWhatsAppQrStatus.mockResolvedValue({ state: 'starting', phone: '5551999999999', accountId: null })
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    expect(readiness.available).toBe(false)
    expect(readiness.senderPhone).toBe('')
    expect(readiness.message).toMatch(/reconectando/)
  })

  it('não inventa conta de envio se a sessão estiver conectada mas não tiver identificação', async () => {
    gateway.loadGatewayAccounts.mockResolvedValue([{ ...qrAccount, metadata: { transport: 'cloud' } }])
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    expect(readiness.available).toBe(false)
    expect(readiness.accountId).toBeNull()
    expect(readiness.message).toMatch(/conta de envio/)
  })

  it('ignora resposta de contas se a identidade autenticada vem da sessão QR', async () => {
    gateway.loadGatewayWhatsAppQrStatus.mockResolvedValue({ state: 'connected', phone: '5551999999999', accountId: 'qr-account-1' })
    gateway.loadGatewayAccounts.mockResolvedValue([{ ...qrAccount, id: 'unrelated-cloud', metadata: { transport: 'cloud' } }])
    const result = await checkTaskWhatsAppTestConnection('workspace-1')
    expect(result.accountId).toBe('qr-account-1')
    expect(gateway.loadGatewayAccounts).not.toHaveBeenCalled()
  })

  it('permite teste com DDD sem código do país e envia no formato normalizado', async () => {
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    const result = await sendOwnTaskWhatsAppTest({ workspaceId: 'workspace-1', userId: 'user-1', task, phone: '(51) 98888-7777', explicitConsent: true, readiness })
    expect(result.recipientPhone).toBe('5551988887777')
    expect(gateway.sendGatewayCommunication).toHaveBeenCalledWith(expect.objectContaining({ recipient: '5551988887777' }))
  })

  it('gera texto de teste com prazo e sem simular envio agendado', () => {
    const message = composeTaskWhatsAppTestMessage(task)
    expect(message).toContain('TESTE')
    expect(message).toContain('Preparar proposta comercial')
    expect(message).toContain('Alta')
    expect(message).toMatch(/não há lembretes automáticos ativados/i)
  })

  it('não envia para outro responsável nem para outro workspace', async () => {
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    await expect(sendOwnTaskWhatsAppTest({ workspaceId: 'workspace-1', userId: 'user-2', task, phone: '+5551988887777', explicitConsent: true, readiness })).rejects.toThrow(/atribuída a você/)
    await expect(sendOwnTaskWhatsAppTest({ workspaceId: 'workspace-2', userId: 'user-1', task, phone: '+5551988887777', explicitConsent: true, readiness })).rejects.toThrow(/atribuída a você/)
    expect(gateway.sendGatewayCommunication).not.toHaveBeenCalled()
  })

  it('recusa envio sem consentimento ou telefone válido', async () => {
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    await expect(sendOwnTaskWhatsAppTest({ workspaceId: 'workspace-1', userId: 'user-1', task, phone: '+5551988887777', explicitConsent: false, readiness })).rejects.toThrow(/autoriza/)
    await expect(sendOwnTaskWhatsAppTest({ workspaceId: 'workspace-1', userId: 'user-1', task, phone: '123', explicitConsent: true, readiness })).rejects.toThrow(/número brasileiro/)
    expect(gateway.sendGatewayCommunication).not.toHaveBeenCalled()
  })

  it('envia apenas uma mensagem por ação explícita, pelo mesmo QR do CRM', async () => {
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    const res = await sendOwnTaskWhatsAppTest({ workspaceId: 'workspace-1', userId: 'user-1', task, phone: '+5551988887777', explicitConsent: true, readiness })
    expect(res).toMatchObject({ status: 'accepted', recipientPhone: '5551988887777', senderPhone: '5551999999999' })
    expect(gateway.sendGatewayCommunication).toHaveBeenCalledTimes(1)
    expect(gateway.sendGatewayCommunication).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1', channel: 'whatsapp', accountId: 'qr-account-1',
      recipient: '5551988887777', leadId: null,
      idempotencyKey: expect.stringMatching(/^task-whatsapp-manual-test:test-task-id:/),
    }))
  })

  it('nunca informa entrega quando o gateway apenas enfileirou a mensagem', async () => {
    gateway.sendGatewayCommunication.mockResolvedValue({ id: 'event-2', status: 'queued' })
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    const res = await sendOwnTaskWhatsAppTest({ workspaceId: 'workspace-1', userId: 'user-1', task, phone: '+5551988887777', explicitConsent: true, readiness })
    expect(res.status).toBe('queued')
  })

  it('bloqueia se a conexão mudar entre a consulta e o envio', async () => {
    const readiness = await checkTaskWhatsAppTestConnection('workspace-1')
    gateway.loadGatewayWhatsAppQrStatus.mockResolvedValue({ state: 'disconnected', phone: '' })
    await expect(sendOwnTaskWhatsAppTest({ workspaceId: 'workspace-1', userId: 'user-1', task, phone: '+5551988887777', explicitConsent: true, readiness })).rejects.toThrow(/desconectou/)
    expect(gateway.sendGatewayCommunication).not.toHaveBeenCalled()
  })
})
