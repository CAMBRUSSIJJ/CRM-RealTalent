type OverlayCloser = () => void

interface OverlayEntry {
  id: string
  close: OverlayCloser
  transient: boolean
}

const overlays = new Map<string, OverlayEntry>()
let closing = false

// Single stacking plane for registered portals. Selection menus are at 13550,
// toast notifications at 14000; regular nested dialogs stay below them.
function syncOverlayLayers() {
  if (typeof document === 'undefined') return
  const elements = new Map([...document.querySelectorAll<HTMLElement>('[data-overlay-id]')].map((node) => [node.dataset.overlayId, node] as const))
  let rank = 0
  for (const item of overlays.values()) {
    const root = elements.get(item.id)
    if (root) root.style.zIndex = String(13200 + 10 * rank)
    rank += 1
  }
}

export function registerOverlay(id: string, close: OverlayCloser, transient = true) {
  // Re-registering an overlay must move it to the top of the logical stack.
  overlays.delete(id)
  overlays.set(id, { id, close, transient })
  syncOverlayLayers()
  return () => { overlays.delete(id); syncOverlayLayers() }
}

export function unregisterOverlay(id: string) {
  overlays.delete(id)
  syncOverlayLayers()
}

export function closeTransientOverlays() {
  if (closing) return
  closing = true
  try {
    const entries = [...overlays.values()].filter((entry) => entry.transient).reverse()
    entries.forEach((entry) => {
      try { entry.close() } catch { /* overlay cleanup must never break navigation */ }
    })
  } finally {
    closing = false
  }
}

export function activeOverlayCount() {
  return overlays.size
}

export function isTopOverlay(id: string) {
  return [...overlays.keys()].at(-1) === id
}

export function topOverlayId() {
  return [...overlays.keys()].at(-1) ?? null
}
