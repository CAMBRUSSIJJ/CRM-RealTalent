import { useEffect, useRef } from 'react'
import { isTopOverlay, registerOverlay } from './overlay-manager'

let overlayLockCount = 0
const DEFAULT_FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function visibleFocusable(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(DEFAULT_FOCUSABLE)].filter((element) => {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true' || element.closest('[hidden]')) return false
    return element.getClientRects().length > 0 || element === document.activeElement
  })
}

export function useOverlayDialog(open: boolean, id: string, onClose: () => void, focusSelector = '[data-autofocus], input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]') {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    return registerOverlay(id, () => closeRef.current(), true)
  }, [id, open])

  useEffect(() => {
    if (!open) return
    overlayLockCount += 1
    document.body.classList.add('overlay-open')
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const rootSelector = `[data-overlay-id="${CSS.escape(id)}"]`
    const frame = window.requestAnimationFrame(() => {
      const root = document.querySelector<HTMLElement>(rootSelector)
      if (!root || !isTopOverlay(id)) return
      if (!root.hasAttribute('tabindex')) root.tabIndex = -1
      ;(root.querySelector<HTMLElement>(focusSelector) ?? root).focus()
    })
    const onKey = (event: KeyboardEvent) => {
      if (!isTopOverlay(id)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const root = document.querySelector<HTMLElement>(rootSelector)
      if (!root) return
      const focusable = visibleFocusable(root)
      if (!focusable.length) {
        event.preventDefault()
        root.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!root.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      overlayLockCount = Math.max(0, overlayLockCount - 1)
      if (!overlayLockCount) document.body.classList.remove('overlay-open')
      if (previous?.isConnected) previous.focus()
    }
  }, [focusSelector, id, open])
}
