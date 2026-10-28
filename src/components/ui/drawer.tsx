import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { isTopOverlay, registerOverlay } from '../../app/overlay-manager'
import { IconButton } from './icon-button'

let drawerLockCount = 0

export function Drawer({ title, eyebrow, description, footer, onClose, className = '', children }: PropsWithChildren<{ title: string; eyebrow?: string; description?: string; footer?: ReactNode; onClose(): void; className?: string }>) {
  const drawerId = useId()
  const titleId = useId()
  const drawerRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => registerOverlay(`drawer:${drawerId}`, () => closeRef.current(), true), [drawerId])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const frame = window.requestAnimationFrame(() => {
      if (!isTopOverlay(`drawer:${drawerId}`)) return
      const first = drawerRef.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? drawerRef.current?.querySelector<HTMLElement>(focusableSelector)
      ;(first ?? drawerRef.current)?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(`drawer:${drawerId}`)) return
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && !element.closest('[hidden]') && element.getClientRects().length > 0)
      if (!focusable.length) { event.preventDefault(); drawerRef.current.focus(); return }
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (!drawerRef.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    drawerLockCount += 1
    document.body.classList.add('drawer-open')
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      drawerLockCount = Math.max(0, drawerLockCount - 1)
      if (drawerLockCount === 0) document.body.classList.remove('drawer-open')
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [drawerId])

  const content = <div className="rt-drawer-layer" data-overlay-id={`drawer:${drawerId}`}>
    <button type="button" className="rt-drawer-backdrop-v10172" aria-label="Fechar painel" onClick={() => closeRef.current()}/>
    <aside ref={drawerRef} tabIndex={-1} data-rt-primitive="drawer" className={`rt-drawer ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="rt-drawer__header">
        <div>{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<strong id={titleId}>{title}</strong>{description ? <small>{description}</small> : null}</div>
        <IconButton size="sm" onClick={() => closeRef.current()} aria-label="Fechar painel"><X size={18}/></IconButton>
      </header>
      <div className="rt-drawer__body">{children}</div>
      {footer ? <footer className="rt-drawer__footer">{footer}</footer> : null}
    </aside>
  </div>
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
