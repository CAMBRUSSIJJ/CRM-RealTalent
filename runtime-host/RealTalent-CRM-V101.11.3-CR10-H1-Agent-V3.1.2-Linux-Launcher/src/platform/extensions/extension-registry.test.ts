import { describe, expect, it } from 'vitest'
import { extensionCommandRegistry, extensionRegistry, isExtensionFeatureEnabled, listRegisteredIntegrationScopes } from '.'

describe('V101.9.7 Extension Registry', () => {
  it('registra providers nativos sem duplicidade', () => {
    const manifests = extensionRegistry.list()
    expect(manifests.map((item) => item.providerId)).toEqual(expect.arrayContaining(['google', 'microsoft', 'meta', 'whatsapp_cloud', 'realtalent_connect', 'realtalent_capture']))
    expect(new Set(manifests.map((item) => item.id)).size).toBe(manifests.length)
    expect(new Set(manifests.map((item) => item.providerId)).size).toBe(manifests.length)
  })

  it('deriva scopes e commands a partir dos manifests', () => {
    const scopes = listRegisteredIntegrationScopes().map((item) => item.id)
    expect(scopes).toContain('gmail.send')
    expect(scopes).toContain('Mail.Send')
    expect(scopes).toContain('whatsapp_business_messaging')
    expect(extensionCommandRegistry.get('google.sync.mail')?.command.jobType).toBe('google_mail_pull')
    expect(extensionCommandRegistry.get('realtalent_connect.call')?.extensionId).toBe('realtalent-connect')
  })

  it('mantém feature flags determinísticas por padrão', () => {
    expect(isExtensionFeatureEnabled('google-workspace', 'mail_sync')).toBe(true)
    expect(isExtensionFeatureEnabled('realtalent-connect', 'one_tap_ios')).toBe(true)
    expect(isExtensionFeatureEnabled('realtalent-capture', 'guided_review')).toBe(true)
  })
})
