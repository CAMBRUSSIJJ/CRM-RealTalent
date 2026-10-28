import { describe, expect, it, vi } from 'vitest'
import { activeOverlayCount, closeTransientOverlays, isTopOverlay, registerOverlay, topOverlayId } from './overlay-manager'

describe('overlay stack regression', () => {
  it('only makes the last overlay active, restoring the previous layer after close', () => {
    const a=registerOverlay('drawer:one',vi.fn())
    const b=registerOverlay('modal:two',vi.fn())
    expect(isTopOverlay('modal:two')).toBe(true)
    expect(isTopOverlay('drawer:one')).toBe(false)
    expect(activeOverlayCount()).toBe(2)
    b();expect(topOverlayId()).toBe('drawer:one');a()
  })
  it('re-registering an overlay raises it above the stack', () => {
    const a=registerOverlay('modal:same',vi.fn())
    const b=registerOverlay('drawer:other',vi.fn())
    const c=registerOverlay('modal:same',vi.fn())
    expect(topOverlayId()).toBe('modal:same')
    c();expect(topOverlayId()).toBe('drawer:other');b();a()
  })
  it('closes transient overlays in reverse order while preserving permanent ones', () => {
    const seen:string[]=[]
    const a=registerOverlay('persistent:one',()=>seen.push('permanent'),false)
    const b=registerOverlay('drawer:two',()=>seen.push('drawer'))
    const c=registerOverlay('modal:three',()=>seen.push('modal'))
    closeTransientOverlays();expect(seen).toEqual(['modal','drawer'])
    c();b();a()
  })
  it('isolates close callback errors', () => {
    const a=registerOverlay('drawer:fails',()=>{throw Error('stale')})
    const b=registerOverlay('modal:works',vi.fn())
    expect(()=>closeTransientOverlays()).not.toThrow();b();a()
  })
})
