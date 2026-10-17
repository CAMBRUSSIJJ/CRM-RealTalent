import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allowedJobTypesForProvider, beginOAuthConnection, defaultJobTypeForProvider, loadIntegrationFramework } from './integration-framework'

describe('fundação de integrações V100.45', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('mantém uma allowlist específica para cada provedor', () => {
    expect(allowedJobTypesForProvider('google')).toContain('google_mail_pull')
    expect(allowedJobTypesForProvider('google')).not.toContain('microsoft_mail_pull')
    expect(defaultJobTypeForProvider('whatsapp_cloud')).toBe('whatsapp_account_sync')
  })

  it('delega OAuth local ao gateway real sem criar conta de demonstração', async () => {
    const workspaceId = crypto.randomUUID()
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/integrations/oauth/start')) {
        const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
        expect(body).toMatchObject({ provider: 'google', workspaceId, returnUrl: 'http://127.0.0.1:4188/' })
        return new Response(JSON.stringify({
          mode: 'oauth',
          url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test',
          message: 'OAuth real iniciado pelo gateway local.',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.includes('/api/integrations/accounts?workspaceId=')) {
        return new Response(JSON.stringify({ accounts: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`URL inesperada no teste: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await beginOAuthConnection(workspaceId, 'google')
    const state = await loadIntegrationFramework(workspaceId)

    expect(result).toMatchObject({ mode: 'oauth', url: expect.stringContaining('accounts.google.com') })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/(?:__rt\/communications|api\/runtime\/communications)\/api\/integrations\/oauth\/start$/),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(state.accounts).toHaveLength(0)
  })
})
