import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { isTopOverlay, registerOverlay } from '../../app/overlay-manager'
import { IconButton } from './icon-button'

interface ModalProps {
  open: boolean
  title: string
  subtitle?: string
  footer?: ReactNode
  headerActions?: ReactNode
  onClose(): void
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const EXIT_DURATION_MS = 180
let modalLockCount = 0
export function Modal({ open, title, subtitle, footer, headerActions, onClose, size = 'md', children }: PropsWithChildren<ModalProps>) {
  const titleId = useId()
  const subtitleId = useId()
  const modalId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const timer = window.setTimeout(() => { setMounted(false); setClosing(false) }, EXIT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [mounted, open])


  useEffect(() => {
    if (!open) return
    return registerOverlay(`modal:${modalId}`, () => closeRef.current(), true)
  }, [modalId, open])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const frame = window.requestAnimationFrame(() => {
      if (!isTopOverlay(`modal:${modalId}`)) return
      const preferred = dialogRef.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
      const bodyFocusable = dialogRef.current?.querySelector<HTMLElement>(`.modal__body ${focusableSelector}`)
      const footerFocusable = dialogRef.current?.querySelector<HTMLElement>(`.modal__footer ${focusableSelector}`)
      const fallbackFocusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])].find((element) => !element.hasAttribute('data-modal-close'))
      ;(preferred ?? bodyFocusable ?? footerFocusable ?? fallbackFocusable ?? dialogRef.current)?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(`modal:${modalId}`)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && !element.closest('[hidden]') && element.getClientRects().length > 0)
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return }
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (!dialogRef.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [modalId, open])

  useEffect(() => {
    if (!open) return
    modalLockCount += 1
    document.body.classList.add('modal-open')
    return () => {
      modalLockCount = Math.max(0, modalLockCount - 1)
      if (modalLockCount === 0) document.body.classList.remove('modal-open')
    }
  }, [open])

  if (!mounted) return null
  const content = (
    <div data-overlay-id={`modal:${modalId}`} className={`modal-backdrop ${closing ? 'is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (open && isTopOverlay(`modal:${modalId}`) && event.target === event.currentTarget) closeRef.current() }}>
      <section ref={dialogRef} tabIndex={-1} data-rt-primitive="dialog" className={`rt-dialog modal modal--${size} ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined}>
        <header className="modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
          </div>
          <div className="modal__header-actions">
            {headerActions}
            <IconButton data-modal-close onClick={() => closeRef.current()} aria-label="Fechar"><X size={20} /></IconButton>
          </div>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </section>
    </div>
  )
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
