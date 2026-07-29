import { beforeEach, describe, expect, it } from 'vitest'
import { allowedJobTypesForProvider, beginOAuthConnection, defaultJobTypeForProvider, loadIntegrationFramework } from './integration-framework'

describe('fundação de integrações V100.45', () => {
  beforeEach(() => localStorage.clear())

  it('mantém uma allowlist específica para cada provedor', () => {
    expect(allowedJobTypesForProvider('google')).toContain('google_mail_pull')
    expect(allowedJobTypesForProvider('google')).not.toContain('microsoft_mail_pull')
    expect(defaultJobTypeForProvider('whatsapp_cloud')).toBe('whatsapp_account_sync')
  })

  it('identifica conexão local como demonstração sem credencial', async () => {
    const workspaceId = crypto.randomUUID()
    const result = await beginOAuthConnection(workspaceId, 'google')
    const state = await loadIntegrationFramework(workspaceId)
    expect(result.mode).toBe('local')
    expect(state.accounts[0]).toMatchObject({ status: 'demo', connectionMode: 'demo', hasCredential: false })
  })
})
