import { describe, expect, it } from 'vitest'
import { buildBrowserCaptureBookmarklet, captureDraftFromBrowserPayload, parseUniversalCaptureInput, prospectSourceLabels } from './prospecting-workspace'

describe('V101.9.9-H3 browser-independent prospecting capture', () => {
  it('renames the extension source to a browser-neutral label', () => expect(prospectSourceLabels.extension).toBe('RT Capture Browser'))
  it('recognizes Google Maps URLs', () => {
    const draft = captureDraftFromBrowserPayload({ url: 'https://www.google.com/maps/place/Barbearia+Alpha/data=x', title: 'Barbearia Alpha - Google Maps' })
    expect(draft?.source).toBe('maps'); expect(draft?.company).toContain('Barbearia Alpha')
  })
  it('recognizes Instagram URLs', () => {
    const draft = captureDraftFromBrowserPayload({ url: 'https://www.instagram.com/barbearia.alpha/', title: 'Barbearia Alpha • Instagram' })
    expect(draft?.source).toBe('instagram'); expect(draft?.instagram).toContain('instagram.com')
  })
  it('accepts generic URLs without an extension', () => expect(parseUniversalCaptureInput('https://alpha.com.br')[0]?.website).toBe('https://alpha.com.br'))
  it('builds a bookmarklet that returns to the local CRM prospecting route', () => {
    const value = buildBrowserCaptureBookmarklet('http://127.0.0.1:4188')
    expect(value.startsWith('javascript:')).toBe(true); expect(value).toContain('#/prospecting?action=browser-capture')
  })
})
