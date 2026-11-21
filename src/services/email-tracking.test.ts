import { describe, expect, it } from 'vitest'
import { buildTrackedHtml, trackingSignature, verifyTrackingSignature } from '../../supabase/functions/_shared/email-tracking'

describe('rastreio de e-mail', () => {
  const secret = 'x'.repeat(40)
  it('assina e confere; outra URL não passa', async () => {
    const signature = await trackingSignature(secret, 'e1|click|https://a.com')
    expect(await verifyTrackingSignature(secret, 'e1|click|https://a.com', signature)).toBe(true)
    expect(await verifyTrackingSignature(secret, 'e1|click|https://malicioso.com', signature)).toBe(false)
  })
  it('texto vira HTML com link rastreado, pixel e escape', async () => {
    const html = await buildTrackedHtml({ text: 'Veja https://site.com/a?b=1 <agora>', html: '', eventId: 'e1', base: 'https://fn/email-track', secret })
    expect(html).toContain('href="https://fn/email-track?e=e1&amp;k=c&amp;u=https%3A%2F%2Fsite.com%2Fa%3Fb%3D1')
    expect(html).toContain('&lt;agora&gt;')
    expect(html).toContain('k=o&amp;s=')
  })
  it('HTML existente tem os links trocados', async () => {
    const html = await buildTrackedHtml({ text: '', html: '<p><a href="https://x.com">x</a></p>', eventId: 'e2', base: 'https://fn/t', secret })
    expect(html).not.toContain('href="https://x.com"')
    expect(html).toContain('u=https%3A%2F%2Fx.com')
  })
})
